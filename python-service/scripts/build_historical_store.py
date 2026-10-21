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

Any of the --*-archive/--*-nrt inputs may be omitted; at least one is
required.

VIIRS platforms are kept apart, one table each, because live data mixes up to
three VIIRS satellites and their daily counts are not interchangeable
(ml_experiments/audit_2026_10, finding A1):

- `daily_area_activity`          MODIS + VIIRS Suomi-NPP (--viirs-archive / --viirs-nrt,
                                 FIRMS product SV-C2). The table every existing reader uses.
- `daily_area_activity_noaa20`   MODIS + VIIRS NOAA-20 (--viirs-noaa20-archive /
                                 --viirs-noaa20-nrt, FIRMS product J1V-C2). Only written when
                                 those files are given; nothing is created or estimated for it
                                 otherwise.

A `store_info` table records which tables exist and what went into each.

Design choices:

- Full rebuild every run. The script always drops/recreates the output
  sqlite file from scratch (see `_fresh_connection`) rather than doing an
  incremental upsert. This trivially guarantees "running ingestion twice
  does not create duplicates" -- there is no merge logic to get wrong, and
  for a one-time/occasional offline step, a full rebuild in a minute or two
  is cheap compared to the complexity of real incremental ingestion.

- Reuses fire_pipeline.clean.harmonize() / add_quality_flags() and the
  SAME default confidence filter as the live request path
  (fire_pipeline.clean.usable_confidence_mask: FIRMS nominal + high, used
  by fire_pipeline.live.build_live_result) -- deliberately NOT
  re-implemented here, so the historical baseline stays apples-to-apples
  with the live detections it is compared against. (Until 2026-10-20 both
  used the stricter high_confidence_mask, which kept only saturated VIIRS
  pixels; the store must be rebuilt whenever this filter changes.)

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

from fire_pipeline.clean import add_quality_flags, deduplicate_detections, harmonize, usable_confidence_mask  # noqa: E402
from fire_pipeline.harmonize_events import daily_grid_activity  # noqa: E402
from fire_pipeline.matching import match_modis_viirs  # noqa: E402

TABLE = "daily_area_activity"
NOAA20_TABLE = "daily_area_activity_noaa20"
INFO_TABLE = "store_info"
CELL_SIZE = 0.25
# FIRMS `satellite` codes expected for each VIIRS input; a mismatch is reported (not fatal) so a
# NOAA-20 file passed as --viirs-archive doesn't go unnoticed.
EXPECTED_SATELLITE_CODES = {"SNPP": {"N", "NPP", "SNPP"}, "NOAA20": {"N20", "1", "J1"}}


def _read_source(path: str, sensor: str, source: str, platform: str | None = None) -> pd.DataFrame:
    """Read one raw FIRMS CSV, tag it with sensor/source, and apply the
    default nominal+high confidence filter (+ type==0 filter, archive only)."""
    header = pd.read_csv(path, nrows=0)
    columns = set(header.columns)
    wanted = ["latitude", "longitude", "acq_date", "acq_time", "confidence", "frp", "satellite"]
    if "type" in columns:
        wanted.append("type")
    usecols = [column for column in wanted if column in columns]
    frame = pd.read_csv(path, usecols=usecols)

    frame = frame.loc[usable_confidence_mask(frame)].copy()

    if "type" in frame.columns:
        # Archive-only: restrict to presumed vegetation fire. NRT exports have
        # no `type` column, so this filter cannot be (and is not) applied to
        # them -- a real coverage difference, not an inconsistency.
        frame = frame[frame["type"] == 0].copy()

    frame["sensor"] = sensor
    frame["source"] = source
    frame["source_file"] = os.path.basename(path)
    if platform and "satellite" in frame.columns and not frame.empty:
        codes = set(frame["satellite"].astype(str).str.strip().str.upper().unique())
        unexpected = codes - EXPECTED_SATELLITE_CODES[platform]
        if unexpected:
            print(f"  WARNING: {os.path.basename(path)} given as VIIRS {platform} but has satellite codes {sorted(unexpected)}")
    return frame


def _read_jobs(jobs) -> list[pd.DataFrame]:
    frames = []
    for path, sensor, source, platform in jobs:
        if not path:
            continue
        label = f"{sensor} {platform} {source}" if platform else f"{sensor} {source}"
        print(f"Reading {label}: {path}")
        started = time.monotonic()
        frame = _read_source(path, sensor, source, platform)
        print(f"  -> {len(frame):,} rows pass confidence/type filter ({time.monotonic() - started:.1f}s)")
        frames.append(frame)
    return frames


def _load_inputs(args) -> dict[str, list[pd.DataFrame]]:
    """Raw frames per group: "modis", "snpp", "noaa20" (empty list when not given)."""
    groups = {
        "modis": _read_jobs([(args.modis_archive, "MODIS", "archive", None), (args.modis_nrt, "MODIS", "nrt", None)]),
        "snpp": _read_jobs([(args.viirs_archive, "VIIRS", "archive", "SNPP"), (args.viirs_nrt, "VIIRS", "nrt", "SNPP")]),
        "noaa20": _read_jobs(
            [
                (getattr(args, "viirs_noaa20_archive", None), "VIIRS", "archive", "NOAA20"),
                (getattr(args, "viirs_noaa20_nrt", None), "VIIRS", "nrt", "NOAA20"),
            ]
        ),
    }
    if not any(groups.values()):
        raise SystemExit(
            "No input files given -- pass at least one of --modis-archive/--modis-nrt/--viirs-archive/--viirs-nrt/"
            "--viirs-noaa20-archive/--viirs-noaa20-nrt"
        )
    return groups


def _fresh_connection(out_path: str) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    if os.path.exists(out_path):
        os.remove(out_path)
    return sqlite3.connect(out_path)


def build(args) -> tuple[int, str]:
    """Build every table the inputs allow. Returns (rows in the main MODIS + Suomi-NPP table, size)."""
    groups = _load_inputs(args)
    tables: dict[str, pd.DataFrame] = {}
    info = []
    populations = [(TABLE, "MODIS + VIIRS SNPP", groups["snpp"])]
    if groups["noaa20"]:
        populations.append((NOAA20_TABLE, "MODIS + VIIRS NOAA20", groups["noaa20"]))
    for table, population, viirs_frames in populations:
        frames = groups["modis"] + viirs_frames
        if not frames:
            continue
        print(f"\n== {table} ({population}) ==")
        daily = _build_daily(pd.concat(frames, ignore_index=True, sort=False))
        tables[table] = daily
        info.append(
            {
                "table_name": table,
                "population": population,
                "rows": int(len(daily)),
                "first_date": str(daily["date"].min()) if len(daily) else None,
                "last_date": str(daily["date"].max()) if len(daily) else None,
                "nrt_rows": int((daily["source"] == "nrt").sum()) if len(daily) else 0,
                "input_files": ", ".join(sorted({str(f["source_file"].iloc[0]) for f in frames if len(f)})),
            }
        )

    connection = _fresh_connection(args.out)
    try:
        for table, daily in tables.items():
            print(f"Writing {len(daily):,} rows to {args.out}:{table}")
            daily.to_sql(table, connection, index=False, if_exists="replace")
            connection.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_cell ON {table} (grid_lat, grid_lon)")
            connection.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_date ON {table} (date)")
        built_at = pd.Timestamp.now(tz="UTC").isoformat()
        pd.DataFrame([{**row, "built_at": built_at} for row in info]).to_sql(INFO_TABLE, connection, index=False, if_exists="replace")
        connection.commit()
    finally:
        connection.close()

    size_bytes = os.path.getsize(args.out)
    return len(tables.get(TABLE, [])), f"{size_bytes / (1024 * 1024):.2f} MB"


def _build_daily(raw: pd.DataFrame) -> pd.DataFrame:
    """One population (MODIS + one VIIRS platform) -> daily per-cell table rows."""
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
    return daily


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--modis-archive", help="Path to fire_archive_M-C61_*.csv")
    parser.add_argument("--modis-nrt", help="Path to fire_nrt_M-C61_*.csv")
    parser.add_argument("--viirs-archive", help="Path to fire_archive_SV-C2_*.csv")
    parser.add_argument("--viirs-nrt", help="Path to fire_nrt_SV-C2_*.csv")
    parser.add_argument("--viirs-noaa20-archive", help="Path to fire_archive_J1V-C2_*.csv (VIIRS NOAA-20); builds daily_area_activity_noaa20")
    parser.add_argument("--viirs-noaa20-nrt", help="Path to fire_nrt_J1V-C2_*.csv (VIIRS NOAA-20)")
    parser.add_argument("--out", required=True, help="Output sqlite path (fully rebuilt from scratch each run)")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    row_count, size = build(args)
    print(f"Done: {row_count:,} rows written to {args.out} ({size})")


if __name__ == "__main__":
    main()
