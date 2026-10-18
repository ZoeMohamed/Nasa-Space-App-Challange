"""Verify how zero-detection days are represented in historical.sqlite,
BEFORE either baseline is built. This is not a formality -- it determines
whether "mean of detections per day/month" means "mean across all possible
days" (a true rate) or "mean across days where something happened to be
detected" (a conditional mean, systematically higher), and whether a
day/month absent from the baseline's sample can be safely treated as zero.

Run directly: `python -m ml_experiments.anomaly_detection.data_audit`
(from python-service/, with the venv active).
"""

from __future__ import annotations

import sys

import pandas as pd

from ml_experiments.shared.dataset import load_daily_area_activity


def audit(df: pd.DataFrame) -> dict:
    """Returns a dict of verified facts about the table's structure --
    every value here is measured directly from the data, not assumed.
    """
    if df.empty:
        return {"empty": True}

    findings: dict = {"empty": False}

    # 1) Does a (date, area_id) pair with zero detections ever appear as an
    #    explicit row? If the table only ever stores rows via a groupby over
    #    actual detections (as daily_grid_activity() in harmonize_events.py
    #    does), the answer must be "no" by construction -- verify, don't
    #    assume the code review was right.
    findings["zero_detection_rows"] = int((df["detections"] == 0).sum())

    # 2) Row-level granularity check: is there ever more than one row for
    #    the same (date, area_id)? If so, "one row = one cell-day" (which
    #    the daily baseline relies on) would be false.
    dup_count = df.duplicated(subset=["date", "area_id"]).sum()
    findings["duplicate_date_area_rows"] = int(dup_count)

    # 3) Per-cell sparsity: how many distinct days does each cell have a row
    #    for, out of the days it COULD have a row for (its own first-to-last
    #    observed date span, not the full 2000-2026 range -- a cell that
    #    only started being observed in 2020 was never "silently zero"
    #    before 2020, it simply wasn't covered by any FIRMS pass we have).
    span = df.groupby("area_id")["date"].agg(first="min", last="max", count="size")
    span["span_days"] = (span["last"] - span["first"]).dt.days + 1
    span["density"] = span["count"] / span["span_days"]
    findings["cells_total"] = int(len(span))
    findings["cell_density_median"] = float(span["density"].median())
    findings["cell_density_mean"] = float(span["density"].mean())
    findings["cells_with_density_over_50pct"] = int((span["density"] > 0.5).sum())
    findings["cells_with_under_10_days"] = int((span["count"] < 10).sum())

    # 4) Can "missing" be safely treated as "confirmed zero fires that day"?
    #    No -- a missing (date, cell) row is consistent with at least three
    #    different real situations that this table cannot distinguish:
    #      a) no satellite passed over that cell that day,
    #      b) a satellite passed but every detection failed the high-
    #         confidence filter (low/nominal confidence rows are dropped
    #         upstream, before this table is built -- see
    #         high_confidence_mask() in fire_pipeline/clean.py),
    #      c) a satellite passed, nothing was burning, zero detections is
    #         the correct true value.
    #    This table alone cannot tell these apart. Documented as a hard
    #    limitation, not resolved here.
    findings["zero_fill_is_safe"] = False
    findings["zero_fill_caveat"] = (
        "A missing (date, cell) row is NOT distinguishable from 'no satellite "
        "pass', 'detections existed but were below the confidence filter', or "
        "'true zero'. Treating missing as a confirmed zero would silently "
        "fabricate a label this table cannot support."
    )

    return findings


def format_report(findings: dict) -> str:
    if findings.get("empty"):
        return "historical.sqlite is empty or missing -- no audit possible."
    lines = [
        "=== Data Representation Audit: daily_area_activity ===",
        f"Zero-detection rows found: {findings['zero_detection_rows']} (expected 0 if the table is groupby-only)",
        f"Duplicate (date, area_id) rows: {findings['duplicate_date_area_rows']} (expected 0)",
        f"Total cells: {findings['cells_total']}",
        f"Median per-cell density (observed days / cell's own observed span): {findings['cell_density_median']:.4f}",
        f"Mean per-cell density: {findings['cell_density_mean']:.4f}",
        f"Cells with >50% density: {findings['cells_with_density_over_50pct']}",
        f"Cells with <10 total observed days: {findings['cells_with_under_10_days']}",
        f"Safe to zero-fill missing days? {findings['zero_fill_is_safe']}",
        f"  Caveat: {findings['zero_fill_caveat']}",
    ]
    return "\n".join(lines)


def main() -> int:
    df = load_daily_area_activity()
    findings = audit(df)
    print(format_report(findings))
    return 0 if not findings.get("empty") else 1


if __name__ == "__main__":
    sys.exit(main())
