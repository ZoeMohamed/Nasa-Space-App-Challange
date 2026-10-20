import sqlite3
from datetime import datetime, timezone

import pandas as pd

from fire_pipeline.features import temporal_features
from fire_pipeline.live import process_live_frames

# process_live_frames() filters detections to the real last 24h (see
# WINDOW_HOURS in fire_pipeline/live.py), so fixture acq_date must stay
# within that window relative to whenever the test actually runs -- a
# fixed past date would get silently filtered out.
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")


def test_live_frames_run_python_pipeline(monkeypatch, tmp_path):
    # Force the same-batch fallback path regardless of whether a real
    # historical store happens to exist on disk in this environment.
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(tmp_path / "no_such_store.sqlite"))
    frame = pd.DataFrame(
        [
            {"latitude": -2.1, "longitude": 104.8, "brightness": 330, "acq_date": TODAY, "acq_time": 300, "satellite": "Terra", "confidence": 92, "frp": 80, "sensor": "MODIS", "source": "MODIS_NRT", "source_file": "MODIS_NRT"},
            {"latitude": -2.11, "longitude": 104.81, "bright_ti4": 340, "acq_date": TODAY, "acq_time": 330, "satellite": "N20", "confidence": "h", "frp": 75, "sensor": "VIIRS", "source": "VIIRS_NOAA20_NRT", "source_file": "VIIRS_NOAA20_NRT"},
        ]
    )
    summaries = [
        {"id": "MODIS_NRT", "sensor": "MODIS", "rawCount": 1, "highConfidenceCount": 1, "available": True},
        {"id": "VIIRS_NOAA20_NRT", "sensor": "VIIRS", "rawCount": 1, "highConfidenceCount": 1, "available": True},
    ]

    result = process_live_frames([frame], summaries)

    assert len(result["markers"]) == 2
    assert result["meta"]["processing"]["engine"] == "Python fire_pipeline"
    assert result["meta"]["processing"]["areasAnalyzed"] == 1
    assert result["meta"]["processing"]["matchedDetections"] == 2

    # Both markers are the MATCHED pair, and each points back at its partner's
    # detection id (traceability added alongside the harmonized-events fix).
    markers_by_sensor = {marker["sensor"]: marker for marker in result["markers"]}
    assert markers_by_sensor["MODIS"]["matchStatus"] == "MATCHED"
    assert markers_by_sensor["VIIRS"]["matchStatus"] == "MATCHED"
    assert markers_by_sensor["MODIS"]["matchedDetectionId"] is not None
    assert markers_by_sensor["VIIRS"]["matchedDetectionId"] is not None

    # Regression: MODIS confidence is a real percentage; VIIRS confidence is a
    # discrete class (low/nominal/high) with no percentage meaning and must
    # never be sent as a number or a synthetic "95%"-style label -- see
    # _marker_confidence() in fire_pipeline/live.py for why.
    assert markers_by_sensor["MODIS"]["confidence"] == 92
    assert markers_by_sensor["MODIS"]["confidenceLabel"] == "92%"
    assert markers_by_sensor["VIIRS"]["confidence"] is None
    assert markers_by_sensor["VIIRS"]["confidenceLabel"] == "Tinggi (VIIRS)"
    assert "%" not in markers_by_sensor["VIIRS"]["confidenceLabel"]

    assert len(result["areas"]) == 1
    area = result["areas"][0]
    assert area["priorityRank"] == 1
    assert 0 <= area["attentionScore"] <= 1
    # This single-batch test has no historical SQLite store configured, so
    # the baseline must honestly report the same-batch fallback mode.
    assert area["baselineSource"] == "same-batch-fallback"
    # Not valid yet (see summarize_areas docstring) — must not leak into the API.
    assert "confidenceMean" not in area
    assert "zScore" not in area
    assert "anomaly" not in area


def test_persistence_is_inclusive_and_never_above_one():
    areas = pd.DataFrame(
        [{"first_date": "2026-10-10", "last_date": "2026-10-12", "active_days": 3, "frp_max": 10, "frp_mean": 5, "sensors": "MODIS"}]
    )
    result = temporal_features(areas)
    assert result.iloc[0].persistence == 1


def test_unmatched_detection_has_no_matched_detection_id(monkeypatch, tmp_path):
    # Regression test: when every detection is MODIS_ONLY/VIIRS_ONLY (no
    # MATCHED pair at all), match_modis_viirs() never adds a
    # "matched_detection_id" column, which previously crashed
    # process_live_frames with a KeyError when building the marker lookup.
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(tmp_path / "no_such_store.sqlite"))
    frame = pd.DataFrame(
        [
            {"latitude": -2.1, "longitude": 104.8, "brightness": 330, "acq_date": TODAY, "acq_time": 300, "satellite": "Terra", "confidence": 92, "frp": 80, "sensor": "MODIS", "source": "MODIS_NRT", "source_file": "MODIS_NRT"},
        ]
    )
    summaries = [{"id": "MODIS_NRT", "sensor": "MODIS", "rawCount": 1, "highConfidenceCount": 1, "available": True}]

    result = process_live_frames([frame], summaries)

    assert len(result["markers"]) == 1
    assert result["markers"][0]["matchStatus"] == "MODIS_ONLY"
    assert result["markers"][0]["matchedDetectionId"] is None


def test_historical_baseline_source_is_honestly_reported(monkeypatch, tmp_path):
    db_path = tmp_path / "historical.sqlite"
    connection = sqlite3.connect(db_path)
    history = pd.DataFrame(
        [
            {"date": "2020-01-01", "area_id": "-2.25_104.75", "grid_lat": -2.25, "grid_lon": 104.75, "detections": 2, "modis_detections": 2, "viirs_detections": 0, "frp_sum": 50.0, "frp_max": 30.0, "source": "archive"},
            {"date": "2020-01-02", "area_id": "-2.25_104.75", "grid_lat": -2.25, "grid_lon": 104.75, "detections": 1, "modis_detections": 1, "viirs_detections": 0, "frp_sum": 10.0, "frp_max": 10.0, "source": "archive"},
        ]
    )
    history.to_sql("daily_area_activity", connection, index=False, if_exists="replace")
    connection.close()
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(db_path))

    frame = pd.DataFrame(
        [
            {"latitude": -2.1, "longitude": 104.8, "brightness": 330, "acq_date": TODAY, "acq_time": 300, "satellite": "Terra", "confidence": 92, "frp": 80, "sensor": "MODIS", "source": "MODIS_NRT", "source_file": "MODIS_NRT"},
        ]
    )
    summaries = [{"id": "MODIS_NRT", "sensor": "MODIS", "rawCount": 1, "highConfidenceCount": 1, "available": True}]

    result = process_live_frames([frame], summaries)

    # -2.1/104.8 falls in grid cell -2.25_104.75, which the fixture store has
    # history for -> baseline must come from that history, not same-batch.
    assert result["areas"][0]["baselineSource"] == "historical"


def test_historical_baseline_no_longer_computes_dead_zscore_fields():
    # Regression: z_score/anomaly were removed from historical_baseline()'s
    # output 2026-10-19 because nothing ever consumed them (confirmed by
    # repo-wide grep before removal -- summarize_areas() in live.py only
    # ever serialized baseline_source). This locks the removal in so the
    # same dead, unvalidated-sparsity-prone columns aren't silently
    # reintroduced without the minimum-sample gating they'd need.
    from fire_pipeline.model import historical_baseline

    areas = pd.DataFrame(
        [{"grid_lat": -2.25, "grid_lon": 104.75, "frp_sum": 100.0}]
    )
    result = historical_baseline(areas, sqlite_path=None)

    assert "z_score" not in result.columns
    assert "anomaly" not in result.columns
    # baseline_mean/baseline_std/baseline_source must still be present --
    # baseline_source is tested/consumed (see the test above).
    assert "baseline_mean" in result.columns
    assert "baseline_std" in result.columns
    assert "baseline_source" in result.columns


def test_empty_live_result_is_valid():
    empty = pd.DataFrame(columns=["latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp", "sensor", "source_file"])
    summaries = [{"id": "MODIS_NRT", "sensor": "MODIS", "rawCount": 0, "highConfidenceCount": 0, "available": True}]
    result = process_live_frames([empty], summaries)
    assert result["markers"] == []
    assert result["meta"]["processing"]["areasAnalyzed"] == 0


def test_default_shows_nominal_and_high_and_toggle_adds_low(monkeypatch, tmp_path):
    # Default filter = FIRMS nominal + high (clean.usable_confidence_mask); "low" only with the toggle.
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(tmp_path / "no_such_store.sqlite"))
    base = {"acq_date": TODAY, "acq_time": 300, "satellite": "Terra", "sensor": "MODIS", "source": "MODIS_NRT", "source_file": "MODIS_NRT"}
    frame = pd.DataFrame(
        [
            {**base, "latitude": -2.1, "longitude": 104.8, "confidence": 92, "frp": 80, "high_confidence": True},
            {**base, "latitude": -5.0, "longitude": 110.0, "confidence": 55, "frp": 30, "high_confidence": False},
            {**base, "latitude": -6.0, "longitude": 111.0, "confidence": 20, "frp": 10, "high_confidence": False},
            {**base, "latitude": -3.0, "longitude": 105.0, "confidence": "n", "frp": 12, "sensor": "VIIRS", "source": "VIIRS_SNPP_NRT", "high_confidence": False},
        ]
    )
    summaries = [{"id": "MODIS_NRT", "sensor": "MODIS", "rawCount": 4, "highConfidenceCount": 1, "available": True}]

    default_result = process_live_frames([frame], summaries)
    tiers = sorted(marker["confidenceTier"] for marker in default_result["markers"])
    assert tiers == ["high", "nominal", "nominal"]  # VIIRS "n" and MODIS 55% are valid detections
    assert default_result["meta"]["confidenceFilter"] == "nominal+high"

    all_result = process_live_frames([frame], summaries, include_all_confidence=True)
    assert sorted(marker["confidenceTier"] for marker in all_result["markers"]) == ["high", "low", "nominal", "nominal"]
    assert sorted(marker["highConfidence"] for marker in all_result["markers"]) == [False, False, False, True]
