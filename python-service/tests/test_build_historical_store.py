import sqlite3

import pandas as pd

from scripts.build_historical_store import build, parse_args

MODIS_ARCHIVE_ROWS = [
    # type==0 (vegetation fire), high confidence -> kept.
    {"latitude": -2.10, "longitude": 104.80, "acq_date": "2026-01-05", "acq_time": "0300", "confidence": 92, "frp": 80.0, "satellite": "Terra", "type": 0},
    # type==2 -> dropped by the archive-only type filter.
    {"latitude": -2.10, "longitude": 104.80, "acq_date": "2026-01-05", "acq_time": "0310", "confidence": 92, "frp": 50.0, "satellite": "Terra", "type": 2},
    # FIRMS "low" class (MODIS < 30%) -> dropped. (40% would be "nominal" and kept since 2026-10-20.)
    {"latitude": -2.10, "longitude": 104.80, "acq_date": "2026-01-06", "acq_time": "0300", "confidence": 20, "frp": 20.0, "satellite": "Terra", "type": 0},
]
MODIS_NRT_ROWS = [
    # No `type` column at all for NRT -- cannot apply the type filter here.
    {"latitude": -2.10, "longitude": 104.80, "acq_date": "2026-07-02", "acq_time": "0300", "confidence": 90, "frp": 65.0, "satellite": "Terra"},
]
VIIRS_ARCHIVE_ROWS = [
    {"latitude": -2.11, "longitude": 104.81, "acq_date": "2026-01-05", "acq_time": "0310", "confidence": "h", "frp": 60.0, "satellite": "N20", "type": 0},
    {"latitude": -2.11, "longitude": 104.81, "acq_date": "2026-01-05", "acq_time": "0320", "confidence": "l", "frp": 10.0, "satellite": "N20", "type": 0},
]
VIIRS_NRT_ROWS = []


def _write_csv(path, rows):
    pd.DataFrame(rows).to_csv(path, index=False)
    return str(path)


def _build_fixture_paths(tmp_path):
    modis_archive = _write_csv(tmp_path / "modis_archive.csv", MODIS_ARCHIVE_ROWS)
    modis_nrt = _write_csv(tmp_path / "modis_nrt.csv", MODIS_NRT_ROWS)
    viirs_archive = _write_csv(tmp_path / "viirs_archive.csv", VIIRS_ARCHIVE_ROWS)
    return modis_archive, modis_nrt, viirs_archive


def test_build_historical_store_applies_confidence_and_type_filters(tmp_path):
    modis_archive, modis_nrt, viirs_archive = _build_fixture_paths(tmp_path)
    out = str(tmp_path / "historical.sqlite")
    args = parse_args(["--modis-archive", modis_archive, "--modis-nrt", modis_nrt, "--viirs-archive", viirs_archive, "--out", out])

    row_count, _size = build(args)
    assert row_count > 0

    connection = sqlite3.connect(out)
    data = pd.read_sql_query("SELECT * FROM daily_area_activity", connection)
    connection.close()

    # Only nominal/high-confidence, (archive) type==0 rows should have survived:
    # MODIS archive row1 (80 FRP, type 0) + VIIRS archive row1 (60 FRP, "h")
    # matched into one event on 2026-01-05, plus MODIS NRT row (65 FRP, no
    # type filter available) on 2026-07-02 as its own event.
    total_detections = int(data["detections"].sum())
    assert total_detections == 2
    assert set(data["date"]) == {"2026-01-05", "2026-07-02"}


def test_build_historical_store_is_idempotent_on_repeated_runs(tmp_path):
    modis_archive, modis_nrt, viirs_archive = _build_fixture_paths(tmp_path)
    out = str(tmp_path / "historical.sqlite")
    args = parse_args(["--modis-archive", modis_archive, "--modis-nrt", modis_nrt, "--viirs-archive", viirs_archive, "--out", out])

    first_count, _ = build(args)
    second_count, _ = build(args)

    assert first_count == second_count  # not doubled on a repeated run

    connection = sqlite3.connect(out)
    row_count = pd.read_sql_query("SELECT COUNT(*) AS n FROM daily_area_activity", connection)["n"].iloc[0]
    connection.close()
    assert int(row_count) == second_count
