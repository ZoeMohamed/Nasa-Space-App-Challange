import pandas as pd
import pytest

from ml_experiments.matching_audit.audit_matching import (
    ambiguity_count,
    ambiguity_spread,
    candidate_set,
    nearest_cross_sensor_neighbor,
)


def _detection(sensor, lat, lon, when, frp=10.0):
    return {"sensor": sensor, "latitude": lat, "longitude": lon, "acq_datetime": pd.Timestamp(when), "frp": frp}


def test_nearest_cross_sensor_neighbor_finds_closest_pair():
    df = pd.DataFrame(
        [
            _detection("MODIS", 0.0, 0.0, "2020-01-01 00:00"),
            _detection("VIIRS", 0.0, 0.01, "2020-01-01 00:30"),  # ~1.1km away, 30min later -> nearest
            _detection("VIIRS", 0.0, 1.0, "2020-01-01 00:10"),  # much farther away
        ]
    )
    result = nearest_cross_sensor_neighbor(df, cap_km=200, cap_minutes=600)
    modis_row = result[result.sensor == "MODIS"].iloc[0]
    assert modis_row.nearest_distance_km < 2.0
    assert modis_row.nearest_time_diff_min == pytest.approx(30.0, abs=1.0)


def test_nearest_cross_sensor_neighbor_nan_when_nothing_within_cap():
    df = pd.DataFrame(
        [
            _detection("MODIS", 0.0, 0.0, "2020-01-01 00:00"),
            _detection("VIIRS", 10.0, 10.0, "2020-01-01 00:00"),  # far outside any reasonable cap
        ]
    )
    result = nearest_cross_sensor_neighbor(df, cap_km=5, cap_minutes=60)
    modis_row = result[result.sensor == "MODIS"].iloc[0]
    assert pd.isna(modis_row.nearest_distance_km)


def test_candidate_set_respects_both_distance_and_time():
    df = pd.DataFrame(
        [
            _detection("MODIS", 0.0, 0.0, "2020-01-01 12:00"),
            _detection("VIIRS", 0.0, 0.005, "2020-01-01 12:05"),  # close in both -> candidate
            _detection("VIIRS", 0.0, 1.0, "2020-01-01 12:05"),  # close in time, far in space -> excluded
            _detection("VIIRS", 0.0, 0.005, "2020-01-02 12:05"),  # close in space, far in time -> excluded
        ]
    )
    modis_row = df[df.sensor == "MODIS"].iloc[0]
    viirs = df[df.sensor == "VIIRS"]
    candidates = candidate_set(df, modis_row, viirs, radius_km=5, time_minutes=60)
    assert len(candidates) == 1


def test_ambiguity_count_distinguishes_one_vs_multiple_candidates():
    # MODIS #1 has exactly 1 VIIRS candidate -> not ambiguous.
    # MODIS #2 has 2 VIIRS candidates nearby -> ambiguous.
    df = pd.DataFrame(
        [
            _detection("MODIS", 0.0, 0.0, "2020-01-01 00:00"),
            _detection("VIIRS", 0.0, 0.001, "2020-01-01 00:05"),
            _detection("MODIS", 5.0, 5.0, "2020-01-01 00:00"),
            _detection("VIIRS", 5.0, 5.001, "2020-01-01 00:05"),
            _detection("VIIRS", 5.0, 5.002, "2020-01-01 00:06"),
        ]
    )
    ambiguous, matched_at_least_one = ambiguity_count(df, radius_km=5, time_minutes=60)
    assert ambiguous == 1
    assert matched_at_least_one == 2


def test_ambiguity_spread_reports_tight_vs_wide_candidate_clusters():
    # Ambiguous MODIS #1: its 2 VIIRS candidates are <1km apart from EACH OTHER -> tight cluster.
    tight_modis = _detection("MODIS", 0.0, 0.0, "2020-01-01 00:00")
    tight_candidates = [
        _detection("VIIRS", 0.0, 0.001, "2020-01-01 00:05"),
        _detection("VIIRS", 0.0, 0.002, "2020-01-01 00:06"),
    ]
    # Ambiguous MODIS #2: its 2 VIIRS candidates are ~55km apart from EACH OTHER -> wide spread.
    wide_modis = _detection("MODIS", 10.0, 10.0, "2020-01-01 00:00")
    wide_candidates = [
        _detection("VIIRS", 10.0, 10.01, "2020-01-01 00:05"),
        _detection("VIIRS", 10.5, 10.5, "2020-01-01 00:05"),
    ]
    df = pd.DataFrame([tight_modis, *tight_candidates, wide_modis, *wide_candidates])

    spread = ambiguity_spread(df, radius_km=100, time_minutes=60)
    assert len(spread) == 2
    tight_row = spread[spread.max_pairwise_distance_km < 1]
    wide_row = spread[spread.max_pairwise_distance_km > 10]
    assert len(tight_row) == 1
    assert len(wide_row) == 1
