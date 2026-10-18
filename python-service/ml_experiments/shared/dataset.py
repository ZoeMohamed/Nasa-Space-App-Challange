"""Shared, read-only data loading for ml_experiments/.

This module ONLY reads `historical.sqlite` (the same offline store built by
`scripts/build_historical_store.py` and served read-only by
`fire_pipeline/historical.py`). It never writes to it, never imports from
`fire_pipeline/`, and has no effect on the production application -- an
experiment script can be deleted entirely with zero impact on
`main.py`/`live.py`/the frontend.
"""

from __future__ import annotations

import os
import sqlite3

import pandas as pd

TABLE = "daily_area_activity"

# Mirrors src/lib/filters.ts's REGION_OPTIONS exactly (same 5 provinces, same
# bounding boxes) so the experiment's "region" grouping matches what the
# product already shows users, rather than inventing a new partition. Same
# caveat applies here as there: these are approximate rectangles for
# filtering, NOT official administrative polygons. A cell can fall inside
# more than one region's box (the real product's regions overlap too, e.g.
# Kalimantan Tengah and Kalimantan Selatan both cover lon ~114.0-114.5) --
# this is inherited bbox-filter behavior, not something introduced here.
REGIONS: dict[str, tuple[float, float, float, float]] = {
    # name: (min_lat, max_lat, min_lon, max_lon)
    "kalimantan-tengah": (-3.5, 0.5, 110.5, 114.5),
    "riau": (-1.5, 2.5, 100.0, 103.5),
    "sumatera-selatan": (-4.5, -1.0, 102.0, 106.0),
    "jambi": (-2.5, -0.5, 101.5, 104.5),
    "kalimantan-selatan": (-4.5, -1.0, 114.0, 116.5),
}


def default_historical_db_path() -> str:
    """Same resolution logic as fire_pipeline.live.default_historical_db_path()
    (re-implemented, not imported, to keep this module import-independent of
    fire_pipeline/), honoring the same FIRE_HISTORICAL_DB_PATH override so
    tests can point this at a fixture database.
    """
    override = os.getenv("FIRE_HISTORICAL_DB_PATH")
    if override:
        return override
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "data", "historical.sqlite")


def load_daily_area_activity(sqlite_path: str | None = None) -> pd.DataFrame:
    """Load the raw daily_area_activity table, unmodified.

    Returns an empty DataFrame (not an error) if the store doesn't exist --
    callers must handle that explicitly (this is a real possible state, not
    an edge case to paper over).
    """
    path = sqlite_path or default_historical_db_path()
    if not path or not os.path.exists(path):
        return pd.DataFrame()
    connection = sqlite3.connect(path)
    try:
        df = pd.read_sql_query(f"SELECT * FROM {TABLE}", connection)
    finally:
        connection.close()
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    df["month"] = df["date"].dt.month
    return df


def assign_regions(df: pd.DataFrame) -> pd.DataFrame:
    """Add one boolean column per region (`region_<name>`), True where that
    row's (grid_lat, grid_lon) falls inside that region's bounding box.
    A row may be True for more than one region (see REGIONS' docstring note
    on overlap) or for none (outside all 5 defined regions).
    """
    result = df.copy()
    for name, (min_lat, max_lat, min_lon, max_lon) in REGIONS.items():
        result[f"region_{name}"] = (
            result["grid_lat"].between(min_lat, max_lat) & result["grid_lon"].between(min_lon, max_lon)
        )
    return result
