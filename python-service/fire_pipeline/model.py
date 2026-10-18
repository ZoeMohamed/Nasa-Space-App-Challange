import os
import sqlite3

import numpy as np
import pandas as pd


def deterministic_priority(df):
    """`priority_score`/`priority_tier`: ranks grid cells for operator
    triage, built on top of `attention_score` (see attention_features()'s
    docstring for that formula's own justification) plus two more proxies:
    growth trend (30%, is this cell's activity increasing) and detection
    count (20%, spatial extent again, independent of `attention_score`'s own
    count term since this re-ranks across the whole batch rather than just
    this cell).

    This is a deterministic formula, not a trained or AI model -- no fire
    behavior prediction is happening here. The weights (50/30/20) and the
    tier cutoffs (0.66/0.33) are engineering defaults chosen for a
    reasonable high/medium/low spread on typical batches, not validated
    against any real fire-management agency's prioritization criteria (e.g.
    Manggala Agni) or a labeled ground-truth dataset. Before this is used
    for anything beyond demo/triage-ordering, it needs that external
    validation -- documenting that gap honestly here rather than silently
    presenting tier labels as more authoritative than they are.
    """
    result = df.copy()
    if result.empty:
        return result
    trend = result.growth.fillna(0).rank(pct=True)
    count = result.detections.fillna(0).rank(pct=True)
    result["priority_score"] = (0.5 * result.attention_score + 0.3 * trend + 0.2 * count).fillna(0)
    result["priority_rank"] = result.priority_score.rank(method="dense", ascending=False).astype(int)
    result["priority_tier"] = np.select([result.priority_score >= 0.66, result.priority_score >= 0.33], ["high", "medium"], default="low")
    result["priority"] = result["priority_tier"]
    return result.sort_values("priority_score", ascending=False)


def _load_historical_cell_stats(sqlite_path):
    """Per-(grid_lat, grid_lon) baseline of daily frp_sum from the offline
    historical SQLite store (see scripts/build_historical_store.py).

    Returns None if the store is missing or empty -- callers fall back to
    same-batch statistics in that case, since there is nothing real to use
    yet (e.g. the store hasn't been built, or this cell has no history).
    """
    if not sqlite_path or not os.path.exists(sqlite_path):
        return None
    try:
        connection = sqlite3.connect(sqlite_path)
        try:
            history = pd.read_sql_query("SELECT grid_lat, grid_lon, frp_sum FROM daily_area_activity", connection)
        finally:
            connection.close()
    except sqlite3.Error:
        return None
    if history.empty:
        return None
    return history.groupby(["grid_lat", "grid_lon"], as_index=False).frp_sum.agg(baseline_mean="mean", baseline_std="std")


def historical_baseline(df, sqlite_path=None):
    """Attach baseline_mean/baseline_std/baseline_source to each area row.

    When `sqlite_path` points at a built historical store (see
    scripts/build_historical_store.py) and it has data for a given
    (grid_lat, grid_lon) cell, the baseline is real multi-year history for
    that cell. Otherwise -- store missing, not yet built, or this specific
    cell not yet covered -- this falls back to the previous behavior:
    mean/std of frp_sum computed across the SAME live batch being
    processed (not a real historical baseline, just same-batch stats).
    Each row's `baseline_source` column records which mode was used
    ("historical" or "same-batch-fallback") so callers can report it
    honestly instead of implying real history where there is none.

    This used to also compute `z_score`/`anomaly` (frp_sum vs. this same
    per-cell daily baseline), removed 2026-10-19: confirmed by repo-wide
    grep that nothing ever consumed those two columns (`summarize_areas()`
    in live.py only ever serialized `baseline_source`), and the underlying
    per-cell DAILY frp_sum baseline has the same sparsity problem documented
    for the (separately fixed) /calendar daily-detections baseline -- ~30%
    of grid cells have under 10 days of history, too few for a std/z-score
    to mean much. Don't resurrect this without the same minimum-sample
    gating applied to the /calendar daily fields.
    """
    result = df.copy()
    if result.empty:
        return result
    keys = [column for column in ["grid_lat", "grid_lon"] if column in result]

    same_batch_stats = result.groupby(keys).frp_sum.agg(baseline_mean="mean", baseline_std="std").reset_index()
    historical_stats = _load_historical_cell_stats(sqlite_path)

    if historical_stats is not None and not historical_stats.empty:
        result = result.merge(historical_stats, on=keys, how="left")
        result["baseline_source"] = np.where(result["baseline_mean"].notna(), "historical", "same-batch-fallback")
        missing = result["baseline_mean"].isna()
        if missing.any():
            fallback = same_batch_stats.rename(columns={"baseline_mean": "fallback_mean", "baseline_std": "fallback_std"})
            result = result.merge(fallback, on=keys, how="left")
            result.loc[missing, "baseline_mean"] = result.loc[missing, "fallback_mean"]
            result.loc[missing, "baseline_std"] = result.loc[missing, "fallback_std"]
            result = result.drop(columns=["fallback_mean", "fallback_std"])
    else:
        result = result.merge(same_batch_stats, on=keys, how="left")
        result["baseline_source"] = "same-batch-fallback"

    return result
