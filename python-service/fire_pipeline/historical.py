"""Read-only helpers for serving the `/api/historical/calendar` endpoint
from the offline historical SQLite store built by
scripts/build_historical_store.py. Nothing here is on the live hotspots
request path.
"""

import os
import sqlite3

import numpy as np
import pandas as pd

from .admin_lookup import filter_frame_to_admin, filter_frame_to_polygon, filter_frame_to_province

TABLE = "daily_area_activity"
# One archive table per VIIRS platform, each holding MODIS + that platform only, built by
# scripts/build_historical_store.py. The original table is MODIS + Suomi-NPP. A NOAA-20 table only
# exists once its FIRMS archive has been downloaded and built (--viirs-noaa20-archive).
REFERENCE_TABLES = {"SNPP": TABLE, "NOAA20": "daily_area_activity_noaa20"}
# Below this many observed days a cell's daily std is too unstable to call anything "unusual"
# (audit_2026_10 A4: 443 of 3,231 VIIRS-era cells have fewer than 10 days). Such cells are reported
# as "insufficient-history", never silently treated as "within baseline".
MIN_BASELINE_SAMPLE_DAYS = 10
# Baselines leave out provisional rows. Rows tagged "nrt" (the newest ~3 months, see
# build_historical_store.py) cannot be filtered to vegetation fires (no `type` column in NRT files,
# audit_2026_10 A2) and are replaced once NASA publishes the standard archive for those dates.
EXCLUDED_BASELINE_SOURCES = ("nrt",)
UNUSUAL_Z = 2.0
# Seasonal baseline (audit_2026_10 P1): the same calendar month +-1 in earlier years, so a busy
# September is compared with past Augusts-Octobers instead of with the whole year. Needs at least
# MIN_BASELINE_SAMPLE_DAYS days from MIN_SEASONAL_YEARS different years; otherwise the cell falls
# back to its all-months baseline and says so (baselineKind).
SEASONAL_WINDOW_MONTHS = 1
MIN_SEASONAL_YEARS = 3
# First VIIRS (Suomi-NPP) day in the FIRMS archive. Since the default filter keeps nominal VIIRS,
# VIIRS dominates every count after this date (2011: 56k events, 2012: 307k), so per-cell baselines
# are computed from this date on only -- mixing MODIS-only years in would drag baselines down and
# flag ordinary days as "unusual". `months` (the heatmap series) still covers every year.
VIIRS_ERA_START = "2012-01-20"


_table_cache: dict[tuple[str, str], tuple[float, pd.DataFrame]] = {}


def _table_names(path: str) -> set[str]:
    connection = sqlite3.connect(path)
    try:
        return {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    finally:
        connection.close()


def _read_table(sqlite_path, table: str = TABLE):
    """Whole daily table, cached in memory per (path, table, file mtime): the nominal+high archive
    is ~1M rows and re-reading it cost ~2.5 s per request. Rebuilding the store changes the mtime,
    which invalidates the cache. Callers get a copy because they add/overwrite columns. A table that
    doesn't exist (e.g. no NOAA-20 archive built yet) reads as an empty frame."""
    if not sqlite_path or not os.path.exists(sqlite_path):
        return pd.DataFrame()
    path = os.path.abspath(sqlite_path)
    mtime = os.path.getmtime(path)
    cached = _table_cache.get((path, table))
    if cached is None or cached[0] != mtime:
        if table not in _table_names(path):
            frame = pd.DataFrame()
        else:
            connection = sqlite3.connect(path)
            try:
                frame = pd.read_sql_query(f"SELECT * FROM {table}", connection)
            finally:
                connection.close()
        _table_cache[(path, table)] = (mtime, frame)
        cached = _table_cache[(path, table)]
    return cached[1].copy()


def available_references(sqlite_path) -> list[str]:
    """VIIRS platforms that have a non-empty archive table in this store, in REFERENCE_TABLES order."""
    return [platform for platform, table in REFERENCE_TABLES.items() if not _read_table(sqlite_path, table).empty]


def _baseline_rows(data: pd.DataFrame) -> pd.DataFrame:
    """Rows a per-cell baseline may use: VIIRS era, provisional NRT rows left out. Stores built
    before the `source` column existed are treated as all-archive."""
    rows = data[data.date >= pd.Timestamp(VIIRS_ERA_START)]
    if "source" in rows:
        rows = rows[~rows["source"].isin(EXCLUDED_BASELINE_SOURCES)]
    return rows


def _daily_cell_stats(rows: pd.DataFrame) -> pd.DataFrame:
    stats = rows.groupby(["grid_lat", "grid_lon"], as_index=False).detections.agg(daily_mean="mean", daily_std="std", sample_days="count")
    stats["baseline_status"] = np.where(stats.sample_days >= MIN_BASELINE_SAMPLE_DAYS, "ok", "insufficient-history")
    return stats


def seasonal_months(month: int) -> list[int]:
    """`month` and its neighbours within SEASONAL_WINDOW_MONTHS, wrapping December/January."""
    return sorted({((month - 1 + offset) % 12) + 1 for offset in range(-SEASONAL_WINDOW_MONTHS, SEASONAL_WINDOW_MONTHS + 1)})


def _seasonal_cell_stats(rows: pd.DataFrame, month: int) -> pd.DataFrame:
    window = rows[rows.date.dt.month.isin(seasonal_months(month))].assign(year=lambda frame: frame.date.dt.year)
    return window.groupby(["grid_lat", "grid_lon"], as_index=False).agg(
        seasonal_mean=("detections", "mean"),
        seasonal_std=("detections", "std"),
        seasonal_days=("detections", "count"),
        seasonal_years=("year", "nunique"),
    )


def _filter_cells(data: pd.DataFrame, bounds=None, province=None, admin_code=None, polygon=None) -> pd.DataFrame:
    """Restrict to the area of interest: bounding box, province, admin p-code and/or a drawn
    polygon (admin_lookup.parse_polygon). Each keeps the 0.25° cells that touch the area."""
    if bounds:
        min_lat, max_lat, min_lon, max_lon = bounds
        data = data[data.grid_lat.between(min_lat, max_lat) & data.grid_lon.between(min_lon, max_lon)]
    data = filter_frame_to_province(data, province)
    data = filter_frame_to_admin(data, admin_code)
    return filter_frame_to_polygon(data, polygon)


def load_calendar_summary(sqlite_path, bounds=None, province=None, admin_code=None, polygon=None):
    """Build the `/api/historical/calendar` response payload.

    `bounds`, if given, is (min_lat, max_lat, min_lon, max_lon) and filters
    which grid cells are included before aggregating.

    Response shape::

        {
          "months": [
            {"year": 2023, "month": 1, "detections": 1234,
             "modisDetections": 800, "viirsDetections": 434,
             "frpSum": 5678.9},
            ...
          ],
          "cells": [
            {"gridLat": -2.0, "gridLon": 104.75,
             "monthlyMeanDetections": 12.3, "monthlyStdDetections": 4.5,
             "sampleMonths": 48,
             "dailyMeanDetections": 2.1, "dailyStdDetections": 1.8,
             "sampleDays": 103},
            ...
          ]
        }

    `months` are totals across ALL grid cells for that calendar month
    (for a calendar heatmap). `cells` are per-grid-cell baseline stats, at
    two granularities:
    - monthly (mean/std of monthly detection SUMS, `sampleMonths` distinct
      months contributing) -- kept for callers that want a month-scale
      baseline;
    - daily (mean/std of single-day detection counts, `sampleDays` distinct
      days contributing) -- the ONE a caller must use when comparing
      against a live snapshot's count, since that count is also a
      single-day quantity. Comparing a live day-count against the MONTHLY
      stats mixes units (a day's count vs. a month's sum) and was a real
      bug in the first consumer of this endpoint -- see
      `src/app/calendar/page.tsx`'s `unusualAreas`, now fixed to use the
      daily fields here instead.
    Cell stats use only VIIRS-era days (>= VIIRS_ERA_START); `months` keeps every year.
    `*StdDetections` is null when fewer than 2 samples exist at that
    granularity (std of 0/1 samples is undefined) -- callers must treat
    null as "not enough history," not as zero variance.
    """
    data = _read_table(sqlite_path)
    if data.empty:
        return {"months": [], "cells": [], "baseline": _baseline_meta(data)}

    data["date"] = pd.to_datetime(data["date"])
    data = _filter_cells(data, bounds, province, admin_code, polygon)
    if data.empty:
        return {"months": [], "cells": [], "baseline": _baseline_meta(data)}

    data["year"] = data.date.dt.year
    data["month"] = data.date.dt.month
    data["nrt_detections"] = data.detections.where(data["source"].eq("nrt"), 0) if "source" in data else 0

    months_df = (
        data.groupby(["year", "month"], as_index=False)
        .agg(
            detections=("detections", "sum"),
            modis_detections=("modis_detections", "sum"),
            viirs_detections=("viirs_detections", "sum"),
            frp_sum=("frp_sum", "sum"),
            nrt_detections=("nrt_detections", "sum"),
        )
        .sort_values(["year", "month"])
    )
    months = [
        {
            "year": int(row.year),
            "month": int(row.month),
            "detections": int(row.detections),
            "modisDetections": int(row.modis_detections),
            "viirsDetections": int(row.viirs_detections),
            "frpSum": float(row.frp_sum),
            # "nrt": provisional NRT rows only (no vegetation-fire filter, replaced later by the
            # standard archive); "mixed": both; "archive": final rows only.
            "nrtDetections": int(row.nrt_detections),
            "dataStatus": "archive" if row.nrt_detections == 0 else ("nrt" if row.nrt_detections == row.detections else "mixed"),
        }
        for row in months_df.itertuples()
    ]

    baseline = _baseline_rows(data)
    cell_monthly = baseline.groupby(["grid_lat", "grid_lon", "year", "month"], as_index=False).detections.sum()
    monthly_stats = cell_monthly.groupby(["grid_lat", "grid_lon"], as_index=False).detections.agg(
        monthly_mean="mean", monthly_std="std", sample_months="count"
    )

    # Daily stats: `data` is already one row per (date, cell) with its own
    # `detections` count (that's the table's native granularity), so this is
    # a direct groupby -- no intermediate per-period sum needed, unlike the
    # monthly case above which has to sum-within-month first.
    daily_stats = _daily_cell_stats(baseline)

    cells_df = monthly_stats.merge(daily_stats, on=["grid_lat", "grid_lon"], how="inner")
    cells = [
        {
            "gridLat": float(row.grid_lat),
            "gridLon": float(row.grid_lon),
            "monthlyMeanDetections": float(row.monthly_mean),
            "monthlyStdDetections": float(row.monthly_std) if pd.notna(row.monthly_std) else None,
            "sampleMonths": int(row.sample_months),
            "dailyMeanDetections": float(row.daily_mean),
            "dailyStdDetections": float(row.daily_std) if pd.notna(row.daily_std) else None,
            "sampleDays": int(row.sample_days),
            "baselineStatus": str(row.baseline_status),
        }
        for row in cells_df.itertuples()
    ]

    # Distinct 0.25° cells in the area that have any archive activity (shown next to a drawn area).
    area_cells = int(data[["grid_lat", "grid_lon"]].drop_duplicates().shape[0])
    return {"months": months, "cells": cells, "baseline": _baseline_meta(data), "areaCells": area_cells}


def _baseline_meta(data: pd.DataFrame, reference: str = "SNPP") -> dict:
    """What the per-cell baselines in a response are built from, so the UI can say it."""
    nrt = data[data["source"].eq("nrt")] if not data.empty and "source" in data else pd.DataFrame()
    return {
        "reference": reference,
        "population": f"MODIS + VIIRS {reference}",
        "startDate": VIIRS_ERA_START,
        "excludedSources": list(EXCLUDED_BASELINE_SOURCES),
        "minSampleDays": MIN_BASELINE_SAMPLE_DAYS,
        "excludedNrtRows": int(len(nrt)),
        "nrtDateRange": [str(pd.Timestamp(nrt.date.min()).date()), str(pd.Timestamp(nrt.date.max()).date())] if len(nrt) else None,
    }


def compare_live_to_baseline(live_areas, sqlite_path, reference, bounds=None, province=None, admin_code=None, z=UNUSUAL_Z, month=None, polygon=None):
    """Classify every live 24 h grid cell against its own archive baseline, comparing like with like.

    `live_areas` are /api/hotspots area summaries; each must carry `referenceEvents[reference]`,
    the cell's event count from MODIS + that one VIIRS platform (fire_pipeline.live), because the
    archive table for `reference` holds exactly that population. Comparing a count that includes
    other VIIRS satellites against a Suomi-NPP-only baseline inflated "unusual" from ~8% to ~32% of
    cells (audit_2026_10 A1).

    Status per cell (every live cell gets exactly one, nothing is dropped silently):
      - "unusual": reference count > daily mean + z * daily std (z = 2);
      - "within-baseline": baseline ok, count not above the threshold;
      - "insufficient-history": fewer than MIN_BASELINE_SAMPLE_DAYS archive days for this cell;
      - "no-history": the cell never had a recorded event in the archive's VIIRS era;
      - "not-seen-by-reference": live activity here came only from other satellites, so there is
        no count of the reference population to compare.
    Like the archive, a baseline is a mean over days WITH at least one event (no zero-filling), and
    the live count is also a count for a cell that has activity, so both are conditional on activity.

    With `month` (1-12, the live window's month) each cell is compared with its seasonal baseline
    (same month +-1 in earlier years, see seasonal_months) when that has enough history, else with
    its all-months baseline; `baselineKind` per cell says which ("seasonal" / "all-months-fallback").
    Without `month` every cell uses the all-months baseline.
    """
    table = REFERENCE_TABLES[reference]
    archive = _read_table(sqlite_path, table)
    meta = _baseline_meta(archive, reference)
    live = pd.DataFrame(
        [
            {
                "grid_lat": float(area["gridLat"]),
                "grid_lon": float(area["gridLon"]),
                "count": int(((area.get("referenceEvents") or {}).get(reference)) or 0),
                "all_events": int(area.get("detections") or 0),
            }
            for area in live_areas
        ],
        columns=["grid_lat", "grid_lon", "count", "all_events"],
    )
    live = _filter_cells(live, bounds, province, admin_code, polygon)
    if not archive.empty:
        archive["date"] = pd.to_datetime(archive["date"])
        archive = _filter_cells(archive, bounds, province, admin_code, polygon)
    baseline_rows = _baseline_rows(archive) if not archive.empty else archive
    stats = _daily_cell_stats(baseline_rows) if not archive.empty else pd.DataFrame(columns=["grid_lat", "grid_lon", "daily_mean", "daily_std", "sample_days", "baseline_status"])
    merged = live.merge(stats, on=["grid_lat", "grid_lon"], how="left")
    merged["baseline_kind"] = "all-months"
    if month is not None:
        merged["baseline_kind"] = "all-months-fallback"
        if not archive.empty:
            seasonal = _seasonal_cell_stats(baseline_rows, month)
            merged = merged.merge(seasonal, on=["grid_lat", "grid_lon"], how="left")
            use_seasonal = (merged.seasonal_days >= MIN_BASELINE_SAMPLE_DAYS) & (merged.seasonal_years >= MIN_SEASONAL_YEARS)
            merged.loc[use_seasonal, "daily_mean"] = merged.loc[use_seasonal, "seasonal_mean"]
            merged.loc[use_seasonal, "daily_std"] = merged.loc[use_seasonal, "seasonal_std"]
            merged.loc[use_seasonal, "sample_days"] = merged.loc[use_seasonal, "seasonal_days"]
            merged.loc[use_seasonal, "baseline_status"] = "ok"
            merged.loc[use_seasonal, "baseline_kind"] = "seasonal"

    threshold = merged.daily_mean + z * merged.daily_std
    status = np.select(
        [
            merged["count"].eq(0),
            merged.sample_days.isna(),
            merged.baseline_status.eq("insufficient-history"),
            merged["count"] > threshold,
        ],
        ["not-seen-by-reference", "no-history", "insufficient-history", "unusual"],
        default="within-baseline",
    )
    merged["status"] = status
    cells = [
        {
            "gridLat": float(row.grid_lat),
            "gridLon": float(row.grid_lon),
            "referenceEvents": int(row.count),
            "allSatelliteEvents": int(row.all_events),
            "dailyMean": None if pd.isna(row.daily_mean) else float(row.daily_mean),
            "dailyStd": None if pd.isna(row.daily_std) else float(row.daily_std),
            "sampleDays": None if pd.isna(row.sample_days) else int(row.sample_days),
            "threshold": None if pd.isna(row.daily_mean) or pd.isna(row.daily_std) else float(row.daily_mean + z * row.daily_std),
            "baselineKind": str(row.baseline_kind) if row.status in ("unusual", "within-baseline") else None,
            "status": str(row.status),
        }
        for row in merged.itertuples()
    ]
    counts = merged["status"].value_counts().to_dict()
    compared = int(counts.get("unusual", 0) + counts.get("within-baseline", 0))
    compared_kinds = merged.loc[merged.status.isin(["unusual", "within-baseline"]), "baseline_kind"].value_counts().to_dict()
    if month is not None:
        meta = {**meta, "seasonal": {"month": int(month), "months": seasonal_months(month), "minSampleDays": MIN_BASELINE_SAMPLE_DAYS, "minYears": MIN_SEASONAL_YEARS}}
    return {
        "comparable": True,
        "reference": reference,
        "baseline": meta,
        "z": z,
        "summary": {
            "liveCells": int(len(merged)),
            "comparedCells": compared,
            "unusualCells": int(counts.get("unusual", 0)),
            "withinBaselineCells": int(counts.get("within-baseline", 0)),
            "insufficientHistoryCells": int(counts.get("insufficient-history", 0)),
            "noHistoryCells": int(counts.get("no-history", 0)),
            "notSeenByReferenceCells": int(counts.get("not-seen-by-reference", 0)),
            "seasonalBaselineCells": int(compared_kinds.get("seasonal", 0)),
            "fallbackBaselineCells": int(compared_kinds.get("all-months-fallback", 0)),
        },
        "cells": cells,
    }


def load_map_summary(sqlite_path, days=None, bounds=None, start_date=None, end_date=None, province=None, admin_code=None):
    """Return historical grid summaries suitable for the map overlay.

    Historical storage contains daily grid aggregates rather than individual
    satellite points, so these results intentionally represent grid activity.
    The window ends at the newest date available in the store.
    """
    data = _read_table(sqlite_path)
    if data.empty:
        return {"markers": [], "meta": {"source": "historical", "days": days, "endDate": None}}

    data["date"] = pd.to_datetime(data["date"])
    if bounds:
        min_lat, max_lat, min_lon, max_lon = bounds
        data = data[data.grid_lat.between(min_lat, max_lat) & data.grid_lon.between(min_lon, max_lon)]
    data = filter_frame_to_province(data, province)
    data = filter_frame_to_admin(data, admin_code)
    if data.empty:
        return {"markers": [], "meta": {"source": "historical", "days": days, "endDate": None}}

    if end_date is None:
        end_date_value = data["date"].max().normalize()
    else:
        end_date_value = pd.to_datetime(end_date).normalize()
    if start_date is None:
        start_date_value = end_date_value - pd.Timedelta(days=(days or 1) - 1)
    else:
        start_date_value = pd.to_datetime(start_date).normalize()
    data = data[data["date"].between(start_date_value, end_date_value)]
    if data.empty:
        return {"markers": [], "meta": {"source": "historical", "days": days, "startDate": start_date_value.date().isoformat(), "endDate": end_date_value.date().isoformat()}}

    grouped = data.groupby(["grid_lat", "grid_lon"], as_index=False).agg(
        detections=("detections", "sum"),
        frp_sum=("frp_sum", "sum"),
        frp_max=("frp_max", "max"),
        active_days=("date", "nunique"),
    )
    markers = []
    for row in grouped.itertuples():
        frp = float(row.frp_max)
        severity = "HIGH" if frp > 70 else "MEDIUM" if frp >= 25 else "LOW"
        markers.append(
            {
                "id": f"historical-{row.grid_lat:.2f}-{row.grid_lon:.2f}",
                "lat": float(row.grid_lat) + 0.125,
                "lng": float(row.grid_lon) + 0.125,
                "label": f"Historical grid {row.grid_lat:.2f}, {row.grid_lon:.2f}",
                "frp": frp,
                "severity": severity,
                "confidenceLabel": "Agregat grid",
                "acquiredAt": end_date_value.strftime("%Y-%m-%dT00:00:00Z"),
                "matchStatus": "UNMATCHED",
            }
        )
    return {
        "markers": markers,
        "meta": {"source": "historical", "days": days, "startDate": start_date_value.date().isoformat(), "endDate": end_date_value.date().isoformat()},
    }
