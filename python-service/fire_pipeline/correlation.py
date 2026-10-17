"""Correlate a community-submitted fire report against the current live
satellite hotspot markers (from `live.load_live_hotspots()`).

This is deliberately looser than `matching.match_modis_viirs()`, which
pairs MODIS/VIIRS detections within 10km / 60 minutes: that matcher links
two independent SATELLITE sensors, both of which geolocate and timestamp
a detection with instrument-grade precision. A community report's location
and time are nowhere near that precise -- a phone's GPS fix, a street
address, a "I saw smoke around sunset" timestamp, a report filed hours
after observation -- so a reporter standing a few kilometers from the
actual fire, or describing "this afternoon" for something satellites
timestamped at a specific minute, is normal and expected, not noise to be
filtered out. Using the strict 10km/60min thresholds here would silently
drop plausible real-world correlations. 5km / 24 hours is a deliberately
generous window sized for human-reported location/timing error, not
satellite-to-satellite precision.

Also unlike match_modis_viirs() (a strict one-to-one greedy matcher),
correlate_report() is intentionally one-to-many: a single report can
plausibly correlate with several nearby/recent detections (e.g. multiple
sensor passes over the same burning area), so every marker within the
window is returned, not just the nearest one. This never changes the
report's `status` -- recording candidate satellite correlations is a
mechanical step; promoting a report to "satellite_matched" (or any other
status) stays an explicit human/operator decision via
PATCH /api/reports/{id}.
"""

from __future__ import annotations

from datetime import datetime, timezone

from .matching import haversine_km

CORRELATION_RADIUS_KM = 5.0
CORRELATION_TIME_WINDOW_MINUTES = 24 * 60  # 24 hours


def _parse_timestamp(value) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def correlate_report(
    report: dict,
    live_markers: list[dict],
    radius_km: float = CORRELATION_RADIUS_KM,
    time_minutes: float = CORRELATION_TIME_WINDOW_MINUTES,
) -> list[dict]:
    """Find every live marker within `radius_km` (haversine) AND
    `time_minutes` of `report`.

    `report` needs `lat`, `lon`, `observed_at` (ISO timestamp, string or
    datetime). `live_markers` is the `markers` list from
    `live.load_live_hotspots()` (each with `id`, `lat`, `lng`,
    `acquiredAt`, `sensor`, `matchStatus`, `frp`, ...).

    Returns a list (one entry per matching marker, nearest first) of::

        {"markerId": ..., "distanceKm": ..., "timeDiffMin": ...,
         "sensor": ..., "matchStatus": ..., "frp": ...}

    Does NOT mutate `report` or decide its status -- see module docstring.
    A marker with a missing/unparseable `acquiredAt` is skipped rather than
    raising, since a single malformed live marker shouldn't fail the whole
    correlation pass.
    """
    observed_at = _parse_timestamp(report["observed_at"])
    lat = float(report["lat"])
    lon = float(report["lon"])

    links = []
    for marker in live_markers:
        acquired_at_raw = marker.get("acquiredAt")
        if not acquired_at_raw:
            continue
        try:
            acquired_at = _parse_timestamp(acquired_at_raw)
        except (ValueError, TypeError):
            continue

        distance_km = float(haversine_km(lat, lon, marker["lat"], marker["lng"]))
        time_diff_min = abs((observed_at - acquired_at).total_seconds()) / 60.0
        if distance_km <= radius_km and time_diff_min <= time_minutes:
            links.append(
                {
                    "markerId": marker.get("id"),
                    "distanceKm": round(distance_km, 3),
                    "timeDiffMin": round(time_diff_min, 1),
                    "sensor": marker.get("sensor"),
                    "matchStatus": marker.get("matchStatus"),
                    "frp": marker.get("frp"),
                }
            )

    return sorted(links, key=lambda link: link["distanceKm"])
