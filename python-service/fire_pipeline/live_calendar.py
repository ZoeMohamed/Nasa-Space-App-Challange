"""Extend the archive calendar with live NRT data, on the archive's own definitions.

The offline archive (historical.sqlite) ends at a fixed date, so the current month is missing from
the calendar. This module turns a cached multi-day live result into the same two per-day, per-cell
quantities the archive holds:

- `modis_detections`: MODIS detections (the "comparable" calendar series);
- `detections`: harmonized events of MODIS + VIIRS Suomi-NPP only -- exactly the archive table's
  population (MODIS + one VIIRS platform, a matched pair counted once). NOAA-20/21 are left out
  because the archive has no history for them (audit_2026_10, finding A1).

Only dates after the archive's last date are used, and only complete UTC days (today is still
being observed). Every response says which feeds were complete over the window, so a partial
month is never presented as a full one.
"""

from __future__ import annotations

import threading

import numpy as np
import pandas as pd

from .historical import REFERENCE_TABLES, _filter_cells, _read_table
from .matching import match_modis_viirs

_REFERENCE_SOURCE = "VIIRS_SNPP_NRT"
_lock = threading.Lock()
_daily_cache: dict[int, pd.DataFrame] = {}


def event_mask(detections: pd.DataFrame, matches: pd.DataFrame) -> np.ndarray:
    """True for every row that is its own harmonized event, vectorized.

    Same rule as harmonize_events.build_harmonized_events: unmatched rows are events; in a MATCHED
    pair only the member with the higher FRP is the event (the lower detection id on ties), and the
    event keeps that member's own position and time. `detections` must be the frame `matches` was
    computed from (positions 0..n-1).
    """
    n = len(detections)
    keep = np.ones(n, dtype=bool)
    if matches is None or matches.empty or "matched_detection_id" not in matches:
        return keep
    pairs = matches[(matches["match_status"] == "MATCHED") & (matches["detection_id"] < matches["matched_detection_id"])]
    if pairs.empty:
        return keep
    a = pairs["detection_id"].to_numpy(dtype=np.int64)
    b = pairs["matched_detection_id"].to_numpy(dtype=np.int64)
    frp = detections["frp"].astype(float).to_numpy()
    a_wins = frp[a] >= frp[b]
    keep[np.where(a_wins, b, a)] = False
    return keep


def _grid(frame: pd.DataFrame, cell_size: float = 0.25) -> pd.DataFrame:
    frame = frame.copy()
    frame["grid_lat"] = (np.floor(frame.latitude / cell_size) * cell_size).round(6)
    frame["grid_lon"] = (np.floor(frame.longitude / cell_size) * cell_size).round(6)
    frame["date"] = pd.to_datetime(frame.acq_datetime).dt.normalize()
    return frame


def daily_cell_counts(markers: pd.DataFrame) -> pd.DataFrame:
    """Per (UTC date, 0.25° cell): `modis_detections` and `detections` (MODIS + Suomi-NPP events)
    from a LiveResult's marker frame (one row per quality-filtered detection)."""
    columns = ["date", "grid_lat", "grid_lon", "modis_detections", "detections"]
    if markers.empty:
        return pd.DataFrame(columns=columns)
    det = pd.DataFrame(
        {
            "latitude": markers["lat"].astype(float).to_numpy(),
            "longitude": markers["lng"].astype(float).to_numpy(),
            "frp": markers["frp"].astype(float).to_numpy(),
            "sensor": markers["sensor"].astype(str).to_numpy(),
            "source": markers["source"].astype(str).to_numpy(),
            "acq_datetime": pd.to_datetime(markers["acquiredAt"], utc=True).dt.tz_localize(None).to_numpy(),
        }
    )
    keys = ["date", "grid_lat", "grid_lon"]
    modis = _grid(det[det.sensor == "MODIS"]).groupby(keys).size().rename("modis_detections")

    reference = det[(det.sensor == "MODIS") | (det.source == _REFERENCE_SOURCE)].reset_index(drop=True)
    if reference.empty:
        events = pd.Series(dtype="int64", name="detections")
    else:
        matches = match_modis_viirs(reference)
        events = _grid(reference[event_mask(reference, matches)]).groupby(keys).size().rename("detections")
    counts = pd.concat([modis, events], axis=1).fillna(0).astype(int).reset_index()
    return counts[columns]


def _cached_daily(result) -> pd.DataFrame:
    """daily_cell_counts() once per cached LiveResult object (matching ~200k rows takes seconds)."""
    key = id(result)
    with _lock:
        hit = _daily_cache.get(key)
        if hit is not None and hit.attrs.get("result") is result:
            return hit
        daily = daily_cell_counts(result.markers)
        daily.attrs["result"] = result
        _daily_cache.clear()  # keep only the latest window's table
        _daily_cache[key] = daily
        return daily


def _missing_days(summary: dict | None) -> set | None:
    """Dates a feed failed to deliver: from `failedRanges` (multi-day windows); None means every
    day (feed absent, or failed without saying which periods); an empty set means complete."""
    if not summary:
        return None
    if summary.get("available"):
        return set()
    ranges = summary.get("failedRanges")
    if not ranges:
        return None
    missing = set()
    for start, end in ranges:
        missing.update(pd.date_range(start, end))
    return missing


def _union(a: set | None, b: set | None) -> set | None:
    return None if a is None or b is None else a | b


def _gap(days: set, missing: set | None) -> list[str]:
    return sorted(str(d.date()) for d in days if missing is None or d in missing)


def live_months(result, sqlite_path, today=None, bounds=None, province=None, admin_code=None, polygon=None) -> dict:
    """Months after the archive's end, built from a live multi-day result.

    Returns, per month: the date range actually covered, how many of its days that is, and both
    series. For the last month, when it isn't complete yet, `monthToDate` gives the same calendar
    days (1..throughDay) of every archive year, so "so far this month" can be compared fairly.
    """
    archive = _read_table(sqlite_path, REFERENCE_TABLES["SNPP"])
    if archive.empty:
        return {"available": False, "reason": "historical archive not built", "months": [], "monthToDate": None}
    archive["date"] = pd.to_datetime(archive["date"])
    archive_end = archive["date"].max().normalize()
    today = (pd.Timestamp(today) if today is not None else pd.Timestamp.now(tz="UTC").tz_localize(None)).normalize()

    sources = {s.get("id"): s for s in result.meta.get("sources", [])}
    modis_complete = bool(sources.get("MODIS_NRT", {}).get("available"))
    reference_complete = modis_complete and bool(sources.get(_REFERENCE_SOURCE, {}).get("available"))
    modis_missing = _missing_days(sources.get("MODIS_NRT"))
    reference_missing = _union(modis_missing, _missing_days(sources.get(_REFERENCE_SOURCE)))
    window_hours = int(result.meta.get("windowHours", 0))
    generated = pd.Timestamp(result.meta.get("generatedAt") or today)
    if generated.tzinfo is not None:
        generated = generated.tz_convert("UTC").tz_localize(None)
    window_start = (generated - pd.Timedelta(hours=window_hours)).normalize() + pd.Timedelta(days=1)  # first full day
    first_needed = archive_end + pd.Timedelta(days=1)
    gap_days = max(0, int((window_start - first_needed).days))

    daily = _cached_daily(result)
    daily = daily[(daily.date > archive_end) & (daily.date < today) & (daily.date >= window_start)]
    daily = _filter_cells(daily, bounds, province, admin_code, polygon)
    covered_start = max(window_start, first_needed)
    covered_end = today - pd.Timedelta(days=1)

    base = {
        "available": True,
        "windowHours": window_hours,
        "archiveEndDate": str(archive_end.date()),
        "liveStartDate": str(covered_start.date()) if covered_end >= covered_start else None,
        "liveEndDate": str(covered_end.date()) if covered_end >= covered_start else None,
        "gapDays": gap_days,
        "modisComplete": modis_complete,
        "referenceComplete": reference_complete,
        "population": {"modisDetections": "MODIS detections", "detections": "MODIS + VIIRS Suomi-NPP harmonized events"},
    }
    if covered_end < covered_start:
        return {**base, "months": [], "monthToDate": None}

    months = []
    for period in pd.period_range(covered_start, covered_end, freq="M"):
        start = max(period.start_time.normalize(), covered_start)
        end = min(period.end_time.normalize(), covered_end)
        rows = daily[(daily.date >= start) & (daily.date <= end)]
        days = set(pd.date_range(start, end))
        modis_gap = _gap(days, modis_missing)
        reference_gap = _gap(days, reference_missing)
        months.append(
            {
                "year": int(period.year),
                "month": int(period.month),
                "firstDate": str(start.date()),
                "lastDate": str(end.date()),
                "daysCovered": int((end - start).days) + 1,
                "daysInMonth": int(period.days_in_month),
                "monthComplete": bool(end == period.end_time.normalize()),
                # None = some days of this month couldn't be fetched for that series; a partial sum
                # would read as low activity, so no number is given (missingDays says which days).
                "modisDetections": None if modis_gap else int(rows.modis_detections.sum()),
                "detections": None if reference_gap else int(rows.detections.sum()),
                "missingDays": {"modisDetections": modis_gap, "detections": reference_gap},
            }
        )

    month_to_date = None
    last = months[-1]
    if not last["monthComplete"]:
        through_day = pd.Timestamp(last["lastDate"]).day
        prior = _filter_cells(archive, bounds, province, admin_code, polygon)
        prior = prior[(prior.date.dt.month == last["month"]) & (prior.date.dt.day <= through_day) & (prior.date.dt.year < last["year"])]
        if "source" in prior:
            prior = prior[prior["source"] != "nrt"]
        by_year = prior.groupby(prior.date.dt.year)[["modis_detections", "detections"]].sum()
        month_to_date = {
            "year": last["year"],
            "month": last["month"],
            "throughDay": int(through_day),
            "prior": [
                {"year": int(year), "modisDetections": int(row.modis_detections), "detections": int(row.detections)}
                for year, row in by_year.iterrows()
            ],
        }
    return {**base, "months": months, "monthToDate": month_to_date}
