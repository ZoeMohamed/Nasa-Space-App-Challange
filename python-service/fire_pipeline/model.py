import numpy as np


def deterministic_priority(df):
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


def historical_baseline(df):
    result = df.copy()
    if result.empty:
        return result
    keys = [column for column in ["grid_lat", "grid_lon"] if column in result]
    stats = result.groupby(keys).frp_sum.agg(baseline_mean="mean", baseline_std="std").reset_index()
    result = result.merge(stats, on=keys, how="left")
    result["z_score"] = (result.frp_sum - result.baseline_mean) / result.baseline_std.replace(0, np.nan)
    result["anomaly"] = result.z_score.ge(2).fillna(False)
    return result
