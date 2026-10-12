import pandas as pd

from fire_pipeline.features import temporal_features
from fire_pipeline.live import process_live_frames


def test_live_frames_run_python_pipeline():
    frame = pd.DataFrame(
        [
            {"latitude": -2.1, "longitude": 104.8, "brightness": 330, "acq_date": "2026-10-12", "acq_time": 300, "satellite": "Terra", "confidence": 92, "frp": 80, "sensor": "MODIS", "source": "MODIS_NRT", "source_file": "MODIS_NRT"},
            {"latitude": -2.11, "longitude": 104.81, "bright_ti4": 340, "acq_date": "2026-10-12", "acq_time": 330, "satellite": "N20", "confidence": "h", "frp": 75, "sensor": "VIIRS", "source": "VIIRS_NOAA20_NRT", "source_file": "VIIRS_NOAA20_NRT"},
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


def test_persistence_is_inclusive_and_never_above_one():
    areas = pd.DataFrame(
        [{"first_date": "2026-10-10", "last_date": "2026-10-12", "active_days": 3, "frp_max": 10, "frp_mean": 5, "sensors": "MODIS"}]
    )
    result = temporal_features(areas)
    assert result.iloc[0].persistence == 1


def test_empty_live_result_is_valid():
    empty = pd.DataFrame(columns=["latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp", "sensor", "source_file"])
    summaries = [{"id": "MODIS_NRT", "sensor": "MODIS", "rawCount": 0, "highConfidenceCount": 0, "available": True}]
    result = process_live_frames([empty], summaries)
    assert result["markers"] == []
    assert result["meta"]["processing"]["areasAnalyzed"] == 0
