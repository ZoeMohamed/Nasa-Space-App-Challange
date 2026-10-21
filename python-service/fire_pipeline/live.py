from __future__ import annotations

import os
import threading
from dataclasses import dataclass, field
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from io import StringIO
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

from .admin_lookup import get_admin_index
from .clean import add_quality_flags, confidence_tier, deduplicate_detections, harmonize, high_confidence_mask, usable_confidence_mask
from .features import aggregate_grid, attention_features, temporal_features
from .harmonize_events import (
    VIIRS_CROSS_SATELLITE_KM,
    VIIRS_CROSS_SATELLITE_MINUTES,
    build_harmonized_events,
    collapse_viirs_cross_satellite,
    deduplicated_event_keys,
    viirs_platform,
)
from .matching import haversine_km, match_modis_viirs
from .model import deterministic_priority, historical_baseline

FIRMS_API_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
INDONESIA_BOUNDS = "95,-11,141,6"
CACHE_SECONDS = 5 * 60
REQUEST_TIMEOUT_SECONDS = 20
# urlopen's timeout only bounds each socket read, so a slowly trickling FIRMS response could hold
# a window lock indefinitely (observed 2026-10-20); cap the whole download per request too.
DOWNLOAD_DEADLINE_SECONDS = 90
FETCH_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 1
# FIRMS's "/1" day-range parameter is a processing-day bucket, not "last 24h
# from now" -- VIIRS NRT in particular lags behind MODIS and is often still
# empty for day-range=1 even though same-day detections exist once the
# bucket closes (confirmed directly against the FIRMS API: /1 returned 0
# VIIRS_SNPP_NRT rows for Indonesia while /2 returned 8514, with "h"
# confidence rows as recent as a few hours old). We request a 2-day bucket
# to absorb that lag, then filter to the real last-24h window ourselves
# (see _within_last_24h) so the advertised `windowHours: 24` stays accurate
# regardless of upstream bucket latency.
FETCH_DAY_RANGE = 2
WINDOW_HOURS = 24
# Selectable analysis windows (TopBar "Time Range"). 24h keeps the original
# single-request path above. Longer windows are fetched as date-anchored
# chunks because the FIRMS area API only accepts DAY_RANGE 1..5 (confirmed
# 2026-10-20: /7 -> "Invalid day range. Expects [1..5]"); `/{n}/{YYYY-MM-DD}`
# returns acq_date in [date, date+n-1].
WINDOW_HOURS_BY_KEY = {"24h": 24, "7d": 7 * 24, "30d": 30 * 24}
FIRMS_MAX_DAY_RANGE = 5
# Chunks are anchored backwards from today (UTC) so the 7d window's chunks
# are a subset of the 30d window's and get reused from the chunk cache.
CHUNK_TTL_RECENT_SECONDS = 5 * 60
CHUNK_TTL_PAST_SECONDS = 3 * 60 * 60
SOURCES = (
    ("MODIS_NRT", "MODIS"),
    ("VIIRS_SNPP_NRT", "VIIRS"),
    ("VIIRS_NOAA20_NRT", "VIIRS"),
    ("VIIRS_NOAA21_NRT", "VIIRS"),
)


class LiveDataError(RuntimeError):
    pass


def default_historical_db_path() -> str:
    """Path to the offline historical SQLite store (see
    scripts/build_historical_store.py). Overridable via
    FIRE_HISTORICAL_DB_PATH (used by tests); resolved fresh on every call
    so an override set after import still takes effect.
    """
    override = os.getenv("FIRE_HISTORICAL_DB_PATH")
    if override:
        return override
    return os.path.join(os.path.dirname(__file__), "..", "data", "historical.sqlite")


_cache_lock = threading.Lock()
_cache: tuple[float, tuple[list[pd.DataFrame], list[dict]]] | None = None
# Serializes 24 h FIRMS fetches; _refresh_thread is the background refresh started for a stale cache.
_fetch_24h_lock = threading.Lock()
_refresh_thread: threading.Thread | None = None
# Last built 7d/30d result per (window, include_all_confidence) and its background refresh thread.
_window_results: dict[tuple[str, bool], tuple[float, "LiveResult"]] = {}
_window_refresh_threads: dict[tuple[str, bool], threading.Thread] = {}
# After a refresh in which every feed failed, keep serving the old data and retry after this long.
FAILED_REFRESH_RETRY_SECONDS = 60
_window_locks = {key: threading.Lock() for key in WINDOW_HOURS_BY_KEY}
_chunk_cache_lock = threading.Lock()
_chunk_cache: dict[tuple[str, str, int], tuple[float, pd.DataFrame, dict]] = {}
# Processed 7d/30d results keyed by the identity of the cached chunk frames they were built from:
# match_modis_viirs() takes ~20-30 s on a 7d window, so every page load re-running it on
# unchanged chunks would make navigation unusable. A refetched chunk is a new object -> rebuild.
_processed_cache: dict[tuple[str, bool], tuple[tuple[int, ...], "LiveResult"]] = {}
_processed_lock = threading.Lock()


def chunk_plan(window_hours: int, today) -> list[tuple[str, int]]:
    """(start_date, day_range) chunks covering the window plus one buffer day
    (VIIRS NRT lag / UTC day edges), anchored backwards from `today` (UTC)."""
    days_needed = window_hours // 24 + 1
    plan = []
    covered = 0
    while covered < days_needed:
        end = today - pd.Timedelta(days=covered)
        start = end - pd.Timedelta(days=FIRMS_MAX_DAY_RANGE - 1)
        plan.append((start.strftime("%Y-%m-%d"), FIRMS_MAX_DAY_RANGE))
        covered += FIRMS_MAX_DAY_RANGE
    return plan


def _fetch_chunk_cached(map_key: str, source_id: str, sensor: str, start_date: str, day_range: int, today) -> tuple[pd.DataFrame, dict]:
    cache_key = (source_id, start_date, day_range)
    now = time.monotonic()
    with _chunk_cache_lock:
        hit = _chunk_cache.get(cache_key)
        if hit and hit[0] > now:
            return hit[1], hit[2]
    frame, summary = _fetch_source(map_key, source_id, sensor, day_range=day_range, start_date=start_date)
    chunk_end = pd.Timestamp(start_date) + pd.Timedelta(days=day_range - 1)
    recent = chunk_end >= today - pd.Timedelta(days=1)
    ttl = CHUNK_TTL_RECENT_SECONDS if recent else CHUNK_TTL_PAST_SECONDS
    with _chunk_cache_lock:
        _chunk_cache[cache_key] = (time.monotonic() + ttl, frame, summary)
    return frame, summary


def _fetch_extended_window(map_key: str, window_hours: int) -> tuple[list[pd.DataFrame], list[dict]]:
    today = pd.Timestamp.now(tz="UTC").tz_localize(None).normalize()
    plan = chunk_plan(window_hours, today)
    jobs = [(source_id, sensor, start, n) for source_id, sensor in SOURCES for start, n in plan]
    frames: list[pd.DataFrame] = []
    per_source = {
        source_id: {"id": source_id, "sensor": sensor, "rawCount": 0, "highConfidenceCount": 0, "usableConfidenceCount": 0, "ok": 0, "failed": 0, "failedRanges": []}
        for source_id, sensor in SOURCES
    }
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {
            executor.submit(_fetch_chunk_cached, map_key, source_id, sensor, start, n, today): (source_id, start, n)
            for source_id, sensor, start, n in jobs
        }
        for future in as_completed(futures):
            source_id, start, n = futures[future]
            entry = per_source[source_id]
            try:
                frame, summary = future.result()
            except LiveDataError:
                entry["failed"] += 1
                # Which acquisition dates are missing, so callers (e.g. the calendar) can mark exactly
                # those days incomplete instead of presenting a gap as low activity.
                end = (pd.Timestamp(start) + pd.Timedelta(days=n - 1)).strftime("%Y-%m-%d")
                entry["failedRanges"].append([start, end])
                continue
            frames.append(frame)
            entry["ok"] += 1
            entry["rawCount"] += summary["rawCount"]
            entry["highConfidenceCount"] += summary["highConfidenceCount"]
            entry["usableConfidenceCount"] += summary.get("usableConfidenceCount", 0)
    summaries = []
    for source_id, _ in SOURCES:
        entry = per_source[source_id]
        summary = {k: entry[k] for k in ("id", "sensor", "rawCount", "highConfidenceCount", "usableConfidenceCount")}
        summary["available"] = entry["failed"] == 0
        if entry["failed"]:
            summary["error"] = f"{entry['failed']} of {entry['ok'] + entry['failed']} periods unavailable"
            summary["failedRanges"] = sorted(entry["failedRanges"])
        summaries.append(summary)
    return frames, summaries


class _DownloadDeadlineExceeded(Exception):
    pass


def _read_with_deadline(request: Request) -> str:
    deadline = time.monotonic() + DOWNLOAD_DEADLINE_SECONDS
    parts = []
    with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        while True:
            if time.monotonic() > deadline:
                raise _DownloadDeadlineExceeded()
            part = response.read(256 * 1024)
            if not part:
                break
            parts.append(part)
    return b"".join(parts).decode("utf-8-sig")


def _fetch_source(
    map_key: str, source_id: str, sensor: str, day_range: int = FETCH_DAY_RANGE, start_date: str | None = None
) -> tuple[pd.DataFrame, dict]:
    url = f"{FIRMS_API_BASE}/{quote(map_key, safe='')}/{source_id}/{INDONESIA_BOUNDS}/{day_range}"
    if start_date:
        url += f"/{start_date}"
    request = Request(url, headers={"User-Agent": "FireWatch-Python/1.0"})
    last_error = None
    for attempt in range(FETCH_ATTEMPTS):
        try:
            body = _read_with_deadline(request)
            break
        except _DownloadDeadlineExceeded as exc:
            # Not retried: a download already this slow would likely time out again.
            raise LiveDataError(f"NASA FIRMS {source_id} download timed out") from exc
        except HTTPError as exc:
            last_error = exc
            if exc.code not in {429, 500, 502, 503, 504} or attempt == FETCH_ATTEMPTS - 1:
                raise LiveDataError(f"NASA FIRMS {source_id} is unavailable") from exc
        except (URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt == FETCH_ATTEMPTS - 1:
                raise LiveDataError(f"NASA FIRMS {source_id} is unavailable") from exc
        time.sleep(RETRY_BACKOFF_SECONDS * (2**attempt))
    else:
        raise LiveDataError(f"NASA FIRMS {source_id} is unavailable") from last_error
    try:
        frame = pd.read_csv(StringIO(body))
    except (pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
        raise LiveDataError(f"NASA FIRMS returned invalid data for {source_id}") from exc

    required = {"latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp"}
    if not required.issubset(frame.columns):
        raise LiveDataError(f"NASA FIRMS returned unexpected data for {source_id}")
    # Keep every row (don't drop low/nominal confidence here) -- the high-confidence
    # filter is now applied per-request in process_live_frames, not baked into the
    # fetch, so a caller can opt into seeing lower-confidence detections instead of
    # having them silently discarded before they ever reach the pipeline. See
    # `include_all_confidence` on load_live_hotspots()/process_live_frames().
    high_confidence = high_confidence_mask(frame)
    usable = usable_confidence_mask(frame)
    live = frame.copy()
    live["high_confidence"] = high_confidence
    live["sensor"] = sensor
    live["source"] = source_id
    live["source_file"] = source_id
    return live, {
        "id": source_id,
        "sensor": sensor,
        "rawCount": int(len(frame)),
        "highConfidenceCount": int(high_confidence.sum()),
        "usableConfidenceCount": int(usable.sum()),
        "available": True,
    }


def _severity(frp: float) -> str:
    if frp > 70:
        return "HIGH"
    if frp >= 25:
        return "MEDIUM"
    return "LOW"


def _safe_float(value) -> float | None:
    return None if pd.isna(value) else float(value)


def _safe_int(value) -> int | None:
    return None if pd.isna(value) else int(value)


_VIIRS_CONFIDENCE_LABEL = {"l": "Rendah (VIIRS)", "n": "Nominal (VIIRS)", "h": "Tinggi (VIIRS)"}


def _marker_confidence(sensor: str, confidence_raw) -> tuple[float | None, str]:
    """Honest per-sensor confidence for the frontend marker.

    MODIS confidence is a genuine continuous 0-100% algorithm output, so it's
    passed through as a real percentage. VIIRS confidence is one of three
    discrete classes (low/nominal/high) with no percentage meaning -- it must
    NOT be sent as a number or a synthetic "95%"-style label, since that
    would imply a precision VIIRS confidence doesn't have and make it look
    directly comparable to MODIS's real percentage, which NASA's own FIRMS
    documentation says these two confidence schemes are not. `confidence_num`
    (clean.py's l/n/h -> 30/70/95 placeholder) is kept internally for
    aggregate statistics but is intentionally never surfaced here as this
    marker's displayed confidence.
    """
    if sensor == "MODIS":
        value = pd.to_numeric(confidence_raw, errors="coerce")
        if pd.notna(value):
            return float(value), f"{float(value):.0f}%"
        return None, "Tidak tercatat"
    text = str(confidence_raw).strip().lower() if pd.notna(confidence_raw) else ""
    return None, _VIIRS_CONFIDENCE_LABEL.get(text, "Tidak tercatat")


def summarize_areas(areas: pd.DataFrame) -> list[dict]:
    """Serialize the per-area DataFrame for the API response.

    Deliberately excludes confidence_mean (mixes MODIS's numeric confidence
    with VIIRS's categorical confidence forced into a number) and the raw
    z_score/anomaly numbers (not yet validated for direct display). It does
    expose `baselineSource` ("historical" vs "same-batch-fallback") so the
    frontend can honestly label whether `historical_baseline()` found real
    multi-year history for that cell or fell back to same-batch stats.
    See docs/PRD review for why the rest stay out.
    """
    if areas.empty:
        return []
    summaries = []
    for area in areas.itertuples():
        summaries.append(
            {
                "areaId": str(area.area_id),
                "gridLat": float(area.grid_lat),
                "gridLon": float(area.grid_lon),
                "detections": _safe_int(area.detections),
                "modisDetections": _safe_int(area.modis_detections),
                "viirsDetections": _safe_int(area.viirs_detections),
                "activeDays": _safe_int(area.active_days),
                "consecutiveActiveDays": _safe_int(area.consecutive_active_days),
                "firstDate": str(area.first_date),
                "lastDate": str(area.last_date),
                "peakDate": str(area.peak_date),
                "frpSum": _safe_float(area.frp_sum),
                "frpMax": _safe_float(area.frp_max),
                "frpMean": _safe_float(area.frp_mean),
                "growth": _safe_float(area.growth),
                "attentionScore": _safe_float(area.attention_score),
                "attentionCriteria": str(area.attention_criteria),
                "priorityScore": _safe_float(area.priority_score),
                "priorityRank": _safe_int(area.priority_rank),
                "priorityTier": str(area.priority_tier),
                "baselineSource": str(getattr(area, "baseline_source", "same-batch-fallback")),
            }
        )
    return sorted(summaries, key=lambda item: item["priorityRank"] if item["priorityRank"] is not None else 10**9)


MAX_MARKERS_DEFAULT = 3000

_EMPTY_ADMIN_FIELDS = ("kecamatan", "kecamatanCode", "kabupatenKota", "kabupatenKotaCode", "provinsi", "provinsiCode", "approximate")


@dataclass
class LiveResult:
    """A fully processed window, cached once and sliced per request by render_view().

    Markers live in a DataFrame (one row per marker) rather than a list of dicts: a 30-day
    nominal+high window is ~700k markers, which as Python dicts would cost hundreds of MB.
    """

    markers: pd.DataFrame
    areas: list[dict]
    meta: dict
    # (detections, source summaries, window hours) kept for 24 h results so the reference-population
    # counts can be computed on first request (ensure_reference_counts) instead of on every build.
    reference_input: tuple | None = field(default=None, repr=False)


def _marker_frame(detections: pd.DataFrame, matches: pd.DataFrame, areas: pd.DataFrame, viirs_groups: pd.DataFrame | None = None) -> pd.DataFrame:
    """Vectorized equivalent of the former per-row marker loop (same fields, same marker ids,
    same keep-first de-duplication), plus `confidenceTier`, flat admin_* columns and
    `viirsDuplicate` (True for a VIIRS detection that repeats another satellite's detection of the
    same pixel; it stays on the map, it just isn't counted again in `dedupedEvents`)."""
    if detections.empty:
        return pd.DataFrame(columns=["id"])
    det = detections.reset_index(drop=True)
    grid_lat = (np.floor(det.latitude / 0.25) * 0.25).round(6)
    grid_lon = (np.floor(det.longitude / 0.25) * 0.25).round(6)
    acquired = pd.to_datetime(det.acq_datetime)
    if "source" in det:
        source = det["source"]
    elif "source_file" in det:
        source = det["source_file"]
    else:
        source = det["sensor"]
    source = source.astype(str)
    minute_stamp = acquired.dt.strftime("%Y%m%d%H%M")
    marker_ids = [
        f"{src}-{stamp}-{lat:.5f}-{lon:.5f}"
        for src, stamp, lat, lon in zip(source, minute_stamp, det.latitude.to_numpy(), det.longitude.to_numpy())
    ]

    sensor = det.sensor.astype(str)
    raw_conf = det["confidence_raw"] if "confidence_raw" in det else pd.Series([np.nan] * len(det))
    modis_value = pd.to_numeric(raw_conf, errors="coerce").where(sensor.eq("MODIS"))
    viirs_text = raw_conf.astype(str).str.strip().str.lower()
    confidence_label = [
        (f"{value:.0f}%" if pd.notna(value) else "Tidak tercatat")
        if is_modis
        else _VIIRS_CONFIDENCE_LABEL.get(text, "Tidak tercatat")
        for is_modis, value, text in zip(sensor.eq("MODIS"), modis_value, viirs_text)
    ]
    tier = confidence_tier(det, "confidence_raw") if "confidence_raw" in det else pd.Series("high", index=det.index)

    status_by_id = matches.set_index("detection_id")["match_status"] if not matches.empty else pd.Series(dtype=object)
    matched_by_id = (
        matches.set_index("detection_id")["matched_detection_id"]
        if not matches.empty and "matched_detection_id" in matches.columns
        else pd.Series(dtype=float)
    )
    positions = pd.Series(np.arange(len(det)))
    match_status = positions.map(status_by_id).fillna("UNMATCHED").astype(str)
    matched_raw = positions.map(matched_by_id)
    matched_id = [None if pd.isna(v) or v == -1 else int(v) for v in matched_raw]

    frame = pd.DataFrame(
        {
            "id": marker_ids,
            "lat": det.latitude.astype(float),
            "lng": det.longitude.astype(float),
            "label": sensor + " active fire",
            "frp": det.frp.astype(float),
            "severity": np.select([det.frp > 70, det.frp >= 25], ["HIGH", "MEDIUM"], "LOW"),
            "sensor": sensor,
            "source": source,
            "satellite": det["satellite"].astype(str) if "satellite" in det else "Unknown",
            "confidence": modis_value.astype(float),
            "confidenceLabel": confidence_label,
            "confidenceTier": tier.to_numpy(),
            "highConfidence": det["high_confidence"].astype(bool) if "high_confidence" in det else True,
            "acquiredAt": acquired.dt.strftime("%Y-%m-%dT%H:%M:00Z"),
            "areaId": grid_lat.astype(str) + "_" + grid_lon.astype(str),
            "matchStatus": match_status,
            "matchedDetectionId": pd.Series(matched_id, dtype=object),
            "viirsDuplicate": ~viirs_groups["viirs_primary"].to_numpy() if viirs_groups is not None else False,
        }
    )
    frame = frame.drop_duplicates(subset="id", keep="first").reset_index(drop=True)

    area_cols = ["area_id", "attention_score", "priority_score", "priority_tier"]
    if not areas.empty:
        lookup = areas[area_cols].rename(columns={"area_id": "areaId"})
        frame = frame.merge(lookup, on="areaId", how="left")
    else:
        frame["attention_score"] = np.nan
        frame["priority_score"] = np.nan
        frame["priority_tier"] = None
    frame["attentionScore"] = frame.pop("attention_score").fillna(0).astype(float)
    frame["priorityScore"] = frame.pop("priority_score").fillna(0).astype(float)
    frame["priorityTier"] = frame.pop("priority_tier").fillna("low").astype(str).str.upper()

    index = get_admin_index()
    resolved = index.lookup_many(frame.lat.to_numpy(), frame.lng.to_numpy()) if index is not None else [None] * len(frame)
    for field in _EMPTY_ADMIN_FIELDS:
        frame[f"admin_{field}"] = [hit[field] if hit else None for hit in resolved]
    return frame


def _attach_area_admin(area_summaries: list[dict], markers: pd.DataFrame) -> None:
    """A 0.25° cell can span several kecamatan: give each area the kecamatan holding most of its
    own detections (adminBasis="dominant-detections"), first-encountered on ties."""
    if markers.empty or "admin_kecamatanCode" not in markers:
        for area in area_summaries:
            area["admin"] = None
        return
    known = markers[markers.admin_kecamatanCode.notna()]
    counts = known.groupby(["areaId", "admin_kecamatanCode"], sort=False).size()
    first_row = known.drop_duplicates(subset=["areaId", "admin_kecamatanCode"]).set_index(["areaId", "admin_kecamatanCode"])
    best: dict[str, dict] = {}
    for (area_id, code), count in counts.items():
        entry = best.setdefault(area_id, {"top": None, "top_count": 0, "total": 0, "n": 0})
        entry["total"] += int(count)
        entry["n"] += 1
        if count > entry["top_count"]:
            entry["top_count"], entry["top"] = int(count), code
    for area in area_summaries:
        entry = best.get(area["areaId"])
        if not entry:
            area["admin"] = None
            continue
        row = first_row.loc[(area["areaId"], entry["top"])]
        area["admin"] = {
            **{field: _plain(row[f"admin_{field}"]) for field in _EMPTY_ADMIN_FIELDS if field != "kecamatanCode"},
            "kecamatanCode": entry["top"],
            "adminBasis": "dominant-detections",
            "dominantShare": round(entry["top_count"] / entry["total"], 3),
            "kecamatanCount": entry["n"],
        }


def _plain(value):
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value


def _daily_summary(markers: pd.DataFrame) -> list[dict]:
    """Per (UTC date, provinsi) counts over EVERY marker, before any cap or slice."""
    if markers.empty:
        return []
    frame = pd.DataFrame(
        {
            "date": markers.acquiredAt.str[:10],
            "provinsi": markers.admin_provinsi,
            "modis": markers.sensor.eq("MODIS").astype(int),
            "viirs": markers.sensor.ne("MODIS").astype(int),
            "matched": markers.matchStatus.eq("MATCHED").astype(int),
            "modisOnly": markers.matchStatus.eq("MODIS_ONLY").astype(int),
            "viirsOnly": markers.matchStatus.eq("VIIRS_ONLY").astype(int),
            "high": markers.severity.eq("HIGH").astype(int),
            "medium": markers.severity.eq("MEDIUM").astype(int),
            "low": markers.severity.eq("LOW").astype(int),
        }
    )
    grouped = frame.groupby(["date", "provinsi"], dropna=False, sort=True).sum().reset_index()
    rows = []
    for record in grouped.to_dict(orient="records"):
        record["provinsi"] = None if pd.isna(record["provinsi"]) else record["provinsi"]
        rows.append({k: (int(v) if isinstance(v, (np.integer,)) else v) for k, v in record.items()})
    return sorted(rows, key=lambda r: (r["date"], r["provinsi"] or ""))


# Reference-population counts are only needed to compare one day against the archive's daily
# baseline (/api/historical/unusual), so they are skipped for the 7- and 30-day windows.
REFERENCE_MAX_WINDOW_HOURS = 24
# Which live feed carries each VIIRS platform (the archive tables are built per platform, see
# historical.REFERENCE_TABLES).
_PLATFORM_SOURCE = {"SNPP": "VIIRS_SNPP_NRT", "NOAA20": "VIIRS_NOAA20_NRT", "NOAA21": "VIIRS_NOAA21_NRT"}
# Platforms with an archive table the live count can be compared with (historical.REFERENCE_TABLES):
# Suomi-NPP today, NOAA-20 once its FIRMS archive is downloaded and built.
REFERENCE_PLATFORMS = ("SNPP", "NOAA20")


def _area_ids(frame: pd.DataFrame) -> pd.Series:
    grid_lat = (np.floor(frame.latitude / 0.25) * 0.25).round(6)
    grid_lon = (np.floor(frame.longitude / 0.25) * 0.25).round(6)
    return grid_lat.astype(str) + "_" + grid_lon.astype(str)


def _deduplicated_counts(detections: pd.DataFrame, events: pd.DataFrame, viirs_groups: pd.DataFrame):
    """Per-area event counts after collapsing VIIRS cross-satellite repeats, plus the number of
    repeats per area. A group whose members straddle a cell edge is counted in the cell of its
    first event (by event order), so the per-area counts add up to the total."""
    if events.empty:
        return {}, {}, 0
    keys = deduplicated_event_keys(events, viirs_groups)
    per_event = pd.DataFrame({"key": keys.to_numpy(), "area_id": _area_ids(events).to_numpy()})
    first = per_event.drop_duplicates(subset="key", keep="first")
    deduped = first.groupby("area_id").size().to_dict()
    det = detections.reset_index(drop=True)
    repeats = _area_ids(det)[~viirs_groups["viirs_primary"].to_numpy()]
    return deduped, repeats.value_counts().to_dict(), int(len(first))


def _reference_populations(detections: pd.DataFrame, source_summaries: list[dict], window_hours: int, with_counts: bool = True) -> dict:
    """Per VIIRS platform: are MODIS and that platform both present in this snapshot, and if so,
    the per-area event counts of MODIS + that platform only, harmonized exactly like the archive
    (which is MODIS + Suomi-NPP). A platform whose feed failed is reported as unavailable -- it is
    never silently replaced by another satellite, because their per-day counts differ."""
    available_feeds = {s.get("id") for s in source_summaries if s.get("available")}
    know_feeds = any("id" in s for s in source_summaries)  # tests may pass bare summaries
    det = detections.reset_index(drop=True)
    platform = viirs_platform(det)
    is_modis = det["sensor"].astype(str).eq("MODIS").to_numpy()
    populations = {}
    for name in REFERENCE_PLATFORMS:
        has_rows = bool((platform == name).any())
        if know_feeds:
            available = _PLATFORM_SOURCE[name] in available_feeds and "MODIS_NRT" in available_feeds
            reason = None if available else ("MODIS_NRT unavailable" if "MODIS_NRT" not in available_feeds else f"{_PLATFORM_SOURCE[name]} unavailable")
        else:
            available = has_rows and bool(is_modis.any())
            reason = None if available else "no rows for this platform or for MODIS"
        info = {"available": bool(available), "reason": reason, "counts": {}}
        if with_counts and available and window_hours <= REFERENCE_MAX_WINDOW_HOURS:
            subset = det[is_modis | (platform == name).to_numpy()].reset_index(drop=True)
            matches = match_modis_viirs(subset) if not subset.empty else pd.DataFrame(columns=["detection_id", "match_status", "matched_detection_id"])
            reference_events = build_harmonized_events(subset, matches)
            info["counts"] = _area_ids(reference_events).value_counts().to_dict() if not reference_events.empty else {}
            info["events"] = int(len(reference_events))
        populations[name] = info
    return populations


def build_live_result(
    frames: list[pd.DataFrame],
    source_summaries: list[dict],
    include_all_confidence: bool = False,
    window_hours: int = WINDOW_HOURS,
    now: pd.Timestamp | None = None,
) -> LiveResult:
    """Full pipeline for one window. Default confidence filter = nominal + high (FIRMS classes,
    see clean.usable_confidence_mask); include_all_confidence=True also keeps "low", each marker
    labelled with its `confidenceTier`. `now` (naive UTC) pins the window end for tests and
    frozen-snapshot measurements; it defaults to the current time."""
    if not frames:
        raise LiveDataError("All NASA FIRMS feeds are unavailable")
    detections = add_quality_flags(harmonize(pd.concat(frames, ignore_index=True, sort=False)))
    detections = detections[detections["quality_ok"]].reset_index(drop=True)
    if not include_all_confidence and "confidence_raw" in detections.columns:
        detections = detections[confidence_tier(detections, "confidence_raw").ne("low")].reset_index(drop=True)
    # We fetch a FETCH_DAY_RANGE-day bucket from FIRMS to absorb VIIRS NRT's
    # processing lag (see FETCH_DAY_RANGE's comment), so trim back down to the
    # real window here -- otherwise the advertised windowHours would be a lie.
    if "acq_datetime" in detections.columns:
        end = now if now is not None else pd.Timestamp.now(tz="UTC").tz_localize(None)
        cutoff = end - pd.Timedelta(hours=window_hours)
        detections = detections[detections["acq_datetime"] >= cutoff].reset_index(drop=True)
    detections = deduplicate_detections(detections).reset_index(drop=True)
    matches = match_modis_viirs(detections) if not detections.empty else pd.DataFrame(columns=["detection_id", "match_status", "matched_detection_id"])

    # Aggregate from harmonized events (MATCHED pairs collapsed to one event, frp = max of the
    # pair) so one physical detection seen by both sensors isn't double-counted; raw per-sensor
    # counts are restored from the raw detections on purpose (coverage, not a dedup count).
    events = build_harmonized_events(detections, matches)
    areas = aggregate_grid(events)
    raw_areas = aggregate_grid(detections)
    if not areas.empty and not raw_areas.empty:
        raw_counts = raw_areas[["area_id", "modis_detections", "viirs_detections"]]
        areas = areas.drop(columns=["modis_detections", "viirs_detections"]).merge(raw_counts, on="area_id", how="left")
        areas[["modis_detections", "viirs_detections"]] = areas[["modis_detections", "viirs_detections"]].fillna(0)
    areas = deterministic_priority(historical_baseline(attention_features(temporal_features(areas)), sqlite_path=default_historical_db_path()))

    # Everything above (matches, events, areas, priority) is the unchanged harmonization. The
    # cross-satellite and reference-population numbers below are additions on top of it.
    viirs_groups = collapse_viirs_cross_satellite(detections)
    markers = _marker_frame(detections, matches, areas, viirs_groups)
    area_summaries = summarize_areas(areas)
    _attach_area_admin(area_summaries, markers)
    deduped_by_area, duplicates_by_area, deduped_total = _deduplicated_counts(detections, events, viirs_groups)
    # Availability only here; the counts need two extra MODIS matchings (~3 s on a busy day), so they
    # are computed once, on first use, by ensure_reference_counts() (/api/historical/unusual).
    populations = _reference_populations(detections, source_summaries, window_hours, with_counts=False)
    for area in area_summaries:
        area_id = area["areaId"]
        area["dedupedEvents"] = int(deduped_by_area.get(area_id, 0))
        area["viirsCrossSatelliteDuplicates"] = int(duplicates_by_area.get(area_id, 0))
        area["referenceEvents"] = None

    matched_count = int((matches["match_status"] == "MATCHED").sum()) if not matches.empty else 0
    meta = {
        "provider": "NASA FIRMS",
        "area": "Indonesia",
        "windowHours": window_hours,
        "confidenceFilter": "all" if include_all_confidence else "nominal+high",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": source_summaries,
        "degraded": any(not source["available"] for source in source_summaries),
        "processing": {
            "engine": "Python fire_pipeline",
            "qualityRows": int(len(detections)),
            "matchedDetections": matched_count,
            "areasAnalyzed": int(len(areas)),
            "steps": ["clean", "match", "grid", "attention", "priority"],
            "harmonizedEvents": int(len(events)),
            "dedupedEvents": int(deduped_total),
            "viirsCrossSatellite": {
                "radiusKm": VIIRS_CROSS_SATELLITE_KM,
                "timeMinutes": VIIRS_CROSS_SATELLITE_MINUTES,
                "viirsDetections": int(viirs_groups["viirs_platform"].notna().sum()),
                "duplicates": int((~viirs_groups["viirs_primary"]).sum()),
                "groups": int(viirs_groups.loc[viirs_groups.viirs_group >= 0, "viirs_group"].nunique()),
            },
        },
        "referencePopulations": {
            platform: {key: value for key, value in info.items() if key != "counts"} for platform, info in populations.items()
        },
    }
    return LiveResult(
        markers=markers,
        areas=area_summaries,
        meta={**meta, "_daily": _daily_summary(markers)},
        reference_input=(detections, source_summaries, window_hours) if window_hours <= REFERENCE_MAX_WINDOW_HOURS else None,
    )


_reference_lock = threading.Lock()


def ensure_reference_counts(result: LiveResult) -> LiveResult:
    """Fill each area's `referenceEvents` (MODIS + one VIIRS platform per available platform) and the
    per-platform event totals in meta, once per cached result. No-op for multi-day windows, whose
    `referenceEvents` stay None."""
    with _reference_lock:
        if result.reference_input is None:
            return result
        detections, summaries, window_hours = result.reference_input
        populations = _reference_populations(detections, summaries, window_hours)
        for area in result.areas:
            area["referenceEvents"] = {
                platform: int(info["counts"].get(area["areaId"], 0)) for platform, info in populations.items() if info["available"]
            }
        result.meta["referencePopulations"] = {
            platform: {key: value for key, value in info.items() if key != "counts"} for platform, info in populations.items()
        }
        result.reference_input = None
    return result


def _marker_to_dict(row: dict) -> dict:
    admin = None
    if row.get("admin_kecamatan") is not None:
        admin = {field: _plain(row[f"admin_{field}"]) for field in _EMPTY_ADMIN_FIELDS}
    marker = {key: _plain(value) for key, value in row.items() if not key.startswith("admin_")}
    marker["confidence"] = None if marker.get("confidence") is None or pd.isna(marker["confidence"]) else float(marker["confidence"])
    marker["admin"] = admin
    return marker


def render_view(
    result: LiveResult,
    *,
    province: str | None = None,
    near: tuple[float, float, float] | None = None,
    marker_id: str | None = None,
    limit: int | None = MAX_MARKERS_DEFAULT,
    order: str = "frp",
) -> dict:
    """Slice a cached LiveResult. Filters run BEFORE the marker cap, so a province / radius / id
    request gets every matching marker (up to `limit`), and meta.markers reports the cut."""
    markers = result.markers
    if not markers.empty:
        if marker_id:
            markers = markers[markers.id == marker_id]
        if province:
            markers = markers[markers.admin_provinsi == province]
        if near:
            lat, lon, km = near
            distance = haversine_km(lat, lon, markers.lat.to_numpy(), markers.lng.to_numpy())
            markers = markers[distance <= km]
    total = int(len(markers))
    truncated = limit is not None and total > limit
    if order == "recent" and total:
        markers = markers.sort_values("acquiredAt", ascending=False, kind="stable")
    elif truncated:
        markers = markers.sort_values("frp", ascending=False, kind="stable")
    if limit is not None:
        markers = markers.head(limit)

    areas = result.areas
    daily = result.meta["_daily"]
    if province:
        areas = [a for a in areas if (a.get("admin") or {}).get("provinsi") == province]
        daily = [d for d in daily if d["provinsi"] == province]

    meta = {k: v for k, v in result.meta.items() if k != "_daily"}
    meta["markers"] = {
        "total": total,
        "shown": int(len(markers)),
        "truncated": bool(truncated),
        "selection": ("recent" if order == "recent" else "highest-frp") if truncated else "all",
    }
    if province or near or marker_id:
        meta["filter"] = {"province": province, "near": list(near) if near else None, "markerId": marker_id}
    return {
        "markers": [_marker_to_dict(row) for row in markers.to_dict(orient="records")],
        "areas": areas,
        "daily": daily,
        "meta": meta,
    }


def process_live_frames(
    frames: list[pd.DataFrame],
    source_summaries: list[dict],
    include_all_confidence: bool = False,
    window_hours: int = WINDOW_HOURS,
    max_markers: int | None = None,
) -> dict:
    """Unsliced convenience wrapper (build + render with no filters), kept for tests/callers."""
    return render_view(
        build_live_result(frames, source_summaries, include_all_confidence=include_all_confidence, window_hours=window_hours),
        limit=max_markers,
    )


def _cached_result(window: str, include_all_confidence: bool, frames, summaries, window_hours: int) -> LiveResult:
    """Reuse the processed result while the underlying fetched frames are the same objects."""
    frame_ids = tuple(sorted(id(frame) for frame in frames))
    cache_key = (window, include_all_confidence)
    with _processed_lock:
        cached = _processed_cache.get(cache_key)
        if cached and cached[0] == frame_ids:
            return cached[1]
    result = build_live_result(frames, summaries, include_all_confidence=include_all_confidence, window_hours=window_hours)
    with _processed_lock:
        _processed_cache[cache_key] = (frame_ids, result)
    return result


def load_live_result(map_key: str | None = None, include_all_confidence: bool = False, window: str = "24h") -> LiveResult:
    global _cache
    key = map_key or os.getenv("NASA_FIRMS_MAP_KEY")
    if not key:
        raise LiveDataError("NASA_FIRMS_MAP_KEY is not configured")
    if window not in WINDOW_HOURS_BY_KEY:
        raise ValueError(f"window must be one of {sorted(WINDOW_HOURS_BY_KEY)}")
    if window != "24h":
        # Same stale-while-revalidate as 24 h below: once a window has been built, an expired result
        # is served immediately while one background thread re-fetches its newest chunks (measured
        # 2026-10-21: 65-105 s per expired 7d/30d request when FIRMS is slow).
        result_key = (window, include_all_confidence)
        with _cache_lock:
            hit = _window_results.get(result_key)
            thread = _window_refresh_threads.get(result_key)
            if hit is not None and hit[0] <= time.monotonic() and (thread is None or not thread.is_alive()):
                thread = threading.Thread(
                    target=_refresh_window, args=(key, window, include_all_confidence), daemon=True, name=f"firms-{window}-refresh"
                )
                _window_refresh_threads[result_key] = thread
                thread.start()
        if hit is not None:
            return hit[1]
        return _build_window(key, window, include_all_confidence)
    # Stale-while-revalidate: FIRMS answers can take 20-45 s per feed on a slow day, which used to
    # block every request whenever the 5-minute cache ran out. Now only the very first request (no
    # data at all yet) waits; afterwards an expired cache is served as-is while one background
    # thread fetches the next snapshot.
    global _refresh_thread
    with _cache_lock:
        cached = _cache
        if cached is not None and cached[0] <= time.monotonic() and (_refresh_thread is None or not _refresh_thread.is_alive()):
            _refresh_thread = threading.Thread(target=_refresh_24h, args=(key,), daemon=True, name="firms-24h-refresh")
            _refresh_thread.start()
    if cached is None:
        _refresh_24h(key)
        cached = _cache
    if cached is None:
        raise LiveDataError("All NASA FIRMS feeds are unavailable")
    frames, summaries = cached[1]
    if not frames:
        raise LiveDataError("All NASA FIRMS feeds are unavailable")
    return _cached_result("24h", include_all_confidence, frames, summaries, WINDOW_HOURS)


def _build_window(key: str, window: str, include_all_confidence: bool) -> LiveResult:
    window_hours = WINDOW_HOURS_BY_KEY[window]
    with _window_locks[window]:
        frames, summaries = _fetch_extended_window(key, window_hours)
        if not frames:
            raise LiveDataError("All NASA FIRMS feeds are unavailable")
        result = _cached_result(window, include_all_confidence, frames, summaries, window_hours)
    with _cache_lock:
        _window_results[(window, include_all_confidence)] = (time.monotonic() + CACHE_SECONDS, result)
    return result


def _refresh_window(key: str, window: str, include_all_confidence: bool) -> None:
    """Background rebuild of an expired 7d/30d result. On failure the old result stays in place and
    is retried after FAILED_REFRESH_RETRY_SECONDS."""
    try:
        _build_window(key, window, include_all_confidence)
    except Exception:  # noqa: BLE001 -- keep serving the previous result
        with _cache_lock:
            hit = _window_results.get((window, include_all_confidence))
            if hit is not None:
                _window_results[(window, include_all_confidence)] = (time.monotonic() + FAILED_REFRESH_RETRY_SECONDS, hit[1])


def _fetch_all_24h(key: str) -> tuple[list[pd.DataFrame], list[dict]]:
    frames, summaries_by_id = [], {}
    with ThreadPoolExecutor(max_workers=len(SOURCES)) as executor:
        futures = {executor.submit(_fetch_source, key, source_id, sensor): (source_id, sensor) for source_id, sensor in SOURCES}
        for future in as_completed(futures):
            source_id, sensor = futures[future]
            try:
                frame, summary = future.result()
                frames.append(frame)
                summaries_by_id[source_id] = summary
            except LiveDataError:
                summaries_by_id[source_id] = {
                    "id": source_id,
                    "sensor": sensor,
                    "rawCount": 0,
                    "highConfidenceCount": 0,
                    "usableConfidenceCount": 0,
                    "available": False,
                    "error": "Temporarily unavailable",
                }
    return frames, [summaries_by_id[source_id] for source_id, _ in SOURCES]


def _refresh_24h(key: str) -> None:
    """Fetch a fresh 24 h snapshot into `_cache`. One fetch at a time; a caller that waited for
    another fetch to finish reuses its result. If every feed fails, existing data is kept (and
    retried after FAILED_REFRESH_RETRY_SECONDS) rather than replaced by nothing."""
    global _cache
    with _fetch_24h_lock:
        current = _cache
        if current is not None and current[0] > time.monotonic():
            return
        frames, summaries = _fetch_all_24h(key)
        with _cache_lock:
            if frames or _cache is None:
                _cache = (time.monotonic() + CACHE_SECONDS, (frames, summaries))
            else:
                _cache = (time.monotonic() + FAILED_REFRESH_RETRY_SECONDS, _cache[1])


def load_live_hotspots(
    map_key: str | None = None,
    include_all_confidence: bool = False,
    window: str = "24h",
    *,
    province: str | None = None,
    near: tuple[float, float, float] | None = None,
    marker_id: str | None = None,
    limit: int | None = MAX_MARKERS_DEFAULT,
    order: str = "frp",
) -> dict:
    result = load_live_result(map_key, include_all_confidence=include_all_confidence, window=window)
    return render_view(result, province=province, near=near, marker_id=marker_id, limit=limit, order=order)


def enabled_windows() -> list[str]:
    """Windows this server serves, from LIVE_WINDOWS (e.g. "24h,7d"); default all. A 30-day
    nominal+high window holds ~700k markers and needs ~1.5 GB RAM, so small instances can turn it off."""
    raw = os.getenv("LIVE_WINDOWS", ",".join(WINDOW_HOURS_BY_KEY))
    windows = [w.strip() for w in raw.split(",") if w.strip() in WINDOW_HOURS_BY_KEY]
    return windows or ["24h"]


def start_cache_warmer(map_key: str, windows: list[str], interval_seconds: int = 4 * 60) -> threading.Thread:
    """Keep the processed caches hot in the background so no visitor waits for a cold 7d/30d fetch.

    Runs one window at a time (24h first) and re-runs every `interval_seconds`, a little under the
    5-minute recent-chunk TTL, so the newest data is refreshed without a user-facing delay. Errors
    are swallowed and retried on the next tick -- warming is an optimisation, never a dependency.
    """

    def loop():
        while True:
            for window in windows:
                try:
                    load_live_result(map_key, window=window)
                except Exception:  # noqa: BLE001 -- retried next tick
                    pass
            time.sleep(interval_seconds)

    thread = threading.Thread(target=loop, name="firms-cache-warmer", daemon=True)
    thread.start()
    return thread
