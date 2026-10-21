"""P0 before/after on ONE frozen live snapshot, with the same 24 h window and the same archive.

Steps are applied one at a time so each change's effect is visible:
  A  before P0: all VIIRS satellites, std valid from 2 days, NRT rows inside the baseline
  B  + reference population (MODIS + Suomi-NPP only, the archive's population)
  C  + minimum 10 archive days
  D  + NRT rows left out of the baseline              (= production after P0)
D is also recomputed through the production function compare_live_to_baseline() as a check.

Run from python-service/:
  .venv/bin/python -m ml_experiments.audit_2026_10.p0_before_after results/snapshot_2026-10-21T0239Z 2026-10-21T02:39
"""
import sys
import pandas as pd
from fire_pipeline import live
from fire_pipeline.historical import _read_table, compare_live_to_baseline, filter_frame_to_province

def _snapshot_csv(directory, source_id):
    """Snapshot files may be plain (.csv) or gzipped (.csv.gz, as committed in results/)."""
    import os
    plain = f"{directory}/{source_id}.csv"
    return plain if os.path.exists(plain) else plain + ".gz"


snap, now = sys.argv[1], pd.Timestamp(sys.argv[2])
frames = []
for sid, sensor in live.SOURCES:
    f = pd.read_csv(_snapshot_csv(snap, sid)); f["sensor"] = sensor; f["source"] = sid; f["source_file"] = sid; frames.append(f)
result = live.ensure_reference_counts(live.build_live_result(frames, [{"id": s, "available": True} for s, _ in live.SOURCES], window_hours=24, now=now))
areas = pd.DataFrame(result.areas)
areas["ref"] = [int((r or {}).get("SNPP", 0)) for r in areas.referenceEvents]
p = result.meta["processing"]
print(f"snapshot {now} UTC: {len(result.markers)} detections, {p['harmonizedEvents']} harmonized events -> {p['dedupedEvents']} after VIIRS cross-satellite dedup "
      f"({p['viirsCrossSatellite']['duplicates']} repeats in {p['viirsCrossSatellite']['groups']} groups); MODIS+S-NPP reference events: {int(areas.ref.sum())}")

archive = _read_table(live.default_historical_db_path())
archive["date"] = pd.to_datetime(archive.date)
era = archive[archive.date >= "2012-01-20"]

def stats(rows):
    return rows.groupby(["grid_lat", "grid_lon"]).detections.agg(mean="mean", std="std", n="count")

def run(name, count_col, min_days, exclude_nrt, province=None):
    rows = era[era.source != "nrt"] if exclude_nrt else era
    s = stats(rows)
    a = areas.rename(columns={"gridLat": "grid_lat", "gridLon": "grid_lon"})
    if province:
        a = filter_frame_to_province(a, province)
    a = a[a[count_col] > 0]
    j = a.join(s, on=["grid_lat", "grid_lon"], how="inner")
    usable = j[(j.n >= min_days) & j["std"].notna()]
    flag = usable[count_col] > usable["mean"] + 2 * usable["std"]
    return {"step": name, "liveCells": len(a), "compared": len(usable), "unusual": int(flag.sum()), "share": f"{flag.mean():.1%}" if len(usable) else "-",
            "excluded<min": int(len(j) - len(usable))}

steps = [("A before", "detections", 2, False), ("B +reference", "ref", 2, False), ("C +min10", "ref", 10, False), ("D +noNRT", "ref", 10, True)]
print(pd.DataFrame([run(*s) for s in steps]).to_string(index=False))
check = compare_live_to_baseline(result.areas, live.default_historical_db_path(), "SNPP")["summary"]
print("production compare_live_to_baseline (D):", check)
print("\nby province (A -> D, unusual/compared):")
for prov in ["Kalimantan Tengah", "Kalimantan Barat", "Kalimantan Selatan", "Kalimantan Timur", "Sumatera Selatan", "Riau", "Jambi", "Papua"]:
    a, d = run("A", "detections", 2, False, prov), run("D", "ref", 10, True, prov)
    print(f"  {prov:20s} {a['unusual']:4d}/{a['compared']:<4d} ({a['share']:>5s})  ->  {d['unusual']:4d}/{d['compared']:<4d} ({d['share']:>5s})")
