import numpy as np
import pandas as pd

from fire_pipeline.clean import add_quality_flags, deduplicate_detections, harmonize, high_confidence_mask


def test_harmonize_renames_aliases_and_coerces_types():
    frame = pd.DataFrame(
        [
            {"lat": "-2.1", "lon": "104.8", "date": "2026-10-12", "time": "300", "frp": "80.5", "sensor": "modis", "confidence": "92"},
            {"lat": "-2.2", "lon": "104.9", "date": "2026-10-12", "time": 330, "frp": "75", "sensor": "viirs", "confidence": "h"},
        ]
    )
    out = harmonize(frame)

    # Column renaming from short aliases to FIRMS-style names.
    assert "latitude" in out.columns and "lat" not in out.columns
    assert "longitude" in out.columns and "lon" not in out.columns
    # "date" is also a column harmonize() derives from acq_datetime further
    # down, so it legitimately reappears; the raw alias input is gone, i.e.
    # the original string "date" column was renamed to "acq_date".
    assert "acq_date" in out.columns
    assert "acq_time" in out.columns and "time" not in out.columns

    # Type coercion: numeric columns become numeric dtype.
    assert pd.api.types.is_numeric_dtype(out["latitude"])
    assert pd.api.types.is_numeric_dtype(out["longitude"])
    assert pd.api.types.is_numeric_dtype(out["frp"])
    assert out["latitude"].iloc[0] == -2.1

    # sensor normalized to uppercase MODIS/VIIRS.
    assert list(out["sensor"]) == ["MODIS", "VIIRS"]

    # Valid acq_date/acq_time parsed into a real datetime.
    assert out["acq_datetime"].iloc[0] == pd.Timestamp("2026-10-12 03:00:00")

    # Confidence: numeric stays numeric, categorical "h" maps to a number.
    assert out["confidence_num"].iloc[0] == 92
    assert out["confidence_num"].iloc[1] == 95


def test_harmonize_invalid_date_becomes_nat():
    frame = pd.DataFrame([{"latitude": 1.0, "longitude": 2.0, "acq_date": "not-a-date", "acq_time": "9999", "frp": 1, "sensor": "MODIS", "confidence": 90}])
    out = harmonize(frame)
    assert pd.isna(out["acq_datetime"].iloc[0])


def test_quality_flags_reject_missing_and_invalid_coordinates():
    frame = pd.DataFrame(
        [
            {"latitude": -2.0, "longitude": 104.0, "acq_date": "2026-10-12", "acq_time": "0100", "frp": 10, "sensor": "MODIS", "confidence": 90},
            {"latitude": np.nan, "longitude": 104.0, "acq_date": "2026-10-12", "acq_time": "0100", "frp": 10, "sensor": "MODIS", "confidence": 90},
            {"latitude": 95.0, "longitude": 104.0, "acq_date": "2026-10-12", "acq_time": "0100", "frp": 10, "sensor": "MODIS", "confidence": 90},
            {"latitude": -2.0, "longitude": 200.0, "acq_date": "2026-10-12", "acq_time": "0100", "frp": 10, "sensor": "MODIS", "confidence": 90},
        ]
    )
    out = add_quality_flags(harmonize(frame))

    assert out["quality_ok"].tolist() == [True, False, False, False]
    assert out["flag_missing_coordinate"].tolist() == [False, True, False, False]
    # Note: a missing coordinate also registers as "invalid" here, because
    # pandas' Series.between() on NaN returns False, so ~between() is True --
    # this is the existing add_quality_flags() behavior, not something new.
    assert out["flag_invalid_coordinate"].tolist() == [False, True, True, True]


def test_high_confidence_mask_matches_numeric_and_categorical_rules():
    frame = pd.DataFrame({"confidence": [95, 80, 81, "h", "n", "l", "garbage"]})
    mask = high_confidence_mask(frame)
    assert mask.tolist() == [True, False, True, True, False, False, False]


def test_deduplicate_detections_ignores_source_file():
    frame = pd.DataFrame(
        [
            {"sensor": "VIIRS", "latitude": -2.1, "longitude": 104.8, "acq_datetime": pd.Timestamp("2026-10-12 03:00"), "frp": 80.0, "source_file": "SNPP"},
            {"sensor": "VIIRS", "latitude": -2.1, "longitude": 104.8, "acq_datetime": pd.Timestamp("2026-10-12 03:00"), "frp": 80.0, "source_file": "NOAA20"},
        ]
    )

    result = deduplicate_detections(frame)

    assert len(result) == 1


def test_confidence_tier_uses_firms_class_ranges():
    from fire_pipeline.clean import confidence_tier, usable_confidence_mask

    frame = pd.DataFrame({"confidence": [10, 29, 30, 79, 80, 100, "l", "n", "h", "garbage"]})
    assert confidence_tier(frame).tolist() == [
        "low", "low", "nominal", "nominal", "high", "high", "low", "nominal", "high", "low",
    ]
    assert usable_confidence_mask(frame).tolist() == [False, False, True, True, True, True, False, True, True, False]
