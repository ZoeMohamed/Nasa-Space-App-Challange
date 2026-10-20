import sqlite3

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import main


def _write_fixture_db(path):
    rows = [
        {"date": "2025-01-05", "area_id": "-2.25_104.75", "grid_lat": -2.25, "grid_lon": 104.75, "detections": 3, "modis_detections": 2, "viirs_detections": 1, "frp_sum": 150.0, "frp_max": 80.0, "source": "archive"},
        {"date": "2025-02-10", "area_id": "-2.25_104.75", "grid_lat": -2.25, "grid_lon": 104.75, "detections": 1, "modis_detections": 1, "viirs_detections": 0, "frp_sum": 40.0, "frp_max": 40.0, "source": "archive"},
        {"date": "2025-01-20", "area_id": "0.0_110.0", "grid_lat": 0.0, "grid_lon": 110.0, "detections": 5, "modis_detections": 3, "viirs_detections": 2, "frp_sum": 300.0, "frp_max": 90.0, "source": "archive"},
        # Cell C: 3 days within January (1, 2, 3 detections) + 1 day in February (10
        # detections) -- deliberately shaped so monthly-summed stats and daily stats
        # diverge (daily_mean=4.0 vs monthly_mean=8.0), to prove the two are genuinely
        # different quantities, not just the same number computed two ways.
        {"date": "2025-01-02", "area_id": "5.0_120.0", "grid_lat": 5.0, "grid_lon": 120.0, "detections": 1, "modis_detections": 1, "viirs_detections": 0, "frp_sum": 10.0, "frp_max": 10.0, "source": "archive"},
        {"date": "2025-01-08", "area_id": "5.0_120.0", "grid_lat": 5.0, "grid_lon": 120.0, "detections": 2, "modis_detections": 2, "viirs_detections": 0, "frp_sum": 20.0, "frp_max": 15.0, "source": "archive"},
        {"date": "2025-01-15", "area_id": "5.0_120.0", "grid_lat": 5.0, "grid_lon": 120.0, "detections": 3, "modis_detections": 3, "viirs_detections": 0, "frp_sum": 30.0, "frp_max": 20.0, "source": "archive"},
        {"date": "2025-02-20", "area_id": "5.0_120.0", "grid_lat": 5.0, "grid_lon": 120.0, "detections": 10, "modis_detections": 10, "viirs_detections": 0, "frp_sum": 100.0, "frp_max": 70.0, "source": "archive"},
    ]
    connection = sqlite3.connect(path)
    pd.DataFrame(rows).to_sql("daily_area_activity", connection, index=False, if_exists="replace")
    connection.close()


def test_historical_calendar_endpoint_returns_expected_shape(tmp_path, monkeypatch):
    db_path = tmp_path / "historical.sqlite"
    _write_fixture_db(db_path)
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(db_path))

    client = TestClient(main.app)
    response = client.get("/api/historical/calendar")
    assert response.status_code == 200
    body = response.json()

    assert set(body.keys()) == {"months", "cells"}

    months_by_key = {(month["year"], month["month"]): month for month in body["months"]}
    assert (2025, 1) in months_by_key
    jan = months_by_key[(2025, 1)]
    assert jan["detections"] == 14  # 3 (cell A) + 5 (cell B) + 1+2+3 (cell C)
    assert jan["modisDetections"] == 11
    assert jan["viirsDetections"] == 3
    assert jan["frpSum"] == 510.0

    assert (2025, 2) in months_by_key
    assert months_by_key[(2025, 2)]["detections"] == 11  # 1 (cell A) + 10 (cell C)

    cells_by_key = {(cell["gridLat"], cell["gridLon"]): cell for cell in body["cells"]}
    assert (-2.25, 104.75) in cells_by_key
    cell_a = cells_by_key[(-2.25, 104.75)]
    assert cell_a["sampleMonths"] == 2
    assert cell_a["monthlyMeanDetections"] == 2.0  # (3 + 1) / 2 months

    # Regression (day-vs-month unit mismatch fix): cell C has 3 days within January
    # (1, 2, 3 detections) and 1 day in February (10 detections). The monthly-summed
    # stats and the daily stats must be genuinely different numbers here -- if a caller
    # swapped one for the other, this would catch it.
    assert (5.0, 120.0) in cells_by_key
    cell_c = cells_by_key[(5.0, 120.0)]
    assert cell_c["sampleDays"] == 4
    assert cell_c["dailyMeanDetections"] == 4.0  # (1+2+3+10) / 4 days
    assert cell_c["dailyStdDetections"] == pytest.approx(4.0825, rel=1e-3)
    assert cell_c["sampleMonths"] == 2
    assert cell_c["monthlyMeanDetections"] == 8.0  # (6 [Jan sum] + 10 [Feb sum]) / 2 months
    assert cell_c["monthlyStdDetections"] == pytest.approx(2.8284, rel=1e-3)
    assert cell_c["dailyMeanDetections"] != cell_c["monthlyMeanDetections"]


def test_historical_calendar_endpoint_filters_by_bounding_box(tmp_path, monkeypatch):
    db_path = tmp_path / "historical.sqlite"
    _write_fixture_db(db_path)
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(db_path))

    client = TestClient(main.app)
    response = client.get("/api/historical/calendar", params={"min_lat": -3, "max_lat": -1, "min_lon": 104, "max_lon": 105})
    assert response.status_code == 200
    body = response.json()

    assert len(body["cells"]) == 1
    assert body["cells"][0]["gridLat"] == -2.25


def test_historical_calendar_endpoint_handles_missing_store(tmp_path, monkeypatch):
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(tmp_path / "does_not_exist.sqlite"))
    client = TestClient(main.app)
    response = client.get("/api/historical/calendar")
    assert response.status_code == 200
    assert response.json() == {"months": [], "cells": []}


def test_historical_map_endpoint_returns_grid_markers_for_window(tmp_path, monkeypatch):
    db_path = tmp_path / "historical.sqlite"
    _write_fixture_db(db_path)
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(db_path))

    client = TestClient(main.app)
    response = client.get("/api/historical/map", params={"days": 7})

    assert response.status_code == 200
    body = response.json()
    assert body["meta"]["source"] == "historical"
    assert body["meta"]["days"] == 7
    assert len(body["markers"]) == 1
    assert body["markers"][0]["label"].startswith("Historical grid")


def test_cell_baseline_uses_viirs_era_only_but_months_keep_every_year(tmp_path):
    import sqlite3 as _sqlite3

    from fire_pipeline.historical import load_calendar_summary

    path = tmp_path / "era.sqlite"
    con = _sqlite3.connect(path)
    con.execute(
        "CREATE TABLE daily_area_activity (date TEXT, area_id TEXT, grid_lat REAL, grid_lon REAL, detections INTEGER,"
        " frp_sum REAL, frp_max REAL, modis_detections INTEGER, viirs_detections INTEGER, source TEXT)"
    )
    rows = [
        ("2010-09-01", "a", 1.0, 2.0, 1, 1.0, 1.0, 1, 0, "x"),  # MODIS-only era -> excluded from baseline
        ("2010-09-02", "a", 1.0, 2.0, 1, 1.0, 1.0, 1, 0, "x"),
        ("2020-09-01", "a", 1.0, 2.0, 10, 1.0, 1.0, 2, 8, "x"),
        ("2020-09-02", "a", 1.0, 2.0, 20, 1.0, 1.0, 2, 18, "x"),
    ]
    con.executemany("INSERT INTO daily_area_activity VALUES (?,?,?,?,?,?,?,?,?,?)", rows)
    con.commit()
    con.close()

    result = load_calendar_summary(str(path))
    assert {m["year"] for m in result["months"]} == {2010, 2020}
    cell = result["cells"][0]
    assert cell["sampleDays"] == 2
    assert cell["dailyMeanDetections"] == pytest.approx(15.0)
