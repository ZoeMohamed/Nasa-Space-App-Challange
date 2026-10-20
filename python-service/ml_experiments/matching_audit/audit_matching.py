"""Permanent, isolated audit of MODIS-VIIRS matching parameters
(radius_km / time_minutes) in fire_pipeline/matching.py.

Calls fire_pipeline.clean / fire_pipeline.matching BY IMPORT ONLY -- never
edits them. This module has no effect on production: nothing in
fire_pipeline/, main.py, or the frontend imports from ml_experiments/.

Requires raw FIRMS CSV exports (MODIS + VIIRS archive, with the `type`
column) that are NOT included in this repo -- download your own from
https://firms.modaps.eosdis.nasa.gov/download/ and pass their paths via CLI
args. See README.md in this directory for exact commands and the results
from the run that produced the numbers cited in the Stage 2 matching audit
(2026-10-19).

Untrusted input: raw downloaded CSVs. Run with `python -I` per this repo's
sandbox convention for downloaded files.
"""

from __future__ import annotations

import argparse
import itertools
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

import numpy as np
import pandas as pd

from fire_pipeline.clean import add_quality_flags, deduplicate_detections, harmonize, high_confidence_mask
from fire_pipeline.matching import haversine_km, match_modis_viirs

# Same bbox as src/lib/filters.ts's two Kalimantan regions, combined into one box,
# for September 2019 -- a documented high-activity month (Stage 1 audit's yearly
# totals). This is a SAMPLE, not the whole archive: see README's Limitations.
DEFAULT_BBOX = {"min_lat": -4.5, "max_lat": 0.5, "min_lon": 110.5, "max_lon": 116.5}
DEFAULT_DATE_START, DEFAULT_DATE_END = "2019-09-01", "2019-09-30"


def load_filtered(modis_archive_path: str, viirs_archive_path: str, bbox: dict = DEFAULT_BBOX, date_start: str = DEFAULT_DATE_START, date_end: str = DEFAULT_DATE_END) -> pd.DataFrame:
    """Load + filter raw MODIS/VIIRS archive CSVs to one bbox+date window,
    through the SAME confidence/type/quality/dedup pipeline production uses
    (reused by import, not reimplemented) -- so this audit measures the
    actual candidate pool production would see, not a hypothetical one.
    """
    modis_cols = ["latitude", "longitude", "acq_date", "acq_time", "confidence", "frp", "satellite", "type"]
    modis = pd.read_csv(modis_archive_path, usecols=modis_cols)
    modis = modis[high_confidence_mask(modis)]
    modis = modis[modis["type"] == 0]
    modis["sensor"] = "MODIS"

    viirs_cols = ["latitude", "longitude", "acq_date", "acq_time", "confidence", "frp", "satellite", "type"]
    viirs = pd.read_csv(viirs_archive_path, usecols=viirs_cols)
    viirs = viirs[high_confidence_mask(viirs)]
    viirs = viirs[viirs["type"] == 0]
    viirs["sensor"] = "VIIRS"

    combined = pd.concat([modis, viirs], ignore_index=True, sort=False)
    combined = add_quality_flags(harmonize(combined))
    combined = combined[combined["quality_ok"]].reset_index(drop=True)
    combined = deduplicate_detections(combined)

    combined = combined[
        combined.latitude.between(bbox["min_lat"], bbox["max_lat"])
        & combined.longitude.between(bbox["min_lon"], bbox["max_lon"])
        & combined.acq_datetime.between(pd.Timestamp(date_start), pd.Timestamp(date_end) + pd.Timedelta(days=1))
    ].reset_index(drop=True)
    return combined


def nearest_cross_sensor_neighbor(df: pd.DataFrame, cap_km: float = 50.0, cap_minutes: float = 48 * 60) -> pd.DataFrame:
    """For every detection, the nearest OTHER-sensor detection within a
    generous cap (brute-force; fine at this filtered scale). One row per
    detection: its nearest cross-sensor distance_km/time_diff_min (NaN if
    none within the cap).
    """
    modis = df[df.sensor == "MODIS"].reset_index(drop=True)
    viirs = df[df.sensor == "VIIRS"].reset_index(drop=True)

    results = []
    for source_name, source, other in [("MODIS", modis, viirs), ("VIIRS", viirs, modis)]:
        other_lat = other.latitude.to_numpy()
        other_lon = other.longitude.to_numpy()
        other_time = other.acq_datetime.to_numpy()
        for row in source.itertuples():
            time_diff_min = np.abs((other_time - np.datetime64(row.acq_datetime)) / np.timedelta64(1, "m"))
            within_time = time_diff_min <= cap_minutes
            if not within_time.any():
                results.append({"sensor": source_name, "nearest_distance_km": np.nan, "nearest_time_diff_min": np.nan})
                continue
            distances = haversine_km(row.latitude, row.longitude, other_lat[within_time], other_lon[within_time])
            within_both = distances <= cap_km
            if not within_both.any():
                results.append({"sensor": source_name, "nearest_distance_km": np.nan, "nearest_time_diff_min": np.nan})
                continue
            best_idx = np.argmin(distances[within_both])
            results.append(
                {
                    "sensor": source_name,
                    "nearest_distance_km": float(distances[within_both][best_idx]),
                    "nearest_time_diff_min": float(time_diff_min[within_time][within_both][best_idx]),
                }
            )
    return pd.DataFrame(results)


def candidate_set(df: pd.DataFrame, modis_row, viirs_subset: pd.DataFrame, radius_km: float, time_minutes: float) -> pd.DataFrame:
    """All VIIRS rows within (radius_km, time_minutes) of one MODIS row."""
    time_diff_min = np.abs((viirs_subset.acq_datetime.to_numpy() - np.datetime64(modis_row.acq_datetime)) / np.timedelta64(1, "m"))
    within_time = time_diff_min <= time_minutes
    if not within_time.any():
        return viirs_subset.iloc[0:0]
    sub = viirs_subset[within_time].copy()
    sub["_time_diff_min"] = time_diff_min[within_time]
    distances = haversine_km(modis_row.latitude, modis_row.longitude, sub.latitude.to_numpy(), sub.longitude.to_numpy())
    sub["_distance_km"] = distances
    return sub[sub["_distance_km"] <= radius_km]


def ambiguity_spread(df: pd.DataFrame, radius_km: float, time_minutes: float) -> pd.DataFrame:
    """For every MODIS detection with >=2 VIIRS candidates within
    (radius_km, time_minutes): how far apart ARE those candidates from each
    other (max pairwise distance/time among the candidate set itself)?

    This is the geographic/temporal sensibility check requested after the
    first audit pass: a tight candidate cluster (small pairwise spread)
    likely represents one spread-out fire seen multiple times -- picking
    "nearest" barely matters. A wide spread means the candidates could be
    genuinely different fires, where the greedy pick has real consequences.
    """
    modis = df[df.sensor == "MODIS"].reset_index(drop=True)
    viirs = df[df.sensor == "VIIRS"].reset_index(drop=True)
    if viirs.empty or modis.empty:
        return pd.DataFrame(columns=["n_candidates", "max_pairwise_distance_km", "max_pairwise_time_diff_min"])

    rows = []
    for row in modis.itertuples():
        candidates = candidate_set(df, row, viirs, radius_km, time_minutes)
        if len(candidates) < 2:
            continue
        lat = candidates.latitude.to_numpy()
        lon = candidates.longitude.to_numpy()
        time = candidates.acq_datetime.to_numpy()
        max_dist = 0.0
        max_time = 0.0
        for i, j in itertools.combinations(range(len(candidates)), 2):
            d = float(haversine_km(lat[i], lon[i], lat[j], lon[j]))
            t = float(abs((time[i] - time[j]) / np.timedelta64(1, "m")))
            max_dist = max(max_dist, d)
            max_time = max(max_time, t)
        rows.append({"n_candidates": len(candidates), "max_pairwise_distance_km": max_dist, "max_pairwise_time_diff_min": max_time})
    return pd.DataFrame(rows)


def ambiguity_count(df: pd.DataFrame, radius_km: float, time_minutes: float) -> tuple[int, int]:
    modis = df[df.sensor == "MODIS"].reset_index(drop=True)
    viirs = df[df.sensor == "VIIRS"].reset_index(drop=True)
    if viirs.empty or modis.empty:
        return 0, len(modis)
    ambiguous = 0
    matched_at_least_one = 0
    for row in modis.itertuples():
        candidates = candidate_set(df, row, viirs, radius_km, time_minutes)
        if len(candidates) >= 1:
            matched_at_least_one += 1
        if len(candidates) >= 2:
            ambiguous += 1
    return ambiguous, matched_at_least_one


def frp_ratio_check(df: pd.DataFrame, radius_km: float, time_minutes: float) -> list[float]:
    matches = match_modis_viirs(df, radius_km=radius_km, time_minutes=time_minutes)
    matched = matches[matches.match_status == "MATCHED"]
    seen_pairs = set()
    ratios = []
    for _, row in matched.iterrows():
        pair_key = tuple(sorted([row.detection_id, row.matched_detection_id]))
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)
        a = df.loc[df.index == row.detection_id, "frp"]
        b = df.loc[df.index == row.matched_detection_id, "frp"]
        if len(a) and len(b) and float(b.iloc[0]) > 0:
            ratios.append(float(a.iloc[0]) / float(b.iloc[0]))
    return ratios


def run_full_audit(modis_archive_path: str, viirs_archive_path: str) -> str:
    """Runs the full audit (nearest-neighbor distribution, sensitivity
    sweep including 12h vs 24h, ambiguity spread check, FRP ratio check) and
    returns a formatted text report. Also used by main() to print + save.
    """
    lines = []
    df = load_filtered(modis_archive_path, viirs_archive_path)
    n_modis, n_viirs = int((df.sensor == "MODIS").sum()), int((df.sensor == "VIIRS").sum())
    lines.append(f"Total quality-filtered detections in window: {len(df)} (MODIS={n_modis}, VIIRS={n_viirs})")

    lines.append("\n=== Nearest cross-sensor neighbor distribution (cap 50km/48h) ===")
    nn = nearest_cross_sensor_neighbor(df)
    for sensor in ["MODIS", "VIIRS"]:
        sub = nn[(nn.sensor == sensor) & nn.nearest_distance_km.notna()]
        if len(sub) > 0:
            d = sub.nearest_distance_km.describe(percentiles=[0.25, 0.5, 0.75, 0.9])
            t = sub.nearest_time_diff_min.describe(percentiles=[0.25, 0.5, 0.75, 0.9])
            lines.append(
                f"{sensor} (n={len(sub)}): distance_km median={d['50%']:.2f} p75={d['75%']:.2f} p90={d['90%']:.2f} | "
                f"time_diff_min median={t['50%']:.0f} p75={t['75%']:.0f} p90={t['90%']:.0f}"
            )

    lines.append("\n=== Sensitivity sweep (distance x time) ===")
    lines.append(f"{'dist_km':>8} {'time_min':>9} {'matched_pairs':>14} {'pct_modis_matched':>18} {'ambiguous_modis':>16}")
    for d, t in itertools.product([1, 5, 10, 20], [60, 180, 360, 720]):
        matches = match_modis_viirs(df, radius_km=d, time_minutes=t)
        matched_pairs = int((matches.match_status == "MATCHED").sum()) // 2
        pct = 100 * matched_pairs / n_modis if n_modis else 0
        ambiguous, _ = ambiguity_count(df, d, t)
        lines.append(f"{d:>8} {t:>9} {matched_pairs:>14} {pct:>17.1f}% {ambiguous:>16}")

    lines.append("\n=== 12h vs 24h at current production radius (10km) ===")
    for t in [720, 1440]:
        matches = match_modis_viirs(df, radius_km=10, time_minutes=t)
        matched_pairs = int((matches.match_status == "MATCHED").sum()) // 2
        pct = 100 * matched_pairs / n_modis if n_modis else 0
        ambiguous, _ = ambiguity_count(df, 10, t)
        ratios = frp_ratio_check(df, 10, t)
        extreme = sum(1 for r in ratios if r > 10 or r < 0.1)
        lines.append(
            f"{t} min: {matched_pairs} pairs ({pct:.1f}% of MODIS), {ambiguous} ambiguous MODIS, "
            f"{len(ratios)} total pairs, {extreme} ({100*extreme/len(ratios) if ratios else 0:.1f}%) with >10x FRP ratio"
        )

    lines.append("\n=== Ambiguity spread: are competing candidates close together (same fire) or scattered (risky)? ===")
    lines.append("(at current production settings: 10km / 720min)")
    spread = ambiguity_spread(df, 10, 720)
    if not spread.empty:
        lines.append(f"MODIS detections with >=2 candidates: {len(spread)}")
        d = spread.max_pairwise_distance_km.describe(percentiles=[0.25, 0.5, 0.75, 0.9])
        t = spread.max_pairwise_time_diff_min.describe(percentiles=[0.25, 0.5, 0.75, 0.9])
        lines.append(f"  max pairwise distance among candidates (km): median={d['50%']:.2f} p75={d['75%']:.2f} p90={d['90%']:.2f} max={d['max']:.2f}")
        lines.append(f"  max pairwise time diff among candidates (min): median={t['50%']:.0f} p75={t['75%']:.0f} p90={t['90%']:.0f} max={t['max']:.0f}")
        tight = int((spread.max_pairwise_distance_km <= 2.0).sum())
        lines.append(f"  candidate sets where ALL candidates are within 2km of each other (likely same fire, low-risk ambiguity): {tight}/{len(spread)} ({100*tight/len(spread):.1f}%)")
        wide = int((spread.max_pairwise_distance_km > 10.0).sum())
        lines.append(f"  candidate sets with a pairwise spread >10km (candidates could plausibly be different fires -- higher-risk ambiguity): {wide}/{len(spread)} ({100*wide/len(spread):.1f}%)")
    else:
        lines.append("No MODIS detections with >=2 candidates at current settings in this window.")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("modis_archive", help="Path to a raw MODIS fire_archive_*.csv (not included in this repo)")
    parser.add_argument("viirs_archive", help="Path to a raw VIIRS fire_archive_*.csv (not included in this repo)")
    args = parser.parse_args()

    report = run_full_audit(args.modis_archive, args.viirs_archive)
    print(report)

    results_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
    os.makedirs(results_dir, exist_ok=True)
    out_path = os.path.join(results_dir, "latest.txt")
    with open(out_path, "w") as f:
        f.write(report + "\n")
    print(f"\nWrote report to {out_path}")


if __name__ == "__main__":
    main()
