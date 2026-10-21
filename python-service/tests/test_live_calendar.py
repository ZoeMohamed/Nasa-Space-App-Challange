import sqlite3

import numpy as np
import pandas as pd

from fire_pipeline import live
from fire_pipeline.harmonize_events import build_harmonized_events
from fire_pipeline.live_calendar import daily_cell_counts, event_mask, live_months
from fire_pipeline.matching import match_modis_viirs


def _random_detections(seed=7, n=400):
    rng = np.random.default_rng(seed)
    sensor = rng.choice(["MODIS", "VIIRS"], size=n)
    return pd.DataFrame(
        {
            "latitude": -2.0 + rng.uniform(0, 0.6, n),
            "longitude": 113.0 + rng.uniform(0, 0.6, n),
            "frp": rng.choice([5.0, 10.0, 10.0, 40.0], size=n),  # repeated values exercise the tie rule
            "sensor": sensor,
            "source": np.where(sensor == "MODIS", "MODIS_NRT", "VIIRS_SNPP_NRT"),
            "acq_datetime": pd.Timestamp("2026-10-01") + pd.to_timedelta(rng.integers(0, 4 * 24 * 60, n), unit="m"),
        }
    )


def test_event_mask_counts_match_build_harmonized_events_per_date_and_cell():
    det = _random_detections()
    matches = match_modis_viirs(det)
    assert (matches.match_status == "MATCHED").sum() > 20  # the fixture really has pairs

    def per_cell(frame):
        grid = pd.DataFrame(
            {
                "date": pd.to_datetime(frame.acq_datetime).dt.normalize(),
                "lat": np.floor(frame.latitude / 0.25),
                "lon": np.floor(frame.longitude / 0.25),
            }
        )
        return grid.value_counts().sort_index()

    expected = per_cell(build_harmonized_events(det, matches))
    actual = per_cell(det[event_mask(det, matches)])
    pd.testing.assert_series_equal(actual, expected)


def _markers(rows):
    return pd.DataFrame(
        [
            {"lat": lat, "lng": lon, "frp": frp, "sensor": sensor, "source": source, "acquiredAt": when}
            for lat, lon, frp, sensor, source, when in rows
        ]
    )


def test_daily_cell_counts_uses_modis_plus_suomi_npp_only():
    markers = _markers(
        [
            (-2.1, 113.1, 30.0, "MODIS", "MODIS_NRT", "2026-10-02T06:00:00Z"),
            (-2.1, 113.1, 20.0, "VIIRS", "VIIRS_SNPP_NRT", "2026-10-02T06:10:00Z"),  # pairs with the MODIS row
            (-2.1, 113.1, 25.0, "VIIRS", "VIIRS_NOAA20_NRT", "2026-10-02T05:40:00Z"),  # not in the archive population
        ]
    )
    counts = daily_cell_counts(markers)
    assert counts[["modis_detections", "detections"]].to_dict("records") == [{"modis_detections": 1, "detections": 1}]


def _archive(path, rows):
    columns = ["date", "area_id", "grid_lat", "grid_lon", "detections", "frp_sum", "frp_max", "modis_detections", "viirs_detections", "source"]
    connection = sqlite3.connect(path)
    pd.DataFrame(rows, columns=columns).to_sql("daily_area_activity", connection, index=False)
    connection.close()


def _result(markers, snpp_ok=True, generated="2026-10-21T02:00:00+00:00", hours=30 * 24):
    sources = [
        {"id": "MODIS_NRT", "available": True},
        {"id": "VIIRS_SNPP_NRT", "available": snpp_ok},
    ]
    return live.LiveResult(markers=markers, areas=[], meta={"sources": sources, "windowHours": hours, "generatedAt": generated})


def test_live_months_start_after_the_archive_skip_today_and_compare_month_to_date(tmp_path):
    db = tmp_path / "h.sqlite"
    rows = []
    for year in (2024, 2025):
        rows += [(f"{year}-10-05", "c", -2.25, 113.0, 4, 1.0, 1.0, 3, 1, "archive"), (f"{year}-10-28", "c", -2.25, 113.0, 9, 1.0, 1.0, 9, 0, "archive")]
    rows.append(("2026-09-24", "c", -2.25, 113.0, 2, 1.0, 1.0, 2, 0, "nrt"))  # archive ends here
    _archive(db, rows)
    markers = _markers(
        [
            (-2.1, 113.1, 30.0, "MODIS", "MODIS_NRT", "2026-09-24T06:00:00Z"),  # already in the archive -> ignored
            (-2.1, 113.1, 30.0, "MODIS", "MODIS_NRT", "2026-09-28T06:00:00Z"),
            (-2.1, 113.1, 30.0, "MODIS", "MODIS_NRT", "2026-10-03T06:00:00Z"),
            (-2.1, 113.1, 12.0, "VIIRS", "VIIRS_SNPP_NRT", "2026-10-03T18:00:00Z"),
            (-2.1, 113.1, 30.0, "MODIS", "MODIS_NRT", "2026-10-21T01:00:00Z"),  # today -> incomplete day, ignored
        ]
    )
    body = live_months(_result(markers), str(db), today="2026-10-21")
    assert body["archiveEndDate"] == "2026-09-24" and body["gapDays"] == 0
    assert body["liveStartDate"] == "2026-09-25" and body["liveEndDate"] == "2026-10-20"
    sep, octo = body["months"]
    assert (sep["firstDate"], sep["lastDate"], sep["monthComplete"], sep["modisDetections"]) == ("2026-09-25", "2026-09-30", True, 1)
    assert (octo["daysCovered"], octo["monthComplete"], octo["modisDetections"], octo["detections"]) == (20, False, 1, 1)
    mtd = body["monthToDate"]
    assert mtd["throughDay"] == 20
    assert mtd["prior"] == [{"year": 2024, "modisDetections": 3, "detections": 4}, {"year": 2025, "modisDetections": 3, "detections": 4}]


def test_failed_periods_blank_only_the_affected_months(tmp_path):
    db = tmp_path / "h.sqlite"
    _archive(db, [("2026-09-24", "c", -2.25, 113.0, 2, 1.0, 1.0, 2, 0, "archive")])
    markers = _markers(
        [
            (-2.1, 113.1, 30.0, "MODIS", "MODIS_NRT", "2026-09-28T06:00:00Z"),
            (-2.1, 113.1, 30.0, "MODIS", "MODIS_NRT", "2026-10-10T06:00:00Z"),
        ]
    )
    result = _result(markers)
    result.meta["sources"][0] = {"id": "MODIS_NRT", "available": False, "failedRanges": [["2026-09-26", "2026-09-30"]]}
    sep, octo = live_months(result, str(db), today="2026-10-21")["months"]
    assert sep["modisDetections"] is None and sep["detections"] is None  # a gap must not read as a quiet month
    assert sep["missingDays"]["modisDetections"] == ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"]
    assert octo["modisDetections"] == 1 and octo["missingDays"]["modisDetections"] == []


def test_live_months_report_incomplete_reference_and_gaps(tmp_path):
    db = tmp_path / "h.sqlite"
    _archive(db, [("2026-09-01", "c", -2.25, 113.0, 2, 1.0, 1.0, 2, 0, "archive")])
    markers = _markers([(-2.1, 113.1, 30.0, "MODIS", "MODIS_NRT", "2026-10-15T06:00:00Z")])
    body = live_months(_result(markers, snpp_ok=False, generated="2026-10-21T02:00:00+00:00", hours=7 * 24), str(db), today="2026-10-21")
    assert body["referenceComplete"] is False
    assert all(month["detections"] is None for month in body["months"])  # never a half-population count
    assert body["gapDays"] == 43  # archive ends 09-01, the 7-day window starts 10-15: 09-02..10-14 missing
    assert body["liveStartDate"] == "2026-10-15"
