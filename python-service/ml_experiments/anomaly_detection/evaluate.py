"""Rolling-origin comparison of the two Goal-A baselines (baselines.py)
against real historical.sqlite data. No model training happens here --
this evaluates two closed-form statistical methods against each other and
against simple qualitative sanity checks. There is no independent fire
ground truth in this dataset (confirmed in the Stage 1 audit), so nothing
here is scored as "accuracy" -- see report_results()' explicit caveats.

Run directly: `python -m ml_experiments.anomaly_detection.evaluate`
(from python-service/, with the venv active). Prints a report and writes
`ml_experiments/anomaly_detection/results/latest.json`.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import pandas as pd

from ml_experiments.anomaly_detection.baselines import (
    MIN_REGIONAL_SEASONAL_YEARS,
    fixed_per_cell_daily_baseline,
    flag_anomaly,
    regional_seasonal_baseline,
)
from ml_experiments.shared.dataset import REGIONS, assign_regions, load_daily_area_activity

RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")

# First full calendar year with any VIIRS contribution in this archive
# (VIIRS rows start 2012-01-23, confirmed in Stage 1 / data_audit.py) -- used
# as the boundary for the "VIIRS-era-only" fold regime below, to avoid
# blending MODIS-only years into a baseline meant to generalize over a
# VIIRS-inclusive test year.
FIRST_FULL_VIIRS_YEAR = 2013

# Years this dataset's own yearly totals (Stage 1 audit) show as clearly
# high- or low-activity, used ONLY for the qualitative sanity check in
# Section 4 below -- not a labeled ground truth, not used to tune anything.
KNOWN_HIGH_ACTIVITY_YEARS = [2015, 2019]
KNOWN_LOW_ACTIVITY_YEARS = [2020, 2021, 2022]


def build_folds(years_available: list[int], min_train_year: int | None, min_test_year: int = 2014) -> list[tuple[list[int], int]]:
    """Rolling-origin folds: (train_years, test_year), one per available
    test year >= min_test_year, where train_years are every available year
    strictly before test_year (and >= min_train_year, if given). A fold is
    only produced if it has at least one training year -- no fold ever
    trains on data from its own or a later test year (the leakage check
    this function exists to guarantee).
    """
    folds = []
    for test_year in sorted(y for y in years_available if y >= min_test_year):
        train_years = [
            y for y in years_available if y < test_year and (min_train_year is None or y >= min_train_year)
        ]
        if train_years:
            folds.append((train_years, test_year))
    return folds


def evaluate_fold(
    df: pd.DataFrame, region_assigned: pd.DataFrame, train_years: list[int], test_year: int, region_name: str, z: float, min_years: int
) -> dict:
    train_df = df[df["year"].isin(train_years)]
    test_df = df[df["year"] == test_year]
    train_region_df = region_assigned[region_assigned["year"].isin(train_years)]
    test_region_df = region_assigned[(region_assigned["year"] == test_year) & (region_assigned[f"region_{region_name}"])]

    if test_region_df.empty or train_region_df.empty:
        return {
            "train_years": train_years,
            "test_year": test_year,
            "region": region_name,
            "skipped": True,
            "reason": "no train or no test data for this region/year combination",
        }

    cell_baseline = fixed_per_cell_daily_baseline(train_df)
    cell_baseline_idx = cell_baseline.set_index(["grid_lat", "grid_lon"])

    seasonal_baseline = regional_seasonal_baseline(train_region_df, f"region_{region_name}", min_years=min_years)
    seasonal_idx = seasonal_baseline.set_index("month")

    rows = []
    for _, test_row in test_region_df.iterrows():
        key = (test_row["grid_lat"], test_row["grid_lon"])
        count = test_row["detections"]

        if key in cell_baseline_idx.index:
            cb = cell_baseline_idx.loc[key]
            cell_flag = flag_anomaly(count, cb["mean"], cb["std"], z=z)
            cell_source = cb["source"]
        else:
            cell_flag, cell_source = None, "no-history-for-cell"

        month = test_row["month"]
        if month in seasonal_idx.index:
            sb = seasonal_idx.loc[month]
            seasonal_flag = flag_anomaly(count, sb["mean"], sb["std"], z=z)
            seasonal_source = sb["source"]
        else:
            seasonal_flag, seasonal_source = None, "no-history-for-region-month"

        rows.append(
            {
                "cell_flag": cell_flag,
                "cell_source": cell_source,
                "seasonal_flag": seasonal_flag,
                "seasonal_source": seasonal_source,
            }
        )

    result_df = pd.DataFrame(rows)
    both_available = result_df[(result_df["cell_flag"].notna()) & (result_df["seasonal_flag"].notna())]

    return {
        "train_years": train_years,
        "test_year": test_year,
        "region": region_name,
        "skipped": False,
        "test_observations": len(result_df),
        "cell_method": {
            "available_count": int(result_df["cell_flag"].notna().sum()),
            "flagged_count": int((result_df["cell_flag"] == True).sum()),  # noqa: E712
            "flag_rate": _safe_rate(result_df["cell_flag"]),
        },
        "seasonal_method": {
            "available_count": int(result_df["seasonal_flag"].notna().sum()),
            "flagged_count": int((result_df["seasonal_flag"] == True).sum()),  # noqa: E712
            "flag_rate": _safe_rate(result_df["seasonal_flag"]),
            "fallback_count": int((result_df["seasonal_source"] == "regional-fallback-all-months").sum()),
            "fallback_rate": float((result_df["seasonal_source"] == "regional-fallback-all-months").mean()) if len(result_df) else None,
        },
        "agreement": {
            "comparable_observations": len(both_available),
            "agree_count": int((both_available["cell_flag"] == both_available["seasonal_flag"]).sum()) if len(both_available) else None,
            "agreement_rate": (
                float((both_available["cell_flag"] == both_available["seasonal_flag"]).mean()) if len(both_available) else None
            ),
        },
    }


def _safe_rate(series: pd.Series) -> float | None:
    available = series.notna()
    if available.sum() == 0:
        return None
    return float((series[available] == True).mean())  # noqa: E712


def run_rolling_origin(df: pd.DataFrame, region_assigned: pd.DataFrame, min_train_year: int | None, z: float = 2.0, min_years: int = MIN_REGIONAL_SEASONAL_YEARS) -> list[dict]:
    years_available = sorted(df["year"].unique().tolist())
    folds = build_folds(years_available, min_train_year=min_train_year)
    results = []
    for region_name in REGIONS:
        for train_years, test_year in folds:
            results.append(evaluate_fold(df, region_assigned, train_years, test_year, region_name, z=z, min_years=min_years))
    return results


def sensitivity_sweep(df: pd.DataFrame, region_assigned: pd.DataFrame, min_train_year: int) -> dict:
    """Re-run the rolling-origin comparison at several threshold (z) and
    min-years-for-seasonal values, to report how much the conclusions
    depend on those two arbitrary choices (per Stage 2 design, item 1/2).
    """
    sweep = {"threshold_z": {}, "min_years": {}}
    for z in [1.5, 2.0, 2.5, 3.0]:
        results = run_rolling_origin(df, region_assigned, min_train_year=min_train_year, z=z)
        sweep["threshold_z"][str(z)] = _summarize(results)
    for min_years in [3, 5, 8]:
        results = run_rolling_origin(df, region_assigned, min_train_year=min_train_year, min_years=min_years)
        sweep["min_years"][str(min_years)] = _summarize(results)
    return sweep


def _summarize(results: list[dict]) -> dict:
    usable = [r for r in results if not r.get("skipped")]
    if not usable:
        return {"folds": 0}
    cell_flag_rates = [r["cell_method"]["flag_rate"] for r in usable if r["cell_method"]["flag_rate"] is not None]
    seasonal_flag_rates = [r["seasonal_method"]["flag_rate"] for r in usable if r["seasonal_method"]["flag_rate"] is not None]
    fallback_rates = [r["seasonal_method"]["fallback_rate"] for r in usable if r["seasonal_method"]["fallback_rate"] is not None]
    agreement_rates = [r["agreement"]["agreement_rate"] for r in usable if r["agreement"]["agreement_rate"] is not None]
    return {
        "folds": len(usable),
        "mean_cell_flag_rate": sum(cell_flag_rates) / len(cell_flag_rates) if cell_flag_rates else None,
        "mean_seasonal_flag_rate": sum(seasonal_flag_rates) / len(seasonal_flag_rates) if seasonal_flag_rates else None,
        "mean_seasonal_fallback_rate": sum(fallback_rates) / len(fallback_rates) if fallback_rates else None,
        "mean_agreement_rate": sum(agreement_rates) / len(agreement_rates) if agreement_rates else None,
    }


def qualitative_year_check(df: pd.DataFrame, region_assigned: pd.DataFrame, min_train_year: int) -> dict:
    """NOT a ground-truth validation (no independent fire-occurrence labels
    exist in this dataset -- see Stage 1 audit). This only checks whether
    either method's flag rate is at least directionally higher during years
    this dataset's own totals already show as high-activity vs low-activity
    -- a sanity check that a method isn't flagging quiet years MORE than
    loud ones, nothing stronger than that.
    """
    results = run_rolling_origin(df, region_assigned, min_train_year=min_train_year)
    by_year: dict[int, list[dict]] = {}
    for r in results:
        if r.get("skipped"):
            continue
        by_year.setdefault(r["test_year"], []).append(r)

    def year_rates(years):
        cell_rates, seasonal_rates = [], []
        for y in years:
            for r in by_year.get(y, []):
                if r["cell_method"]["flag_rate"] is not None:
                    cell_rates.append(r["cell_method"]["flag_rate"])
                if r["seasonal_method"]["flag_rate"] is not None:
                    seasonal_rates.append(r["seasonal_method"]["flag_rate"])
        return {
            "mean_cell_flag_rate": sum(cell_rates) / len(cell_rates) if cell_rates else None,
            "mean_seasonal_flag_rate": sum(seasonal_rates) / len(seasonal_rates) if seasonal_rates else None,
            "n_fold_region_results": len(cell_rates),
        }

    high = year_rates(KNOWN_HIGH_ACTIVITY_YEARS)
    low = year_rates(KNOWN_LOW_ACTIVITY_YEARS)
    return {
        "known_high_activity_years": KNOWN_HIGH_ACTIVITY_YEARS,
        "known_low_activity_years": KNOWN_LOW_ACTIVITY_YEARS,
        "high_years": high,
        "low_years": low,
        "caveat": (
            "Qualitative sanity check only. 'High/low activity year' is based on this "
            "dataset's own yearly detection totals (Stage 1 audit), not an independent "
            "fire-occurrence record. Do not read this as accuracy or validation."
        ),
    }


def main() -> int:
    df = load_daily_area_activity()
    if df.empty:
        print("historical.sqlite is empty or missing -- cannot run evaluation. Build it first via scripts/build_historical_store.py.")
        return 1

    region_assigned = assign_regions(df)

    report: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_note": (
            "Baselines are means/stds over days that had >=1 detection, not zero-filled "
            "daily rates -- see data_audit.py. No independent fire-occurrence ground truth "
            "exists in this dataset; nothing below is an accuracy metric."
        ),
    }

    print("Running rolling-origin evaluation (full-history training, including pre-VIIRS years)...")
    full_history = run_rolling_origin(df, region_assigned, min_train_year=None)
    report["full_history_folds"] = full_history
    report["full_history_summary"] = _summarize(full_history)
    report["full_history_caveat"] = (
        "Training windows here can span the pre-2012 MODIS-only era and the post-2012 "
        "MODIS+VIIRS era in the same baseline -- a real confound (more sensors, not "
        "necessarily more fire) flagged in the Stage 1 audit. Included for completeness; "
        "the VIIRS-era-only run below is the one that avoids this confound."
    )

    print(f"Running rolling-origin evaluation (VIIRS-era-only training, >= {FIRST_FULL_VIIRS_YEAR})...")
    viirs_era = run_rolling_origin(df, region_assigned, min_train_year=FIRST_FULL_VIIRS_YEAR)
    report["viirs_era_folds"] = viirs_era
    report["viirs_era_summary"] = _summarize(viirs_era)

    print("Running sensitivity sweep (threshold z, min-years-for-seasonal)...")
    report["sensitivity_sweep"] = sensitivity_sweep(df, region_assigned, min_train_year=FIRST_FULL_VIIRS_YEAR)

    print("Running qualitative high/low-activity-year sanity check...")
    report["qualitative_year_check"] = qualitative_year_check(df, region_assigned, min_train_year=FIRST_FULL_VIIRS_YEAR)

    os.makedirs(RESULTS_DIR, exist_ok=True)
    out_path = os.path.join(RESULTS_DIR, "latest.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"\nWrote full results to {out_path}")
    print("\n=== Summary ===")
    print("Full-history (confounded by sensor era):", report["full_history_summary"])
    print(f"VIIRS-era-only (>= {FIRST_FULL_VIIRS_YEAR}):", report["viirs_era_summary"])
    print("Qualitative year check:", report["qualitative_year_check"]["high_years"], "vs", report["qualitative_year_check"]["low_years"])

    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
