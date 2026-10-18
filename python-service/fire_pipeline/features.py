import numpy as np
import pandas as pd


def aggregate_grid(df, cell_size=0.25):
    if df.empty:
        return pd.DataFrame()
    data = df[df.quality_ok].copy()
    data["grid_lat"] = (np.floor(data.latitude / cell_size) * cell_size).round(6)
    data["grid_lon"] = (np.floor(data.longitude / cell_size) * cell_size).round(6)
    data["area_id"] = data.grid_lat.astype(str) + "_" + data.grid_lon.astype(str)
    data["date"] = pd.to_datetime(data.acq_datetime).dt.date

    def sensors(values):
        return ",".join(sorted(set(values.dropna())))

    areas = data.groupby("area_id", as_index=False).agg(
        grid_lat=("grid_lat", "first"),
        grid_lon=("grid_lon", "first"),
        detections=("latitude", "size"),
        active_days=("date", "nunique"),
        first_date=("date", "min"),
        last_date=("date", "max"),
        peak_date=("frp", lambda values: data.loc[values.idxmax(), "date"]),
        frp_sum=("frp", "sum"),
        frp_mean=("frp", "mean"),
        frp_max=("frp", "max"),
        brightness_mean=("brightness", "mean"),
        confidence_mean=("confidence_num", "mean"),
        sensors=("sensor", sensors),
    )
    sensor_counts = data.pivot_table(index="area_id", columns="sensor", values="latitude", aggfunc="size", fill_value=0).rename(columns={"MODIS": "modis_detections", "VIIRS": "viirs_detections"})
    for column in ["modis_detections", "viirs_detections"]:
        if column not in sensor_counts:
            sensor_counts[column] = 0
    daily = data.groupby(["area_id", "date"]).size().rename("daily_detections").reset_index()
    daily_stats = daily.groupby("area_id").daily_detections.agg(max_daily_detections="max", mean_daily_detections="mean").reset_index()
    active = daily[["area_id", "date"]].drop_duplicates()

    def streak(group):
        dates = sorted(pd.to_datetime(group.date).dt.normalize().unique())
        best = current = 0
        previous = None
        for date in dates:
            current = current + 1 if previous is not None and date == previous + np.timedelta64(1, "D") else 1
            best = max(best, current)
            previous = date
        return best

    consecutive = active.groupby("area_id").apply(streak, include_groups=False).rename("consecutive_active_days").reset_index()
    return (
        areas.merge(sensor_counts[["modis_detections", "viirs_detections"]], left_on="area_id", right_index=True, how="left")
        .merge(daily_stats, on="area_id", how="left")
        .merge(consecutive, on="area_id", how="left")
        .fillna(0)
    )


def temporal_features(areas):
    result = areas.copy()
    if result.empty:
        return result
    result["analysis_period"] = pd.to_datetime(result["first_date"]).dt.strftime("%Y-%m-%d") + "/" + pd.to_datetime(result["last_date"]).dt.strftime("%Y-%m-%d")
    inclusive_days = (pd.to_datetime(result.last_date) - pd.to_datetime(result.first_date)).dt.days + 1
    result["persistence"] = (result.active_days / inclusive_days.clip(lower=1)).clip(0, 1)
    result["growth"] = (result.frp_max - result.frp_mean) / result.frp_mean.replace(0, np.nan)
    result["multi_sensor"] = result.sensors.str.contains(",")
    return result


def attention_features(areas):
    """`attention_score`: a deterministic 0-1 ranking signal per grid cell,
    not a calibrated danger probability. The three inputs are each a
    standard proxy in satellite fire monitoring, not arbitrary choices:
    - FRP (fire radiative power, 45%) is the standard remote-sensing proxy
      for fire intensity (Giglio et al., the same metric MODIS/VIIRS active
      fire products themselves report).
    - persistence (30%, fraction of recent days with a detection in this
      cell) is a common proxy for a sustained vs. transient fire.
    - detection count (25%) is a simple spatial-extent proxy.

    The WEIGHTS (45/30/25) are an engineering default, not fitted to ground
    truth or expert-elicited -- this has not been validated against a real
    fire-management agency's criteria. Treat `attention_score` as "rank
    these cells by relative urgency," not as a validated risk/danger score,
    until that validation happens.
    """
    result = areas.copy()
    if result.empty:
        return result
    result["attention_score"] = (
        0.45 * result.frp_sum.rank(pct=True)
        + 0.3 * result.persistence.fillna(0).clip(0, 1)
        + 0.25 * result.detections.rank(pct=True)
    ).clip(0, 1)
    result["attention_criteria"] = "FRP(45%)+persistence(30%)+detections(25%)"
    return result
