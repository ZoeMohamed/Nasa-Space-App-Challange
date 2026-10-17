import sqlite3

import pandas as pd
from fastapi.testclient import TestClient

import main


def _write_fixture_db(path):
    rows = [
        {"date": "2025-01-05", "area_id": "-2.25_104.75", "grid_lat": -2.25, "grid_lon": 104.75, "detections": 3, "modis_detections": 2, "viirs_detections": 1, "frp_sum": 150.0, "frp_max": 80.0, "source": "archive"},
        {"date": "2025-02-10", "area_id": "-2.25_104.75", "grid_lat": -2.25, "grid_lon": 104.75, "detections": 1, "modis_detections": 1, "viirs_detections": 0, "frp_sum": 40.0, "frp_max": 40.0, "source": "archive"},
        {"date": "2025-01-20", "area_id": "0.0_110.0", "grid_lat": 0.0, "grid_lon": 110.0, "detections": 5, "modis_detections": 3, "viirs_detections": 2, "frp_sum": 300.0, "frp_max": 90.0, "source": "archive"},
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
    assert jan["detections"] == 8  # 3 (cell A) + 5 (cell B)
    assert jan["modisDetections"] == 5
    assert jan["viirsDetections"] == 3
    assert jan["frpSum"] == 450.0

    assert (2025, 2) in months_by_key
    assert months_by_key[(2025, 2)]["detections"] == 1

    cells_by_key = {(cell["gridLat"], cell["gridLon"]): cell for cell in body["cells"]}
    assert (-2.25, 104.75) in cells_by_key
    cell_a = cells_by_key[(-2.25, 104.75)]
    assert cell_a["sampleMonths"] == 2
    assert cell_a["monthlyMeanDetections"] == 2.0  # (3 + 1) / 2 months


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
