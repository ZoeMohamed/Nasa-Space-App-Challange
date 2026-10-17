"""Collapse matched MODIS/VIIRS detection pairs into single physical events.

Why this module exists: `match_modis_viirs` tells us which MODIS and VIIRS
rows most likely observed the *same* physical fire pixel. If grid
aggregation (`features.aggregate_grid`) is handed the raw per-sensor
detections unchanged, a MATCHED pair contributes twice to `detections` and
to `frp_sum` -- double-counting one real event and inflating
`attention_score` / `priority_score` for that cell. `build_harmonized_events`
fixes that by collapsing each MATCHED pair into one event row before
aggregation, while leaving MODIS_ONLY / VIIRS_ONLY / unmatched detections as
their own single-row events.
"""

import numpy as np
import pandas as pd


def build_harmonized_events(detections: pd.DataFrame, matches: pd.DataFrame) -> pd.DataFrame:
    """Collapse MATCHED MODIS/VIIRS pairs into one event row each.

    - A MATCHED pair becomes a single row with ``sensor="MATCHED"``,
      ``frp = max(frp of the pair)`` (max, not sum -- the two sensors are
      observing the same physical radiative signal, so summing would
      double-weight it), and ``source_detection_ids`` listing both original
      positional detection ids for traceability.
    - MODIS_ONLY / VIIRS_ONLY / unmatched rows pass through unchanged as
      their own single-row event, with ``source_detection_ids`` containing
      just their own id.

    ``detections`` must be the same (positionally-ordered, already
    quality-filtered) frame that was passed into ``match_modis_viirs`` to
    produce ``matches`` -- the ``detection_id`` values in ``matches`` are
    positions into a 0..n-1 reset of that frame.
    """
    if detections.empty:
        events = detections.copy()
        events["source_detection_ids"] = pd.Series([[] for _ in range(len(events))], index=events.index)
        return events

    data = detections.reset_index(drop=True).copy()
    data["detection_id"] = np.arange(len(data))

    if matches is None or matches.empty:
        data["source_detection_ids"] = data["detection_id"].apply(lambda value: [int(value)])
        return data

    matched = matches[matches["match_status"] == "MATCHED"]
    pairs = {frozenset({int(row.detection_id), int(row.matched_detection_id)}) for _, row in matched.iterrows()}

    det_by_id = data.set_index("detection_id", drop=False)
    rows, consumed_ids = [], set()
    for pair in pairs:
        ids = sorted(pair)
        if not all(identifier in det_by_id.index for identifier in ids):
            continue
        consumed_ids.update(ids)
        sub = det_by_id.loc[ids]
        representative = sub.loc[sub["frp"].astype(float).idxmax()].copy()
        representative["frp"] = float(sub["frp"].astype(float).max())
        representative["sensor"] = "MATCHED"
        representative["detection_id"] = ids[0]
        representative["source_detection_ids"] = [int(i) for i in ids]
        rows.append(representative)

    remaining = data[~data["detection_id"].isin(consumed_ids)].copy()
    remaining["source_detection_ids"] = remaining["detection_id"].apply(lambda value: [int(value)])

    merged_df = pd.DataFrame(rows) if rows else data.iloc[0:0].copy()
    if rows and "source_detection_ids" not in merged_df.columns:
        merged_df["source_detection_ids"] = [row["source_detection_ids"] for row in rows]

    events = pd.concat([merged_df, remaining], ignore_index=True, sort=False)
    return events.reset_index(drop=True)


def daily_grid_activity(detections: pd.DataFrame, matches: pd.DataFrame, cell_size: float = 0.25) -> pd.DataFrame:
    """Aggregate detections to daily totals per 0.25-degree grid cell.

    Mirrors the same design choice as live scoring (see `live.py`):
    - `detections` / `frp_sum` / `frp_max` are computed from the
      *harmonized* events (a MATCHED pair counts once) to avoid
      double-counting one physical detection.
    - `modis_detections` / `viirs_detections` are computed from the
      *raw* per-sensor detections (not harmonized) since they are meant to
      show raw sensor coverage, not a deduplicated count.

    Returns columns: date, area_id, grid_lat, grid_lon, detections,
    modis_detections, viirs_detections, frp_sum, frp_max.
    """
    if detections.empty:
        return pd.DataFrame(
            columns=["date", "area_id", "grid_lat", "grid_lon", "detections", "modis_detections", "viirs_detections", "frp_sum", "frp_max"]
        )

    def with_grid(frame):
        frame = frame.copy()
        frame["grid_lat"] = (np.floor(frame.latitude / cell_size) * cell_size).round(6)
        frame["grid_lon"] = (np.floor(frame.longitude / cell_size) * cell_size).round(6)
        frame["area_id"] = frame.grid_lat.astype(str) + "_" + frame.grid_lon.astype(str)
        frame["date"] = pd.to_datetime(frame.acq_datetime).dt.date.astype("string")
        return frame

    events = build_harmonized_events(detections, matches)
    events = with_grid(events)
    event_totals = events.groupby(["date", "area_id", "grid_lat", "grid_lon"], as_index=False).agg(
        detections=("frp", "size"),
        frp_sum=("frp", "sum"),
        frp_max=("frp", "max"),
    )

    raw = with_grid(detections)
    sensor_counts = (
        raw.pivot_table(index=["date", "area_id"], columns="sensor", values="latitude", aggfunc="size", fill_value=0)
        .rename(columns={"MODIS": "modis_detections", "VIIRS": "viirs_detections"})
        .reset_index()
    )
    for column in ["modis_detections", "viirs_detections"]:
        if column not in sensor_counts:
            sensor_counts[column] = 0

    result = event_totals.merge(sensor_counts[["date", "area_id", "modis_detections", "viirs_detections"]], on=["date", "area_id"], how="left")
    result[["modis_detections", "viirs_detections"]] = result[["modis_detections", "viirs_detections"]].fillna(0).astype(int)
    return result
