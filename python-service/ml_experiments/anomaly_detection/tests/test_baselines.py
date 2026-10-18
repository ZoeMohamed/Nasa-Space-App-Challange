import sqlite3

import pandas as pd
import pytest

from ml_experiments.anomaly_detection.baselines import (
    fixed_per_cell_daily_baseline,
    flag_anomaly,
    regional_seasonal_baseline,
)


def _cell_fixture():
    return pd.DataFrame(
        [
            # Cell A: 3 days, detections 2/4/6 -> mean=4.0, std=2.0 (ddof=1)
            {"grid_lat": 1.0, "grid_lon": 1.0, "detections": 2, "year": 2020, "month": 1},
            {"grid_lat": 1.0, "grid_lon": 1.0, "detections": 4, "year": 2020, "month": 2},
            {"grid_lat": 1.0, "grid_lon": 1.0, "detections": 6, "year": 2020, "month": 3},
            # Cell B: 1 day only -> mean=5.0, std=None (below MIN_DAILY_SAMPLES)
            {"grid_lat": 2.0, "grid_lon": 2.0, "detections": 5, "year": 2020, "month": 1},
        ]
    )


def test_fixed_per_cell_daily_baseline_matches_hand_computed_values():
    stats = fixed_per_cell_daily_baseline(_cell_fixture())
    cell_a = stats[(stats.grid_lat == 1.0) & (stats.grid_lon == 1.0)].iloc[0]
    cell_b = stats[(stats.grid_lat == 2.0) & (stats.grid_lon == 2.0)].iloc[0]

    assert cell_a["mean"] == 4.0
    assert cell_a["std"] == pytest.approx(2.0)
    assert cell_a["sample_days"] == 3
    assert cell_a["source"] == "per-cell-daily"

    assert cell_b["mean"] == 5.0
    assert pd.isna(cell_b["std"])  # only 1 sample -> undefined std, not 0
    assert cell_b["sample_days"] == 1


def test_fixed_baseline_matches_production_historical_py(tmp_path):
    """Fidelity check: this experiment's reimplementation of the fixed
    per-cell daily baseline must produce the SAME numbers as the real
    production function (fire_pipeline.historical.load_calendar_summary's
    dailyMeanDetections/dailyStdDetections), on the same data. This is the
    evidence that "reproduces the existing method" is literally true, not
    just asserted in a docstring.
    """
    from fire_pipeline.historical import load_calendar_summary

    db_path = tmp_path / "historical.sqlite"
    rows = [
        {"date": "2020-01-05", "area_id": "1.0_1.0", "grid_lat": 1.0, "grid_lon": 1.0, "detections": 2, "modis_detections": 2, "viirs_detections": 0, "frp_sum": 10.0, "frp_max": 10.0, "source": "archive"},
        {"date": "2020-02-10", "area_id": "1.0_1.0", "grid_lat": 1.0, "grid_lon": 1.0, "detections": 4, "modis_detections": 4, "viirs_detections": 0, "frp_sum": 20.0, "frp_max": 15.0, "source": "archive"},
        {"date": "2020-03-15", "area_id": "1.0_1.0", "grid_lat": 1.0, "grid_lon": 1.0, "detections": 6, "modis_detections": 6, "viirs_detections": 0, "frp_sum": 30.0, "frp_max": 20.0, "source": "archive"},
    ]
    connection = sqlite3.connect(db_path)
    pd.DataFrame(rows).to_sql("daily_area_activity", connection, index=False, if_exists="replace")
    connection.close()

    production_result = load_calendar_summary(str(db_path))
    production_cell = next(c for c in production_result["cells"] if c["gridLat"] == 1.0 and c["gridLon"] == 1.0)

    experiment_df = pd.DataFrame(rows)
    experiment_df["date"] = pd.to_datetime(experiment_df["date"])
    experiment_stats = fixed_per_cell_daily_baseline(experiment_df)
    experiment_cell = experiment_stats.iloc[0]

    assert experiment_cell["mean"] == pytest.approx(production_cell["dailyMeanDetections"])
    assert experiment_cell["std"] == pytest.approx(production_cell["dailyStdDetections"])
    assert experiment_cell["sample_days"] == production_cell["sampleDays"]


def test_regional_seasonal_baseline_uses_seasonal_when_enough_years():
    rows = []
    for year in range(2010, 2020):  # 10 years of January data
        rows.append({"grid_lat": 1.0, "grid_lon": 1.0, "detections": 3, "year": year, "month": 1, "region_x": True})
    df = pd.DataFrame(rows)

    result = regional_seasonal_baseline(df, "region_x", min_years=5)
    january = result[result.month == 1].iloc[0]

    assert january["source"] == "regional-seasonal"
    assert january["sample_years"] == 10
    assert january["mean"] == 3.0


def test_regional_seasonal_baseline_falls_back_when_too_few_years():
    rows = [
        {"grid_lat": 1.0, "grid_lon": 1.0, "detections": 3, "year": 2019, "month": 1, "region_x": True},
        {"grid_lat": 1.0, "grid_lon": 1.0, "detections": 9, "year": 2019, "month": 6, "region_x": True},
    ]
    df = pd.DataFrame(rows)

    result = regional_seasonal_baseline(df, "region_x", min_years=5)
    january = result[result.month == 1].iloc[0]

    assert january["source"] == "regional-fallback-all-months"
    # Fallback pools ALL months for the region: mean of [3, 9] = 6.0, not just January's 3.0.
    assert january["mean"] == 6.0
    assert january["sample_years"] == 1  # distinct years across the whole region, not just Jan


def test_regional_seasonal_baseline_empty_region_returns_empty_frame():
    df = pd.DataFrame(
        [{"grid_lat": 1.0, "grid_lon": 1.0, "detections": 3, "year": 2020, "month": 1, "region_x": False}]
    )
    result = regional_seasonal_baseline(df, "region_x", min_years=5)
    assert result.empty


def test_flag_anomaly_returns_none_when_insufficient_data():
    assert flag_anomaly(10, None, None) is None
    assert flag_anomaly(10, 5.0, None) is None
    assert flag_anomaly(10, None, 1.0) is None


def test_flag_anomaly_threshold_math():
    # mean=5, std=2, z=2 -> threshold=9. count=9 is NOT > 9 (strict inequality).
    assert flag_anomaly(9, 5.0, 2.0, z=2.0) is False
    assert flag_anomaly(10, 5.0, 2.0, z=2.0) is True
    assert flag_anomaly(8, 5.0, 2.0, z=2.0) is False
