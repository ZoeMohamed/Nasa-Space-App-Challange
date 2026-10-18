import pandas as pd

from ml_experiments.anomaly_detection.evaluate import build_folds, evaluate_fold


def test_build_folds_never_trains_on_test_year_or_later():
    years = [2010, 2011, 2012, 2013, 2014]
    folds = build_folds(years, min_train_year=None, min_test_year=2012)
    for train_years, test_year in folds:
        assert all(y < test_year for y in train_years), f"leakage: {train_years} contains a year >= test_year {test_year}"


def test_build_folds_respects_min_train_year():
    years = [2008, 2009, 2010, 2011, 2012, 2013]
    folds = build_folds(years, min_train_year=2010, min_test_year=2011)
    for train_years, test_year in folds:
        assert all(y >= 2010 for y in train_years)


def test_build_folds_skips_test_years_with_no_available_training_year():
    # Only year available is 2020 itself -- no prior year exists, so no fold
    # should be produced for it (a fold needs >=1 real training year).
    years = [2020]
    folds = build_folds(years, min_train_year=None, min_test_year=2014)
    assert folds == []


def test_evaluate_fold_flags_a_clear_outlier():
    # Region "x" training data: cell (1,1) always has 2 detections/day across
    # several training days -> tight baseline (mean=2, std=0-ish). Test year
    # has one day with 50 detections -> must be flagged by both methods.
    train_rows = []
    for month in range(1, 6):
        for day_offset in range(3):
            train_rows.append(
                {
                    "grid_lat": 1.0, "grid_lon": 1.0, "detections": 2,
                    "year": 2020, "month": month,
                    "date": pd.Timestamp(f"2020-{month:02d}-{1+day_offset:02d}"),
                }
            )
    test_rows = [
        {"grid_lat": 1.0, "grid_lon": 1.0, "detections": 50, "year": 2021, "month": 1, "date": pd.Timestamp("2021-01-15")},
    ]
    df = pd.DataFrame(train_rows + test_rows)
    region_df = df.copy()
    region_df["region_x"] = True

    result = evaluate_fold(df, region_df, train_years=[2020], test_year=2021, region_name="x", z=2.0, min_years=1)

    assert result["skipped"] is False
    assert result["cell_method"]["flagged_count"] == 1
    assert result["seasonal_method"]["flagged_count"] == 1


def test_evaluate_fold_skipped_when_no_test_data_for_region_year():
    df = pd.DataFrame(
        [{"grid_lat": 1.0, "grid_lon": 1.0, "detections": 2, "year": 2020, "month": 1, "date": pd.Timestamp("2020-01-01")}]
    )
    region_df = df.copy()
    region_df["region_x"] = True

    result = evaluate_fold(df, region_df, train_years=[2020], test_year=2021, region_name="x", z=2.0, min_years=1)
    assert result["skipped"] is True
