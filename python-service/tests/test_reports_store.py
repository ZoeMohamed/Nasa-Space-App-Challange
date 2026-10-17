import pytest

from fire_pipeline import reports
from fire_pipeline.correlation import correlate_report


def test_create_report_rejects_out_of_range_lat(tmp_path):
    db_path = str(tmp_path / "reports.sqlite")
    with pytest.raises(ValueError):
        reports.create_report(lat=95.0, lon=104.8, description="x", submitter_token="t", sqlite_path=db_path)


def test_create_report_rejects_empty_description(tmp_path):
    db_path = str(tmp_path / "reports.sqlite")
    with pytest.raises(ValueError):
        reports.create_report(lat=-2.0, lon=104.8, description="   ", submitter_token="t", sqlite_path=db_path)


def test_create_and_get_report_round_trip(tmp_path):
    db_path = str(tmp_path / "reports.sqlite")
    created = reports.create_report(lat=-2.0, lon=104.8, description="Smoke", submitter_token="tok", sqlite_path=db_path)
    assert created["status"] == "submitted"
    assert created["observedAt"] == created["createdAt"]

    fetched = reports.get_report(created["id"], sqlite_path=db_path)
    assert fetched["id"] == created["id"]
    assert fetched["satelliteLinks"] == []


def test_update_report_status_rejects_invalid_value(tmp_path):
    db_path = str(tmp_path / "reports.sqlite")
    created = reports.create_report(lat=-2.0, lon=104.8, description="Smoke", submitter_token="tok", sqlite_path=db_path)
    with pytest.raises(ValueError):
        reports.update_report_status(created["id"], "bogus", sqlite_path=db_path)


def test_update_report_status_returns_none_for_missing_id(tmp_path):
    db_path = str(tmp_path / "reports.sqlite")
    assert reports.update_report_status("missing-id", "verified", sqlite_path=db_path) is None


def test_save_links_persists_rows_visible_via_get_report(tmp_path):
    db_path = str(tmp_path / "reports.sqlite")
    created = reports.create_report(lat=-2.0, lon=104.8, description="Smoke", submitter_token="tok", sqlite_path=db_path)
    reports.save_links(
        created["id"],
        [{"markerId": "marker-1", "distanceKm": 1.2, "timeDiffMin": 15.0}],
        sqlite_path=db_path,
    )
    fetched = reports.get_report(created["id"], sqlite_path=db_path)
    assert len(fetched["satelliteLinks"]) == 1
    assert fetched["satelliteLinks"][0]["markerId"] == "marker-1"
    assert fetched["satelliteLinks"][0]["distanceKm"] == 1.2


def test_correlate_report_distance_and_time_window():
    report = {"lat": -2.0, "lon": 104.8, "observed_at": "2026-10-17T03:00:00+00:00"}
    markers = [
        {"id": "near", "lat": -2.005, "lng": 104.805, "acquiredAt": "2026-10-17T02:30:00Z", "sensor": "VIIRS", "matchStatus": "UNMATCHED", "frp": 10.0},
        {"id": "too-far", "lat": -3.5, "lng": 106.3, "acquiredAt": "2026-10-17T02:30:00Z", "sensor": "MODIS", "matchStatus": "UNMATCHED", "frp": 20.0},
        {"id": "too-stale", "lat": -2.005, "lng": 104.805, "acquiredAt": "2026-10-14T02:30:00Z", "sensor": "MODIS", "matchStatus": "UNMATCHED", "frp": 20.0},
    ]
    links = correlate_report(report, markers)
    assert {link["markerId"] for link in links} == {"near"}
    assert links[0]["distanceKm"] < 5.0
