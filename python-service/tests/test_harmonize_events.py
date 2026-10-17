import pandas as pd

from fire_pipeline.features import aggregate_grid
from fire_pipeline.harmonize_events import build_harmonized_events
from fire_pipeline.matching import match_modis_viirs


def _detections():
    # row0 (MODIS) and row1 (VIIRS) are close in space/time -> should MATCH.
    # row2 (MODIS) is in the same 0.25-degree grid cell but far from any VIIRS
    # detection -> MODIS_ONLY. row3 (VIIRS) is in a different grid cell,
    # unmatched -> VIIRS_ONLY.
    return pd.DataFrame(
        [
            {"latitude": -2.10, "longitude": 104.80, "acq_datetime": pd.Timestamp("2026-10-12 03:00"), "frp": 80.0, "sensor": "MODIS", "brightness": 330, "confidence_num": 92, "quality_ok": True},
            {"latitude": -2.11, "longitude": 104.81, "acq_datetime": pd.Timestamp("2026-10-12 03:10"), "frp": 60.0, "sensor": "VIIRS", "brightness": 340, "confidence_num": 95, "quality_ok": True},
            {"latitude": -2.12, "longitude": 104.82, "acq_datetime": pd.Timestamp("2026-10-13 03:00"), "frp": 40.0, "sensor": "MODIS", "brightness": 320, "confidence_num": 88, "quality_ok": True},
            {"latitude": 10.00, "longitude": 50.00, "acq_datetime": pd.Timestamp("2026-10-12 03:00"), "frp": 30.0, "sensor": "VIIRS", "brightness": 310, "confidence_num": 95, "quality_ok": True},
        ]
    )


def test_build_harmonized_events_collapses_matched_pair_with_max_frp():
    detections = _detections()
    matches = match_modis_viirs(detections)
    assert (matches["match_status"] == "MATCHED").sum() == 2  # both sides of the pair

    events = build_harmonized_events(detections, matches)

    assert len(events) == 3  # 4 raw detections -> 3 events (one pair collapsed)
    matched_event = events[events.sensor == "MATCHED"].iloc[0]
    assert matched_event.frp == 80.0  # max(80, 60), not sum
    assert sorted(matched_event.source_detection_ids) == [0, 1]

    modis_only = events[(events.sensor == "MODIS")]
    assert len(modis_only) == 1
    assert modis_only.iloc[0].frp == 40.0
    assert modis_only.iloc[0].source_detection_ids == [2]

    viirs_only = events[(events.sensor == "VIIRS")]
    assert len(viirs_only) == 1
    assert viirs_only.iloc[0].frp == 30.0
    assert viirs_only.iloc[0].source_detection_ids == [3]


def test_aggregate_grid_on_harmonized_events_does_not_double_count_matched_pair():
    """Regression test for the double-counting fix: aggregating the raw
    per-sensor detections directly inflates detections/frp_sum for a cell
    containing a MATCHED pair, while aggregating harmonized events does not.
    """
    detections = _detections()
    matches = match_modis_viirs(detections)
    events = build_harmonized_events(detections, matches)

    raw_areas = aggregate_grid(detections)
    harmonized_areas = aggregate_grid(events)

    cell = "-2.25_104.75"
    raw_cell = raw_areas.set_index("area_id").loc[cell]
    harmonized_cell = harmonized_areas.set_index("area_id").loc[cell]

    # Raw aggregation (the bug): 3 raw rows in this cell, FRP summed naively.
    assert raw_cell.detections == 3
    assert raw_cell.frp_sum == 180.0  # 80 + 60 + 40 -- double-weights the matched pair

    # Harmonized aggregation (the fix): the matched pair collapses to one
    # event (frp=max(80,60)=80), so this cell has 2 events, not 3, and
    # frp_sum reflects one physical reading per event, not both sensors' of
    # the same detection summed together.
    assert harmonized_cell.detections == 2
    assert harmonized_cell.frp_sum == 120.0  # 80 (matched, max) + 40 (modis-only)
    assert harmonized_cell.frp_max == 80.0
