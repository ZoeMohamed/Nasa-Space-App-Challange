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

from .matching import haversine_km


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


# --- VIIRS cross-satellite duplicates -------------------------------------------------------------
#
# Live data carries VIIRS from up to three satellites (Suomi-NPP, NOAA-20, NOAA-21) that pass over
# Indonesia within ~20-100 minutes of each other, so one fire pixel is often detected two or three
# times. match_modis_viirs only pairs MODIS with VIIRS, so before this existed every such repeat was
# its own event (audit_2026_10, finding A1). The rule below was chosen from a frozen 24 h snapshot
# (ml_experiments/audit_2026_10/results/viirs_cross_satellite_probe.txt):
#   - nearest detection from ANOTHER VIIRS satellite: median 0.23-0.26 km (S-NPP -> NOAA-20/21);
#   - nearest OTHER pixel from the SAME satellite: median 0.38-0.41 km (adjacent 375 m pixels).
# So the radius is one nominal I-band pixel (0.375 km): tight enough that a neighbouring pixel is
# rarely mistaken for the same one, and the pairing is one-to-one per satellite on top of that, so
# two pixels of the same satellite are never merged. 120 minutes spans one pass window of all
# three satellites; the next pass over the same spot is ~12 h later.
VIIRS_CROSS_SATELLITE_KM = 0.375
VIIRS_CROSS_SATELLITE_MINUTES = 120
# Group representative preference: Suomi-NPP first because the offline archive is Suomi-NPP only.
VIIRS_PLATFORM_PRIORITY = ("SNPP", "NOAA20", "NOAA21")

_PLATFORM_BY_SOURCE = {"VIIRS_SNPP_NRT": "SNPP", "VIIRS_NOAA20_NRT": "NOAA20", "VIIRS_NOAA21_NRT": "NOAA21"}
_PLATFORM_BY_SATELLITE = {"N": "SNPP", "NPP": "SNPP", "SNPP": "SNPP", "N20": "NOAA20", "1": "NOAA20", "J1": "NOAA20", "N21": "NOAA21", "2": "NOAA21", "J2": "NOAA21"}


def viirs_platform(detections: pd.DataFrame) -> pd.Series:
    """VIIRS platform per row ("SNPP" / "NOAA20" / "NOAA21"), None for MODIS or unknown.

    Uses the FIRMS feed id in `source` when present (live data), otherwise the `satellite` column
    (FIRMS codes N / N20 / N21 in NRT files, SNPP in the Suomi-NPP archive)."""
    platform = pd.Series([None] * len(detections), index=detections.index, dtype="object")
    is_viirs = detections["sensor"].astype(str).eq("VIIRS") if "sensor" in detections else pd.Series(False, index=detections.index)
    if "source" in detections:
        platform = detections["source"].astype(str).map(_PLATFORM_BY_SOURCE).astype("object")
    if "satellite" in detections:
        by_satellite = detections["satellite"].astype(str).str.strip().str.upper().map(_PLATFORM_BY_SATELLITE)
        platform = platform.where(platform.notna(), by_satellite)
    return platform.where(is_viirs, None)


def collapse_viirs_cross_satellite(
    detections: pd.DataFrame,
    radius_km: float = VIIRS_CROSS_SATELLITE_KM,
    time_minutes: float = VIIRS_CROSS_SATELLITE_MINUTES,
) -> pd.DataFrame:
    """Group VIIRS detections from DIFFERENT satellites that are most likely the same fire pixel.

    Returns one row per input row (positional, same order as ``detections.reset_index``) with:
    ``viirs_platform``, ``viirs_group`` (-1 for rows that are not VIIRS or have no known platform;
    otherwise the position of the group's representative), and ``viirs_primary`` (True for every
    row that should be counted: non-VIIRS rows, ungrouped VIIRS rows and each group's
    representative).

    Rule: candidate pairs are detections from two different platforms within ``radius_km`` and
    ``time_minutes``. Pairs are accepted greedily from the closest (distance, time difference,
    positions) upward, and only when the two groups being joined have no platform in common, so a
    group holds at most one detection per satellite. The result does not depend on row order
    beyond the position tie-break, and a single-satellite input is returned unchanged (no groups).
    The representative is the member on the highest-priority platform (S-NPP, then NOAA-20, then
    NOAA-21), earliest position on ties.
    """
    data = detections.reset_index(drop=True)
    n = len(data)
    result = pd.DataFrame({"viirs_platform": viirs_platform(data).to_numpy(), "viirs_group": np.full(n, -1, dtype=np.int64), "viirs_primary": np.ones(n, dtype=bool)})
    if n == 0:
        return result
    candidates = data[result["viirs_platform"].notna().to_numpy()].dropna(subset=["latitude", "longitude", "acq_datetime"])
    if candidates.empty or result.loc[candidates.index, "viirs_platform"].nunique() < 2:
        return result

    # Spatial bins at least `radius_km` wide in both directions (longitude degrees shrink with
    # latitude), so every pair within the radius sits in the same or an adjacent bin.
    max_abs_lat = float(np.abs(candidates.latitude).max())
    step = radius_km / 111.0 / max(np.cos(np.radians(min(max_abs_lat + 1.0, 89.0))), 1e-6)
    frame = pd.DataFrame(
        {
            "pos": candidates.index.to_numpy(),
            "lat": candidates.latitude.to_numpy(dtype="float64"),
            "lon": candidates.longitude.to_numpy(dtype="float64"),
            "t": pd.to_datetime(candidates.acq_datetime).to_numpy(dtype="datetime64[ns]").astype("int64"),
            "platform": result.loc[candidates.index, "viirs_platform"].to_numpy(),
        }
    )
    frame["lat_bin"] = np.floor(frame.lat / step).astype("int64")
    frame["lon_bin"] = np.floor(frame.lon / step).astype("int64")
    # Time bins as wide as the time window: any pair within it is in the same or an adjacent bin.
    frame["t_bin"] = np.floor_divide(frame.t, int(time_minutes * 6e10)).astype("int64")

    pairs = []
    right = frame.rename(columns={column: f"{column}_b" for column in frame.columns})
    keys = ["lat_bin_b", "lon_bin_b", "t_bin_b"]
    for lat_offset in (-1, 0, 1):
        for lon_offset in (-1, 0, 1):
            for t_offset in (-1, 0, 1):
                left = frame.assign(lat_bin_b=frame.lat_bin + lat_offset, lon_bin_b=frame.lon_bin + lon_offset, t_bin_b=frame.t_bin + t_offset)
                joined = left.merge(right, on=keys)
                joined = joined[(joined.pos < joined.pos_b) & (joined.platform != joined.platform_b)]
                if joined.empty:
                    continue
                minutes = np.abs(joined.t.to_numpy() - joined.t_b.to_numpy()) / 6e10
                joined = joined[minutes <= time_minutes].assign(minutes=minutes[minutes <= time_minutes])
                if joined.empty:
                    continue
                distance = haversine_km(joined.lat.to_numpy(), joined.lon.to_numpy(), joined.lat_b.to_numpy(), joined.lon_b.to_numpy())
                joined = joined.assign(km=distance)[distance <= radius_km]
                pairs.append(joined[["km", "minutes", "pos", "pos_b"]])
    if not pairs:
        return result
    edges = pd.concat(pairs).drop_duplicates(subset=["pos", "pos_b"]).sort_values(["km", "minutes", "pos", "pos_b"], kind="stable")

    parent: dict[int, int] = {}
    platforms: dict[int, set[str]] = {}
    platform_of = dict(zip(frame.pos, frame.platform))

    def root(position: int) -> int:
        parent.setdefault(position, position)
        while parent[position] != position:
            parent[position] = parent[parent[position]]
            position = parent[position]
        return position

    for a, b in zip(edges.pos.to_numpy(), edges.pos_b.to_numpy()):
        ra, rb = root(int(a)), root(int(b))
        if ra == rb:
            continue
        set_a = platforms.setdefault(ra, {platform_of[ra]})
        set_b = platforms.setdefault(rb, {platform_of[rb]})
        if set_a & set_b:
            continue
        keep, drop = (ra, rb) if ra < rb else (rb, ra)
        parent[drop] = keep
        platforms[keep] = set_a | set_b
        platforms.pop(drop, None)

    nodes = np.fromiter(parent.keys(), dtype=np.int64)
    roots = np.fromiter((root(int(p)) for p in nodes), dtype=np.int64, count=len(nodes))
    rank = {platform: index for index, platform in enumerate(VIIRS_PLATFORM_PRIORITY)}
    members = pd.DataFrame({"pos": nodes, "root": roots, "rank": [rank.get(platform_of[int(p)], len(rank)) for p in nodes]})
    members = members[members.groupby("root").pos.transform("size") >= 2]
    if members.empty:
        return result
    representative = members.sort_values(["root", "rank", "pos"]).drop_duplicates("root").set_index("root").pos
    member_rep = members.root.map(representative).to_numpy()
    group = result["viirs_group"].to_numpy().copy()
    primary = result["viirs_primary"].to_numpy().copy()
    group[members.pos.to_numpy()] = member_rep
    primary[members.pos.to_numpy()] = members.pos.to_numpy() == member_rep
    result["viirs_group"] = group
    result["viirs_primary"] = primary
    return result


def deduplicated_event_keys(events: pd.DataFrame, viirs_groups: pd.DataFrame) -> pd.Series:
    """One key per physical event after VIIRS cross-satellite grouping, aligned with `events`.

    `events` is build_harmonized_events() output (its `source_detection_ids` are positions into the
    same detections frame that `viirs_groups` was computed from). Events whose VIIRS member belongs
    to the same cross-satellite group get the same key ("v<group>"), e.g. a MATCHED MODIS+NOAA-20
    pair and the VIIRS_ONLY Suomi-NPP detection of that pixel. Everything else keeps its own key.
    Counting distinct keys gives the deduplicated event count without re-running MODIS matching,
    so the existing harmonized events (and everything computed from them) stay untouched."""
    group_of = viirs_groups["viirs_group"].to_numpy()
    keys = []
    for index, ids in enumerate(events["source_detection_ids"]):
        group = next((int(group_of[i]) for i in ids if 0 <= i < len(group_of) and group_of[i] >= 0), -1)
        keys.append(f"v{group}" if group >= 0 else f"e{index}")
    return pd.Series(keys, index=events.index)
