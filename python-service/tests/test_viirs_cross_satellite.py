import pandas as pd

from fire_pipeline.harmonize_events import (
    VIIRS_CROSS_SATELLITE_KM,
    build_harmonized_events,
    collapse_viirs_cross_satellite,
    deduplicated_event_keys,
    viirs_platform,
)
from fire_pipeline.matching import match_modis_viirs

# degrees of latitude per km
KM = 1 / 111.0


def _det(source, lat, lon, when, sensor="VIIRS", frp=10.0, satellite=None):
    return {
        "sensor": sensor,
        "source": source,
        "satellite": satellite or {"VIIRS_SNPP_NRT": "N", "VIIRS_NOAA20_NRT": "N20", "VIIRS_NOAA21_NRT": "N21", "MODIS_NRT": "Aqua"}[source],
        "latitude": lat,
        "longitude": lon,
        "acq_datetime": pd.Timestamp(when),
        "frp": frp,
    }


def _groups(rows):
    return collapse_viirs_cross_satellite(pd.DataFrame(rows))


def test_platform_from_source_and_from_satellite_code():
    frame = pd.DataFrame(
        [
            _det("VIIRS_NOAA20_NRT", 0, 0, "2026-10-20 04:00"),
            {"sensor": "VIIRS", "satellite": "SNPP", "latitude": 0, "longitude": 0, "acq_datetime": pd.Timestamp("2026-10-20"), "frp": 1.0},
            _det("MODIS_NRT", 0, 0, "2026-10-20 04:00", sensor="MODIS"),
        ]
    )
    assert viirs_platform(frame).tolist() == ["NOAA20", "SNPP", None]


def test_same_fire_seen_by_two_satellites_is_one_group_with_snpp_primary():
    result = _groups(
        [
            _det("VIIRS_NOAA20_NRT", -2.0, 113.0, "2026-10-20 04:10"),
            _det("VIIRS_SNPP_NRT", -2.0 + 0.2 * KM, 113.0, "2026-10-20 04:30"),
        ]
    )
    assert result.viirs_group.tolist() == [1, 1]
    assert result.viirs_primary.tolist() == [False, True]


def test_adjacent_pixels_of_the_same_satellite_are_never_merged():
    result = _groups(
        [
            _det("VIIRS_SNPP_NRT", -2.0, 113.0, "2026-10-20 04:30"),
            _det("VIIRS_SNPP_NRT", -2.0 + 0.2 * KM, 113.0, "2026-10-20 04:30"),
        ]
    )
    assert result.viirs_group.tolist() == [-1, -1]
    assert result.viirs_primary.all()


def test_too_far_apart_in_space_or_time_stays_separate():
    beyond = (VIIRS_CROSS_SATELLITE_KM + 0.05) * KM  # just over the radius
    far = _groups([_det("VIIRS_SNPP_NRT", 0.0, 100.0, "2026-10-20 04:30"), _det("VIIRS_NOAA20_NRT", beyond, 100.0, "2026-10-20 04:40")])
    assert far.viirs_group.tolist() == [-1, -1]
    # Same spot, next pass ~12 h later: a different observation, not a duplicate.
    later = _groups([_det("VIIRS_SNPP_NRT", 0.0, 100.0, "2026-10-20 04:30"), _det("VIIRS_NOAA20_NRT", 0.0, 100.0, "2026-10-20 16:30")])
    assert later.viirs_group.tolist() == [-1, -1]


def test_three_satellites_on_one_pixel_form_one_group():
    result = _groups(
        [
            _det("VIIRS_NOAA21_NRT", 1.0, 101.0, "2026-10-20 03:40"),
            _det("VIIRS_NOAA20_NRT", 1.0 + 0.1 * KM, 101.0, "2026-10-20 04:20"),
            _det("VIIRS_SNPP_NRT", 1.0, 101.0 + 0.1 * KM, "2026-10-20 04:45"),
        ]
    )
    assert set(result.viirs_group) == {2}
    assert result.viirs_primary.tolist() == [False, False, True]


def test_one_noaa20_detection_pairs_with_only_the_nearest_of_two_snpp_pixels():
    result = _groups(
        [
            _det("VIIRS_SNPP_NRT", 0.0, 110.0, "2026-10-20 04:30"),
            _det("VIIRS_SNPP_NRT", 0.35 * KM, 110.0, "2026-10-20 04:30"),  # adjacent pixel, 0.35 km away
            _det("VIIRS_NOAA20_NRT", 0.05 * KM, 110.0, "2026-10-20 04:50"),  # 0.05 km from the first, 0.30 km from the second
        ]
    )
    assert result.viirs_group.tolist() == [0, -1, 0]
    assert result.viirs_primary.tolist() == [True, True, False]


def test_single_satellite_input_is_unchanged():
    rows = [_det("VIIRS_SNPP_NRT", 0.0 + i * KM, 110.0, "2026-10-20 04:30") for i in range(5)]
    rows.append(_det("MODIS_NRT", 0.0, 110.0, "2026-10-20 03:30", sensor="MODIS"))
    result = _groups(rows)
    assert (result.viirs_group == -1).all()
    assert result.viirs_primary.all()


def test_result_does_not_depend_on_row_order_except_positions():
    rows = [
        _det("VIIRS_SNPP_NRT", 0.0, 110.0, "2026-10-20 04:30"),
        _det("VIIRS_NOAA20_NRT", 0.1 * KM, 110.0, "2026-10-20 04:50"),
        _det("VIIRS_NOAA21_NRT", 20 * KM, 110.0, "2026-10-20 04:10"),
    ]
    forward = _groups(rows)
    backward = _groups(rows[::-1])
    assert sorted(forward.viirs_primary.tolist()) == sorted(backward.viirs_primary.tolist())
    assert int((~forward.viirs_primary).sum()) == int((~backward.viirs_primary).sum()) == 1


def test_deduplicated_event_keys_merge_matched_pair_with_its_viirs_twin():
    detections = pd.DataFrame(
        [
            _det("MODIS_NRT", 0.0, 110.0, "2026-10-20 06:00", sensor="MODIS", frp=30.0),
            _det("VIIRS_NOAA20_NRT", 0.0, 110.0, "2026-10-20 06:10", frp=12.0),
            _det("VIIRS_SNPP_NRT", 0.1 * KM, 110.0, "2026-10-20 05:30", frp=14.0),
            _det("VIIRS_SNPP_NRT", 50 * KM, 110.0, "2026-10-20 05:30", frp=9.0),  # unrelated fire
        ]
    )
    matches = match_modis_viirs(detections)
    events = build_harmonized_events(detections, matches)
    assert len(events) == 3  # MODIS paired with one VIIRS, the twin and the unrelated fire stay separate
    keys = deduplicated_event_keys(events, collapse_viirs_cross_satellite(detections))
    assert keys.nunique() == 2
