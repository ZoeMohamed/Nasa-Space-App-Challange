import pandas as pd

from ml_experiments.anomaly_detection.data_audit import audit


def test_audit_reports_empty_for_empty_dataframe():
    result = audit(pd.DataFrame())
    assert result == {"empty": True}


def test_audit_detects_zero_detection_rows_if_present():
    # The real table never has these (confirmed against real data separately,
    # see this module's manual run), but the detector itself must work if a
    # future ingestion change ever introduces one.
    df = pd.DataFrame(
        [
            {"date": pd.Timestamp("2020-01-01"), "area_id": "a", "grid_lat": 1.0, "grid_lon": 1.0, "detections": 2},
            {"date": pd.Timestamp("2020-01-02"), "area_id": "a", "grid_lat": 1.0, "grid_lon": 1.0, "detections": 0},
        ]
    )
    result = audit(df)
    assert result["zero_detection_rows"] == 1


def test_audit_detects_duplicate_date_area_rows():
    df = pd.DataFrame(
        [
            {"date": pd.Timestamp("2020-01-01"), "area_id": "a", "grid_lat": 1.0, "grid_lon": 1.0, "detections": 2},
            {"date": pd.Timestamp("2020-01-01"), "area_id": "a", "grid_lat": 1.0, "grid_lon": 1.0, "detections": 3},
        ]
    )
    result = audit(df)
    assert result["duplicate_date_area_rows"] == 1


def test_audit_always_reports_zero_fill_unsafe():
    # This must never flip to True without an explicit, reviewed change --
    # it's a claim about what the table CAN support, not a tunable setting.
    df = pd.DataFrame(
        [{"date": pd.Timestamp("2020-01-01"), "area_id": "a", "grid_lat": 1.0, "grid_lon": 1.0, "detections": 2}]
    )
    result = audit(df)
    assert result["zero_fill_is_safe"] is False
    assert "NOT distinguishable" in result["zero_fill_caveat"]


def test_audit_density_uses_cells_own_observed_span():
    # Cell with 2 detections 10 days apart -> span=11 days, density=2/11.
    df = pd.DataFrame(
        [
            {"date": pd.Timestamp("2020-01-01"), "area_id": "a", "grid_lat": 1.0, "grid_lon": 1.0, "detections": 2},
            {"date": pd.Timestamp("2020-01-11"), "area_id": "a", "grid_lat": 1.0, "grid_lon": 1.0, "detections": 1},
        ]
    )
    result = audit(df)
    assert result["cell_density_median"] == 2 / 11
