"""Read-only helpers for serving the `/api/historical/calendar` endpoint
from the offline historical SQLite store built by
scripts/build_historical_store.py. Nothing here is on the live hotspots
request path.
"""

import os
import sqlite3

import pandas as pd

TABLE = "daily_area_activity"


def _read_table(sqlite_path):
    if not sqlite_path or not os.path.exists(sqlite_path):
        return pd.DataFrame()
    connection = sqlite3.connect(sqlite_path)
    try:
        return pd.read_sql_query(f"SELECT * FROM {TABLE}", connection)
    finally:
        connection.close()


def load_calendar_summary(sqlite_path, bounds=None):
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
             "sampleMonths": 48},
            ...
          ]
        }

    `months` are totals across ALL grid cells for that calendar month
    (for a calendar heatmap). `cells` are per-grid-cell monthly baseline
    stats (mean/std of monthly detection counts, and how many distinct
    months contributed) usable by the frontend to compare a live cell's
    current activity against its own history.
    """
    data = _read_table(sqlite_path)
    if data.empty:
        return {"months": [], "cells": []}

    data["date"] = pd.to_datetime(data["date"])
    if bounds:
        min_lat, max_lat, min_lon, max_lon = bounds
        data = data[data.grid_lat.between(min_lat, max_lat) & data.grid_lon.between(min_lon, max_lon)]
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

    cell_monthly = data.groupby(["grid_lat", "grid_lon", "year", "month"], as_index=False).detections.sum()
    cells_df = cell_monthly.groupby(["grid_lat", "grid_lon"], as_index=False).detections.agg(
        monthly_mean="mean", monthly_std="std", sample_months="count"
    )
    cells = [
        {
            "gridLat": float(row.grid_lat),
            "gridLon": float(row.grid_lon),
            "monthlyMeanDetections": float(row.monthly_mean),
            "monthlyStdDetections": float(row.monthly_std) if pd.notna(row.monthly_std) else None,
            "sampleMonths": int(row.sample_months),
        }
        for row in cells_df.itertuples()
    ]

    return {"months": months, "cells": cells}


def load_map_summary(sqlite_path, days=None, bounds=None, start_date=None, end_date=None):
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
