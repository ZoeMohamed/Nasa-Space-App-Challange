"""P0 (audit_2026_10): comparable live-vs-archive populations, minimum history, NRT tagging, and
per-platform archive tables."""

import sqlite3

import pandas as pd
from fastapi.testclient import TestClient

import main
from fire_pipeline import live
from fire_pipeline.historical import (
    MIN_BASELINE_SAMPLE_DAYS,
    REFERENCE_TABLES,
    available_references,
    compare_live_to_baseline,
    load_calendar_summary,
)
from scripts.build_historical_store import build, parse_args

COLUMNS = ["date", "area_id", "grid_lat", "grid_lon", "detections", "frp_sum", "frp_max", "modis_detections", "viirs_detections", "source"]


def _row(date, lat, lon, detections, source="archive"):
    return (date, f"{lat}_{lon}", lat, lon, detections, 1.0, 1.0, 0, detections, source)


def _write_table(path, table, rows):
    connection = sqlite3.connect(path)
    pd.DataFrame(rows, columns=COLUMNS).to_sql(table, connection, index=False, if_exists="replace")
    connection.close()


def _history(lat, lon, days, value=2, start="2020-08-01"):
    return [_row(str(pd.Timestamp(start) + pd.Timedelta(days=i))[:10], lat, lon, value + (i % 2)) for i in range(days)]


# --- calendar summary: NRT rows and minimum history -------------------------------------------------


def test_nrt_rows_are_tagged_in_months_and_left_out_of_the_baseline(tmp_path):
    db = tmp_path / "h.sqlite"
    rows = _history(-2.0, 113.0, 12) + [_row("2026-07-02", -2.0, 113.0, 500, "nrt"), _row("2026-06-30", -2.0, 113.0, 3), _row("2026-06-29", -2.0, 113.0, 3)]
    rows += [_row("2026-07-05", -2.0, 113.0, 7, "archive")]  # same month as an NRT row -> "mixed"
    _write_table(db, "daily_area_activity", rows)
    result = load_calendar_summary(str(db))
    months = {(m["year"], m["month"]): m for m in result["months"]}
    assert months[(2026, 7)]["dataStatus"] == "mixed"
    assert months[(2026, 7)]["nrtDetections"] == 500
    assert months[(2026, 6)]["dataStatus"] == "archive"
    cell = result["cells"][0]
    assert cell["sampleDays"] == 15  # 12 + 2 June days + the 5 July archive day; the NRT day is excluded
    assert cell["dailyMeanDetections"] < 10  # the 500-detection NRT day would dominate the mean otherwise
    assert result["baseline"]["excludedNrtRows"] == 1
    assert result["baseline"]["nrtDateRange"] == ["2026-07-02", "2026-07-02"]


def test_cells_below_minimum_history_are_labelled_not_dropped(tmp_path):
    db = tmp_path / "h.sqlite"
    rows = _history(-2.0, 113.0, MIN_BASELINE_SAMPLE_DAYS) + _history(1.0, 101.0, MIN_BASELINE_SAMPLE_DAYS - 1)
    _write_table(db, "daily_area_activity", rows)
    cells = {(c["gridLat"], c["gridLon"]): c for c in load_calendar_summary(str(db))["cells"]}
    assert cells[(-2.0, 113.0)]["baselineStatus"] == "ok"
    assert cells[(1.0, 101.0)]["baselineStatus"] == "insufficient-history"
    assert cells[(1.0, 101.0)]["dailyStdDetections"] is not None  # value still reported, just not used


# --- compare_live_to_baseline -----------------------------------------------------------------------


def _area(lat, lon, reference, all_events, platform="SNPP"):
    return {"gridLat": lat, "gridLon": lon, "detections": all_events, "referenceEvents": {platform: reference}}


def test_comparison_uses_reference_counts_and_gives_every_cell_one_status(tmp_path):
    db = tmp_path / "h.sqlite"
    rows = _history(-2.0, 113.0, 20) + _history(-1.0, 113.0, 20) + _history(0.0, 113.0, 5) + _history(2.0, 113.0, 20)
    _write_table(db, "daily_area_activity", rows)
    live_areas = [
        _area(-2.0, 113.0, 40, 90),  # far above mean ~2.5 -> unusual
        _area(-1.0, 113.0, 2, 30),  # all satellites = 30 would look unusual; the reference count of 2 does not
        _area(0.0, 113.0, 40, 40),  # only 5 days of history
        _area(5.0, 120.0, 3, 3),  # never seen in the archive
        _area(2.0, 113.0, 0, 6),  # activity only from non-reference satellites
    ]
    result = compare_live_to_baseline(live_areas, str(db), "SNPP")
    status = {(c["gridLat"], c["gridLon"]): c["status"] for c in result["cells"]}
    assert status == {
        (-2.0, 113.0): "unusual",
        (-1.0, 113.0): "within-baseline",
        (0.0, 113.0): "insufficient-history",
        (5.0, 120.0): "no-history",
        (2.0, 113.0): "not-seen-by-reference",
    }
    summary = result["summary"]
    assert summary["liveCells"] == 5 and summary["comparedCells"] == 2 and summary["unusualCells"] == 1
    assert summary["insufficientHistoryCells"] == summary["noHistoryCells"] == summary["notSeenByReferenceCells"] == 1
    assert result["baseline"]["population"] == "MODIS + VIIRS SNPP"


def test_comparison_against_noaa20_reads_its_own_table(tmp_path):
    db = tmp_path / "h.sqlite"
    _write_table(db, "daily_area_activity", _history(-2.0, 113.0, 20, value=2))
    _write_table(db, REFERENCE_TABLES["NOAA20"], _history(-2.0, 113.0, 20, value=50))
    assert available_references(str(db)) == ["SNPP", "NOAA20"]
    result = compare_live_to_baseline([_area(-2.0, 113.0, 40, 40, platform="NOAA20")], str(db), "NOAA20")
    assert result["cells"][0]["status"] == "within-baseline"  # 40 is normal against the NOAA-20 history (~50)


def test_missing_noaa20_table_is_not_a_reference(tmp_path):
    db = tmp_path / "h.sqlite"
    _write_table(db, "daily_area_activity", _history(-2.0, 113.0, 20))
    assert available_references(str(db)) == ["SNPP"]


# --- /api/historical/unusual -------------------------------------------------------------------------


def _fake_result(populations, areas):
    return live.LiveResult(markers=pd.DataFrame(), areas=areas, meta={"generatedAt": "2026-10-21T02:39:00Z", "referencePopulations": populations})


def test_unusual_endpoint_compares_on_snpp_when_available(tmp_path, monkeypatch):
    db = tmp_path / "h.sqlite"
    _write_table(db, "daily_area_activity", _history(-2.0, 113.0, 20))
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(db))
    populations = {"SNPP": {"available": True, "reason": None}, "NOAA20": {"available": True, "reason": None}}
    monkeypatch.setattr(main, "load_live_result", lambda *a, **k: _fake_result(populations, [_area(-2.0, 113.0, 40, 90)]))
    body = TestClient(main.app).get("/api/historical/unusual").json()
    assert body["comparable"] is True and body["reference"] == "SNPP"
    assert body["summary"]["unusualCells"] == 1
    assert body["archiveReferences"] == ["SNPP"]


def test_unusual_endpoint_refuses_to_mix_satellites_when_snpp_is_missing(tmp_path, monkeypatch):
    db = tmp_path / "h.sqlite"
    _write_table(db, "daily_area_activity", _history(-2.0, 113.0, 20))
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(db))
    populations = {"SNPP": {"available": False, "reason": "VIIRS_SNPP_NRT unavailable"}, "NOAA20": {"available": True, "reason": None}}
    monkeypatch.setattr(main, "load_live_result", lambda *a, **k: _fake_result(populations, [_area(-2.0, 113.0, 40, 90, platform="NOAA20")]))
    body = TestClient(main.app).get("/api/historical/unusual").json()
    assert body["comparable"] is False
    assert "SNPP: live VIIRS_SNPP_NRT unavailable" in body["reason"]
    assert "NOAA20: no archive table built" in body["reason"]
    assert body["summary"] is None and body["cells"] == []


def test_unusual_endpoint_uses_noaa20_once_its_archive_exists(tmp_path, monkeypatch):
    db = tmp_path / "h.sqlite"
    _write_table(db, "daily_area_activity", _history(-2.0, 113.0, 20))
    _write_table(db, REFERENCE_TABLES["NOAA20"], _history(-2.0, 113.0, 20))
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(db))
    populations = {"SNPP": {"available": False, "reason": "VIIRS_SNPP_NRT unavailable"}, "NOAA20": {"available": True, "reason": None}}
    monkeypatch.setattr(main, "load_live_result", lambda *a, **k: _fake_result(populations, [_area(-2.0, 113.0, 40, 90, platform="NOAA20")]))
    body = TestClient(main.app).get("/api/historical/unusual").json()
    assert body["comparable"] is True and body["reference"] == "NOAA20"


# --- live pipeline ------------------------------------------------------------------------------------


def _frame(source, sensor, rows):
    frame = pd.DataFrame(rows)
    frame["sensor"], frame["source"], frame["source_file"] = sensor, source, source
    return frame


def test_live_result_adds_dedup_and_reference_counts_without_touching_priority():
    now = pd.Timestamp("2026-10-20T12:00")
    base = {"acq_date": "2026-10-20", "confidence": "n", "frp": 10.0}
    modis = _frame("MODIS_NRT", "MODIS", [{"latitude": -2.1, "longitude": 113.1, "acq_date": "2026-10-20", "acq_time": "0600", "confidence": 80, "frp": 30.0, "satellite": "Aqua"}])
    snpp = _frame("VIIRS_SNPP_NRT", "VIIRS", [{**base, "latitude": -2.1, "longitude": 113.1, "acq_time": "0610", "satellite": "N"}])
    n20 = _frame("VIIRS_NOAA20_NRT", "VIIRS", [{**base, "latitude": -2.1005, "longitude": 113.1, "acq_time": "0540", "satellite": "N20"}])
    summaries = [{"id": s, "available": True} for s in ("MODIS_NRT", "VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT")]
    with_twin = live.build_live_result([modis, snpp, n20], summaries, window_hours=24, now=now)
    assert with_twin.areas[0]["referenceEvents"] is None  # computed on demand, not on every build
    assert with_twin.meta["referencePopulations"]["SNPP"]["available"] is True
    live.ensure_reference_counts(with_twin)
    area = with_twin.areas[0]
    assert area["detections"] == 2  # unchanged harmonization: MODIS+one VIIRS pair, plus the other VIIRS
    assert area["dedupedEvents"] == 1  # the two VIIRS detections are one pixel
    assert area["viirsCrossSatelliteDuplicates"] == 1
    assert area["referenceEvents"] == {"SNPP": 1, "NOAA20": 1}
    assert with_twin.meta["processing"]["viirsCrossSatellite"]["duplicates"] == 1
    assert int(with_twin.markers.viirsDuplicate.sum()) == 1

    snpp_down = [dict(s, available=s["id"] != "VIIRS_SNPP_NRT") for s in summaries]
    without = live.ensure_reference_counts(live.build_live_result([modis, n20], snpp_down, window_hours=24, now=now))
    assert without.meta["referencePopulations"]["SNPP"] == {"available": False, "reason": "VIIRS_SNPP_NRT unavailable"}
    assert without.areas[0]["referenceEvents"] == {"NOAA20": 1}


def test_reference_counts_are_skipped_for_multi_day_windows():
    now = pd.Timestamp("2026-10-20T12:00")
    modis = _frame("MODIS_NRT", "MODIS", [{"latitude": -2.1, "longitude": 113.1, "acq_date": "2026-10-20", "acq_time": "0600", "confidence": 80, "frp": 30.0, "satellite": "Aqua"}])
    result = live.ensure_reference_counts(live.build_live_result([modis], [{"id": "MODIS_NRT", "available": True}], window_hours=7 * 24, now=now))
    assert result.areas[0]["referenceEvents"] is None
    assert result.reference_input is None


def test_expired_24h_cache_is_served_immediately_while_refreshing_in_background(monkeypatch):
    import threading
    import time

    calls = []
    release = threading.Event()
    old_frames = [pd.DataFrame({"marker": ["old"]})]
    new_frames = [pd.DataFrame({"marker": ["new"]})]

    def slow_fetch(key):
        calls.append(key)
        release.wait(5)
        return new_frames, [{"id": "MODIS_NRT", "available": True}]

    monkeypatch.setattr(live, "_fetch_all_24h", slow_fetch)
    monkeypatch.setattr(live, "_cached_result", lambda window, inc, frames, summaries, hours: frames)
    monkeypatch.setattr(live, "_cache", (time.monotonic() - 1, (old_frames, [{"id": "MODIS_NRT", "available": True}])))
    monkeypatch.setattr(live, "_refresh_thread", None)

    started = time.monotonic()
    assert live.load_live_result("key") is old_frames  # stale data, no waiting on FIRMS
    assert time.monotonic() - started < 1
    assert live.load_live_result("key") is old_frames  # still refreshing: one fetch only
    release.set()
    live._refresh_thread.join(5)
    assert calls == ["key"]
    assert live.load_live_result("key") is new_frames


def test_failed_refresh_keeps_serving_the_previous_snapshot(monkeypatch):
    import time

    old_frames = [pd.DataFrame({"marker": ["old"]})]
    monkeypatch.setattr(live, "_fetch_all_24h", lambda key: ([], [{"id": "MODIS_NRT", "available": False}]))
    monkeypatch.setattr(live, "_cached_result", lambda window, inc, frames, summaries, hours: frames)
    monkeypatch.setattr(live, "_cache", (time.monotonic() - 1, (old_frames, [{"id": "MODIS_NRT", "available": True}])))
    monkeypatch.setattr(live, "_refresh_thread", None)
    live.load_live_result("key")
    live._refresh_thread.join(5)
    assert live._cache[1][0] is old_frames
    assert live._cache[0] > time.monotonic()  # retried later, not on every request


# --- builder: one table per VIIRS platform ------------------------------------------------------------


def _csv(path, rows):
    pd.DataFrame(rows).to_csv(path, index=False)
    return str(path)


def test_builder_writes_a_noaa20_table_only_when_noaa20_files_are_given(tmp_path):
    modis = _csv(tmp_path / "m.csv", [{"latitude": -2.1, "longitude": 104.8, "acq_date": "2026-01-05", "acq_time": "0300", "confidence": 90, "frp": 50.0, "satellite": "Terra", "type": 0}])
    snpp = _csv(tmp_path / "s.csv", [{"latitude": -2.1, "longitude": 104.8, "acq_date": "2026-01-05", "acq_time": "0310", "confidence": "n", "frp": 20.0, "satellite": "N", "type": 0}])
    noaa20 = _csv(
        tmp_path / "j.csv",
        [
            {"latitude": -2.1, "longitude": 104.8, "acq_date": "2026-01-05", "acq_time": "0400", "confidence": "n", "frp": 25.0, "satellite": "N20", "type": 0},
            {"latitude": -1.6, "longitude": 104.3, "acq_date": "2026-01-06", "acq_time": "0400", "confidence": "n", "frp": 5.0, "satellite": "N20", "type": 0},
        ],
    )
    only_snpp = tmp_path / "a.sqlite"
    build(parse_args(["--modis-archive", modis, "--viirs-archive", snpp, "--out", str(only_snpp)]))
    assert available_references(str(only_snpp)) == ["SNPP"]

    both = tmp_path / "b.sqlite"
    rows, _ = build(parse_args(["--modis-archive", modis, "--viirs-archive", snpp, "--viirs-noaa20-archive", noaa20, "--out", str(both)]))
    assert rows == 1  # main table: MODIS + Suomi-NPP only, the pair counts once
    connection = sqlite3.connect(both)
    noaa20_rows = pd.read_sql_query(f"SELECT * FROM {REFERENCE_TABLES['NOAA20']}", connection)
    info = pd.read_sql_query("SELECT * FROM store_info", connection).set_index("table_name")
    connection.close()
    assert len(noaa20_rows) == 2  # MODIS + NOAA-20 pair on day 1, NOAA-20 alone on day 2
    assert info.loc["daily_area_activity", "population"] == "MODIS + VIIRS SNPP"
    assert info.loc[REFERENCE_TABLES["NOAA20"], "population"] == "MODIS + VIIRS NOAA20"
    assert available_references(str(both)) == ["SNPP", "NOAA20"]


def test_expired_multi_day_result_is_served_while_refreshing(monkeypatch):
    import threading
    import time

    release = threading.Event()
    builds = []

    def slow_build(key, window, include_all):
        builds.append(window)
        release.wait(5)
        result = f"new-{window}"
        live._window_results[(window, include_all)] = (time.monotonic() + 300, result)
        return result

    monkeypatch.setattr(live, "_build_window", slow_build)
    monkeypatch.setattr(live, "_window_results", {("7d", False): (time.monotonic() - 1, "old-7d")})
    monkeypatch.setattr(live, "_window_refresh_threads", {})
    started = time.monotonic()
    assert live.load_live_result("key", window="7d") == "old-7d"
    assert live.load_live_result("key", window="7d") == "old-7d"
    assert time.monotonic() - started < 1
    release.set()
    live._window_refresh_threads[("7d", False)].join(5)
    assert builds == ["7d"]
    assert live.load_live_result("key", window="7d") == "new-7d"


# --- P1: seasonal baseline ----------------------------------------------------------------------------


def _season_rows(lat, lon, years, months, value, days_per_month=4):
    rows = []
    for year in years:
        for month in months:
            for day in range(1, days_per_month + 1):
                rows.append(_row(f"{year}-{month:02d}-{day:02d}", lat, lon, value + (day % 2)))
    return rows


def test_seasonal_baseline_compares_october_with_past_september_to_november(tmp_path):
    db = tmp_path / "h.sqlite"
    # Quiet most of the year (1-2/day), busy and variable every fire season (20-60/day).
    rows = _season_rows(-2.0, 113.0, range(2015, 2021), [1, 2, 3, 4, 5, 6, 7, 8, 12], 1)
    for year in range(2015, 2021):
        for month in (9, 10, 11):
            rows += [_row(f"{year}-{month:02d}-{day:02d}", -2.0, 113.0, value) for day, value in enumerate([20, 30, 40, 50, 60], start=1)]
    _write_table(db, "daily_area_activity", rows)
    live_area = [_area(-2.0, 113.0, 55, 55)]
    all_months = compare_live_to_baseline(live_area, str(db), "SNPP")
    seasonal = compare_live_to_baseline(live_area, str(db), "SNPP", month=10)
    assert all_months["cells"][0]["status"] == "unusual"  # 45 looks extreme against the whole year...
    assert seasonal["cells"][0]["status"] == "within-baseline"  # ...but is normal for the season
    assert seasonal["cells"][0]["baselineKind"] == "seasonal"
    assert seasonal["summary"]["seasonalBaselineCells"] == 1
    assert seasonal["baseline"]["seasonal"]["months"] == [9, 10, 11]


def test_seasonal_window_wraps_the_year_end():
    from fire_pipeline.historical import seasonal_months

    assert seasonal_months(1) == [1, 2, 12]
    assert seasonal_months(12) == [1, 11, 12]


def test_too_little_seasonal_history_falls_back_to_all_months_and_says_so(tmp_path):
    db = tmp_path / "h.sqlite"
    # 2 years of season only (< 3 years) but plenty of days overall.
    rows = _season_rows(-2.0, 113.0, range(2015, 2021), [1, 3, 5], 2) + _season_rows(-2.0, 113.0, [2019, 2020], [10], 2, days_per_month=8)
    _write_table(db, "daily_area_activity", rows)
    result = compare_live_to_baseline([_area(-2.0, 113.0, 3, 3)], str(db), "SNPP", month=10)
    assert result["cells"][0]["baselineKind"] == "all-months-fallback"
    assert result["summary"]["fallbackBaselineCells"] == 1


def test_seasonal_needs_ten_days_and_never_hides_insufficient_cells(tmp_path):
    db = tmp_path / "h.sqlite"
    _write_table(db, "daily_area_activity", _season_rows(-2.0, 113.0, range(2015, 2018), [10], 2, days_per_month=2))  # 6 days
    result = compare_live_to_baseline([_area(-2.0, 113.0, 30, 30)], str(db), "SNPP", month=10)
    assert result["cells"][0]["status"] == "insufficient-history"
    assert result["cells"][0]["baselineKind"] is None
