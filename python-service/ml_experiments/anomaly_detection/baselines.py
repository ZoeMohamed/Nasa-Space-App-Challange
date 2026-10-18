"""Two anomaly-flagging methods, compared head-to-head in evaluate.py.

Both are closed-form statistics (mean/std + a 2x threshold) -- NOT trained
models, per this stage's explicit scope (no ML yet). Both only ever flag a
day as "unusual relative to its own historical baseline" -- neither claims
to detect or confirm an actual fire; see each function's docstring.

IMPORTANT caveat inherited from data_audit.py, repeated here because it
governs every mean/std below: every baseline in this file is a mean/std
over DAYS (or MONTHS) THAT HAD AT LEAST ONE DETECTION. There is no zero-
filling. A baseline_mean of e.g. 3.2 detections/day means "on days when
this cell/region had any detection at all, it averaged 3.2", not "on a
randomly chosen day this cell averages 3.2" -- the latter is unknowable
from this table (see data_audit.py's zero_fill_caveat).
"""

from __future__ import annotations

import pandas as pd

MIN_DAILY_SAMPLES = 2  # std of 0/1 samples is undefined
MIN_REGIONAL_SEASONAL_YEARS = 5  # floor chosen in Stage 2 design, see module README


def fixed_per_cell_daily_baseline(df: pd.DataFrame) -> pd.DataFrame:
    """Reproduces the CURRENT PRODUCTION method (post P0-fix), independently
    implemented here (not imported from fire_pipeline/, to keep this
    directory import-independent of production code) -- fidelity to the
    real production output is verified by
    tests/test_baselines.py::test_fixed_baseline_matches_production_historical_py,
    which cross-checks this function's output against
    fire_pipeline.historical.load_calendar_summary()'s real dailyMean/
    dailyStd fields for the same real data.

    Per (grid_lat, grid_lon) cell: mean/std of single-day detection counts,
    over however many days that cell has ANY row for (see module docstring
    -- not zero-filled). `sample_days` is that count. std is None when
    sample_days < MIN_DAILY_SAMPLES.
    """
    stats = df.groupby(["grid_lat", "grid_lon"], as_index=False)["detections"].agg(
        mean="mean", std="std", sample_days="size"
    )
    stats.loc[stats["sample_days"] < MIN_DAILY_SAMPLES, "std"] = None
    stats["source"] = "per-cell-daily"
    return stats


def regional_seasonal_baseline(
    df: pd.DataFrame, region_column: str, min_years: int = MIN_REGIONAL_SEASONAL_YEARS
) -> pd.DataFrame:
    """Per (region, calendar month): mean/std of single-day detection
    counts, pooled across every year that region×month has data for.

    `region_column` selects which of dataset.assign_regions()'s boolean
    region_<name> columns to use -- only rows where that column is True
    are included (a row may belong to more than one region, see
    dataset.REGIONS' docstring).

    Returns one row per (month, fallback) combination:
    - If that month has >= min_years distinct years of data: a real
      seasonal baseline, source="regional-seasonal".
    - Otherwise: falls back to the region's ALL-MONTHS pooled baseline
      (no seasonality, but still real data), source="regional-fallback-all-months".
      This fallback is computed once per region and reused for every month
      that doesn't meet the seasonal floor.
    `sample_years`/`sample_days` record exactly what each row's number is
    built from, so a caller can see which rows are the weaker fallback
    without re-deriving it.
    """
    region_df = df[df[region_column]]
    if region_df.empty:
        return pd.DataFrame(
            columns=["month", "mean", "std", "sample_days", "sample_years", "source"]
        )

    # All-months pooled fallback for this region (computed once).
    fallback_years = region_df["year"].nunique()
    fallback_mean = region_df["detections"].mean()
    fallback_std = region_df["detections"].std() if len(region_df) >= MIN_DAILY_SAMPLES else None
    fallback_days = len(region_df)

    rows = []
    for month in range(1, 13):
        month_df = region_df[region_df["month"] == month]
        sample_years = month_df["year"].nunique()
        if sample_years >= min_years:
            rows.append(
                {
                    "month": month,
                    "mean": float(month_df["detections"].mean()),
                    "std": float(month_df["detections"].std()) if len(month_df) >= MIN_DAILY_SAMPLES else None,
                    "sample_days": int(len(month_df)),
                    "sample_years": int(sample_years),
                    "source": "regional-seasonal",
                }
            )
        else:
            rows.append(
                {
                    "month": month,
                    "mean": float(fallback_mean) if pd.notna(fallback_mean) else None,
                    "std": float(fallback_std) if fallback_std is not None and pd.notna(fallback_std) else None,
                    "sample_days": int(fallback_days),
                    "sample_years": int(fallback_years),
                    "source": "regional-fallback-all-months",
                }
            )
    return pd.DataFrame(rows)


def flag_anomaly(count: float, mean: float | None, std: float | None, z: float = 2.0) -> bool | None:
    """Shared threshold rule for both methods: count > mean + z*std.
    Returns None (not a flag, not a non-flag) when mean/std are unavailable
    -- a caller must not silently treat "insufficient data" as "not
    anomalous", those are different things.
    """
    if mean is None or std is None or pd.isna(mean) or pd.isna(std):
        return None
    return bool(count > mean + z * std)
