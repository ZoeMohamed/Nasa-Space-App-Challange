"""Read-only helpers for serving the `/api/historical/calendar` endpoint
from the offline historical SQLite store built by
scripts/build_historical_store.py. Nothing here is on the live hotspots
request path.
"""

import os
import sqlite3

import pandas as pd

from .admin_lookup import filter_frame_to_admin, filter_frame_to_province

TABLE = "daily_area_activity"
# First VIIRS (Suomi-NPP) day in the FIRMS archive. Since the default filter keeps nominal VIIRS,
# VIIRS dominates every count after this date (2011: 56k events, 2012: 307k), so per-cell baselines
# are computed from this date on only -- mixing MODIS-only years in would drag baselines down and
# flag ordinary days as "unusual". `months` (the heatmap series) still covers every year.
VIIRS_ERA_START = "2012-01-20"


_table_cache: dict[str, tuple[float, pd.DataFrame]] = {}


def _read_table(sqlite_path):
    """Whole daily table, cached in memory per (path, file mtime): the nominal+high archive is ~1M
    rows and re-reading it cost ~2.5 s per request. Rebuilding the store changes the mtime, which
    invalidates the cache. Callers get a copy because they add/overwrite columns."""
    if not sqlite_path or not os.path.exists(sqlite_path):
        return pd.DataFrame()
    key = os.path.abspath(sqlite_path)
    mtime = os.path.getmtime(key)
    cached = _table_cache.get(key)
    if cached is None or cached[0] != mtime:
        connection = sqlite3.connect(key)
        try:
            frame = pd.read_sql_query(f"SELECT * FROM {TABLE}", connection)
        finally:
            connection.close()
        _table_cache[key] = (mtime, frame)
        cached = _table_cache[key]
    return cached[1].copy()


def load_calendar_summary(sqlite_path, bounds=None, province=None, admin_code=None):
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
        return {"months": [], "cells": []}

    data["date"] = pd.to_datetime(data["date"])
    if bounds:
        min_lat, max_lat, min_lon, max_lon = bounds
        data = data[data.grid_lat.between(min_lat, max_lat) & data.grid_lon.between(min_lon, max_lon)]
    data = filter_frame_to_province(data, province)
    data = filter_frame_to_admin(data, admin_code)
    if data.empty:
        return {"months": [], "cells": []}

    data["year"] = data.date.dt.year
    data["month"] = data.date.dt.month

    months_df = (
        data.groupby(["year", "month"], as_index=False)
        .agg(
            detections=("detections", "sum"),
            modis_detections=("modis_detections", "sum"),
            viirs_detections=("viirs_detections", "sum"),
            frp_sum=("frp_sum", "sum"),
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
        }
        for row in months_df.itertuples()
    ]

    baseline = data[data.date >= pd.Timestamp(VIIRS_ERA_START)]
    cell_monthly = baseline.groupby(["grid_lat", "grid_lon", "year", "month"], as_index=False).detections.sum()
    monthly_stats = cell_monthly.groupby(["grid_lat", "grid_lon"], as_index=False).detections.agg(
        monthly_mean="mean", monthly_std="std", sample_months="count"
    )

    # Daily stats: `data` is already one row per (date, cell) with its own
    # `detections` count (that's the table's native granularity), so this is
    # a direct groupby -- no intermediate per-period sum needed, unlike the
    # monthly case above which has to sum-within-month first.
    daily_stats = baseline.groupby(["grid_lat", "grid_lon"], as_index=False).detections.agg(
        daily_mean="mean", daily_std="std", sample_days="count"
    )

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
        }
        for row in cells_df.itertuples()
    ]

    return {"months": months, "cells": cells}


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
