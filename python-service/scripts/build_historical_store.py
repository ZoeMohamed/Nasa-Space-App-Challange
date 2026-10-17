#!/usr/bin/env python3
"""Offline ingestion script: build the historical SQLite store used by
`fire_pipeline.model.historical_baseline()` and the `/api/historical/calendar`
API endpoint, from raw NASA FIRMS MODIS/VIIRS CSV exports.

This is a standalone CLI tool, run manually/offline -- it is NOT imported by
the live request path (see fire_pipeline/live.py, fire_pipeline/historical.py).

Usage:
    python build_historical_store.py \\
        --modis-archive /path/to/fire_archive_M-C61_*.csv \\
        --modis-nrt /path/to/fire_nrt_M-C61_*.csv \\
        --viirs-archive /path/to/fire_archive_SV-C2_*.csv \\
        --viirs-nrt /path/to/fire_nrt_SV-C2_*.csv \\
        --out python-service/data/historical.sqlite

Any of the four --*-archive/--*-nrt inputs may be omitted; at least one is
required.

Design choices:

- Full rebuild every run. The script always drops/recreates the output
  sqlite file from scratch (see `_fresh_connection`) rather than doing an
  incremental upsert. This trivially guarantees "running ingestion twice
  does not create duplicates" -- there is no merge logic to get wrong, and
  for a one-time/occasional offline step, a full rebuild in a minute or two
  is cheap compared to the complexity of real incremental ingestion.

- Reuses fire_pipeline.clean.harmonize() / add_quality_flags() and the
  SAME confidence filter already used by the live request path
  (fire_pipeline.clean.high_confidence_mask, called internally by
  fire_pipeline.live._fetch_source) -- deliberately NOT re-implemented or
  changed here, so the historical baseline is apples-to-apples with what
  the live pipeline itself considers "high confidence".

- `type == 0` (presumed vegetation fire) filtering is applied ONLY to the
  archive files, because only the archive FIRMS exports include a `type`
  column at all; the NRT exports do not. This is a real, documented
  coverage difference between archive and NRT data (NRT rows cannot be
  filtered to vegetation-fire-only before this field is back-filled by
  NASA), not an inconsistency introduced by this script.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fire_pipeline.clean import add_quality_flags, deduplicate_detections, harmonize, high_confidence_mask  # noqa: E402
from fire_pipeline.harmonize_events import daily_grid_activity  # noqa: E402
from fire_pipeline.matching import match_modis_viirs  # noqa: E402

TABLE = "daily_area_activity"
CELL_SIZE = 0.25


def _read_source(path: str, sensor: str, source: str) -> pd.DataFrame:
    """Read one raw FIRMS CSV, tag it with sensor/source, and apply the
    high-confidence filter (+ type==0 filter, archive only)."""
    header = pd.read_csv(path, nrows=0)
    columns = set(header.columns)
    wanted = ["latitude", "longitude", "acq_date", "acq_time", "confidence", "frp", "satellite"]
    if "type" in columns:
        wanted.append("type")
    usecols = [column for column in wanted if column in columns]
    frame = pd.read_csv(path, usecols=usecols)

    high_confidence = high_confidence_mask(frame)
    frame = frame.loc[high_confidence].copy()

    if "type" in frame.columns:
        # Archive-only: restrict to presumed vegetation fire. NRT exports have
        # no `type` column, so this filter cannot be (and is not) applied to
        # them -- a real coverage difference, not an inconsistency.
        frame = frame[frame["type"] == 0].copy()

    frame["sensor"] = sensor
    frame["source"] = source
    frame["source_file"] = os.path.basename(path)
    return frame


def _load_inputs(args) -> pd.DataFrame:
    jobs = [
        (args.modis_archive, "MODIS", "archive"),
        (args.modis_nrt, "MODIS", "nrt"),
        (args.viirs_archive, "VIIRS", "archive"),
        (args.viirs_nrt, "VIIRS", "nrt"),
    ]
    frames = []
    for path, sensor, source in jobs:
        if not path:
            continue
        print(f"Reading {sensor} {source}: {path}")
        started = time.monotonic()
        frame = _read_source(path, sensor, source)
        print(f"  -> {len(frame):,} rows pass confidence/type filter ({time.monotonic() - started:.1f}s)")
        frames.append(frame)
    if not frames:
        raise SystemExit("No input files given -- pass at least one of --modis-archive/--modis-nrt/--viirs-archive/--viirs-nrt")
    return pd.concat(frames, ignore_index=True, sort=False)


def _fresh_connection(out_path: str) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    if os.path.exists(out_path):
        os.remove(out_path)
    return sqlite3.connect(out_path)


def build(args) -> tuple[int, str]:
    raw = _load_inputs(args)

    print("Harmonizing + quality-filtering combined MODIS+VIIRS rows...")
    detections = add_quality_flags(harmonize(raw))
    detections = detections[detections["quality_ok"]].reset_index(drop=True)
    detections = deduplicate_detections(detections)
    print(f"  -> {len(detections):,} quality-ok detections")

    print("Matching MODIS/VIIRS detections...")
    started = time.monotonic()
    matches = match_modis_viirs(detections) if not detections.empty else pd.DataFrame(columns=["detection_id", "match_status", "matched_detection_id"])
    print(f"  -> matched in {time.monotonic() - started:.1f}s")

    print("Aggregating to daily per-grid-cell totals...")
    daily = daily_grid_activity(detections, matches, cell_size=CELL_SIZE)

    # `source` distinguishes archive vs NRT input rows. Archive and NRT cover
    # non-overlapping date ranges for both sensors (confirmed by audit), so a
    # MATCHED pair's two sides are always from the same source era; tag each
    # harmonized day/cell group by the source of its contributing raw rows.
    if not detections.empty:
        detections_with_source = detections.reset_index(drop=True).copy()
        detections_with_source["grid_lat"] = (np.floor(detections_with_source.latitude / CELL_SIZE) * CELL_SIZE).round(6)
        detections_with_source["grid_lon"] = (np.floor(detections_with_source.longitude / CELL_SIZE) * CELL_SIZE).round(6)
        detections_with_source["area_id"] = detections_with_source.grid_lat.astype(str) + "_" + detections_with_source.grid_lon.astype(str)
        detections_with_source["date"] = pd.to_datetime(detections_with_source.acq_datetime).dt.date.astype("string")
        source_by_group = detections_with_source.groupby(["date", "area_id"]).source.first().reset_index()
        daily = daily.merge(source_by_group, on=["date", "area_id"], how="left")
        daily["source"] = daily["source"].fillna("unknown")
    else:
        daily["source"] = pd.Series(dtype="object")

    print(f"Writing {len(daily):,} daily-area-activity rows to {args.out}")
    connection = _fresh_connection(args.out)
    try:
        daily.to_sql(TABLE, connection, index=False, if_exists="replace")
        connection.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE}_cell ON {TABLE} (grid_lat, grid_lon)")
        connection.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE}_date ON {TABLE} (date)")
        connection.commit()
    finally:
        connection.close()

    size_bytes = os.path.getsize(args.out)
    return len(daily), f"{size_bytes / (1024 * 1024):.2f} MB"


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--modis-archive", help="Path to fire_archive_M-C61_*.csv")
    parser.add_argument("--modis-nrt", help="Path to fire_nrt_M-C61_*.csv")
    parser.add_argument("--viirs-archive", help="Path to fire_archive_SV-C2_*.csv")
    parser.add_argument("--viirs-nrt", help="Path to fire_nrt_SV-C2_*.csv")
    parser.add_argument("--out", required=True, help="Output sqlite path (fully rebuilt from scratch each run)")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    row_count, size = build(args)
    print(f"Done: {row_count:,} rows written to {args.out} ({size})")


if __name__ == "__main__":
    main()
