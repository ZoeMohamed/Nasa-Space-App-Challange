"""Area of interest drawn by the user (calendar 'Gambar area di peta')."""

import sqlite3

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import main
from fire_pipeline.admin_lookup import cells_intersecting_polygon, parse_polygon

COLUMNS = ["date", "area_id", "grid_lat", "grid_lon", "detections", "frp_sum", "frp_max", "modis_detections", "viirs_detections", "source"]


def test_parse_polygon_accepts_lat_lon_pairs_and_rejects_bad_input():
    polygon = parse_polygon("-2.0,113.0;-2.0,113.6;-1.5,113.6;-1.5,113.0")
    assert polygon.bounds == (113.0, -2.0, 113.6, -1.5)  # shapely is (lon, lat)
    for bad, message in [
        ("-2,113;-2,114", "3 to"),
        ("a,b;c,d;e,f", "lat,lon"),
        ("-2,113,5;-2,114;-1,114", "lat,lon"),
        ("-95,113;-2,114;-1,114", "out of range"),
        ("-2,113;-2,114;-2,115", "no area"),
    ]:
        with pytest.raises(ValueError, match=message):
            parse_polygon(bad)
    assert parse_polygon(None) is None


def test_self_intersecting_outline_is_repaired_not_rejected():
    bowtie = parse_polygon("0,0;1,1;1,0;0,1")  # points clicked out of order
    assert bowtie.area > 0


def test_cells_touching_the_drawn_area_are_kept():
    polygon = parse_polygon("-2.0,113.1;-2.0,113.3;-1.9,113.3;-1.9,113.1")  # small box inside cell (-2.0, 113.0) and (-2.0, 113.25)
    cells = cells_intersecting_polygon([-2.0, -2.0, -1.5, -2.0], [113.0, 113.25, 113.0, 114.0], polygon)
    assert cells == {(-2.0, 113.0), (-2.0, 113.25)}


def test_calendar_endpoint_filters_to_the_drawn_area_and_reports_its_cells(tmp_path, monkeypatch):
    db = tmp_path / "h.sqlite"
    rows = [
        ("2020-09-01", "a", -2.0, 113.0, 5, 1.0, 1.0, 5, 0, "archive"),
        ("2020-09-02", "a", -2.0, 113.0, 3, 1.0, 1.0, 3, 0, "archive"),
        ("2020-09-01", "b", 1.0, 101.0, 50, 1.0, 1.0, 50, 0, "archive"),  # outside the drawn area
    ]
    connection = sqlite3.connect(db)
    pd.DataFrame(rows, columns=COLUMNS).to_sql("daily_area_activity", connection, index=False)
    connection.close()
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(db))
    client = TestClient(main.app)
    body = client.get("/api/historical/calendar", params={"polygon": "-2.1,112.9;-2.1,113.2;-1.8,113.2;-1.8,112.9"}).json()
    assert body["months"][0]["detections"] == 8
    assert body["areaCells"] == 1
    assert client.get("/api/historical/calendar", params={"polygon": "1,2;3,4"}).status_code == 422
