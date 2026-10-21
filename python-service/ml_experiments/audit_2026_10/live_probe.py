"""Measure how the live 24h snapshot compares with the archive's per-cell daily baseline, per VIIRS
satellite subset. Needs NASA_FIRMS_MAP_KEY (env or ../.env.local) and network access; numbers change
with every FIRMS update, so the audit README records the run it quotes (2026-10-21 ~02:10 UTC).
Run from python-service/: .venv/bin/python -m ml_experiments.audit_2026_10.live_probe"""
import os, sys
sys.path.insert(0, os.getcwd())
if not os.getenv("NASA_FIRMS_MAP_KEY") and os.path.exists("../.env.local"):
    for line in open("../.env.local"):
        if line.startswith("NASA_FIRMS_MAP_KEY="):
            os.environ["NASA_FIRMS_MAP_KEY"] = line.split("=", 1)[1].strip()
import numpy as np, pandas as pd
from fire_pipeline import live
from fire_pipeline.historical import load_calendar_summary
from fire_pipeline.matching import haversine_km
key = os.environ["NASA_FIRMS_MAP_KEY"]
frames = {}
for sid, sensor in live.SOURCES:
    for attempt in range(4):
        try:
            f, s = live._fetch_source(key, sid, sensor); frames[sid] = f; print(sid, s.get("usableConfidenceCount"), "usable"); break
        except Exception as e:
            print(sid, "attempt", attempt, "unavailable:", e)
cells = pd.DataFrame(load_calendar_summary(live.default_historical_db_path())["cells"])
cells = cells[cells.dailyStdDetections.notna()].rename(columns={"gridLat":"grid_lat","gridLon":"grid_lon"}).set_index(["grid_lat","grid_lon"])
# reach the areas dataframe used by summarize: rebuild minimal path
from fire_pipeline.clean import add_quality_flags, harmonize, confidence_tier, deduplicate_detections
from fire_pipeline.matching import match_modis_viirs
from fire_pipeline.harmonize_events import build_harmonized_events
from fire_pipeline.features import aggregate_grid
def per_cell(subset):
    det = add_quality_flags(harmonize(pd.concat([frames[s] for s in subset if s in frames], ignore_index=True)))
    det = det[det.quality_ok]
    det = det[confidence_tier(det, "confidence_raw").ne("low")]
    cutoff = pd.Timestamp.now(tz="UTC").tz_localize(None) - pd.Timedelta(hours=24)
    det = deduplicate_detections(det[det.acq_datetime >= cutoff]).reset_index(drop=True)
    ev = build_harmonized_events(det, match_modis_viirs(det))
    g = aggregate_grid(ev)
    return det, g
scen=[("ALL available (production)", list(frames))]+[(f"MODIS + {v} only", ["MODIS_NRT", v]) for v in ["VIIRS_SNPP_NRT","VIIRS_NOAA20_NRT","VIIRS_NOAA21_NRT"] if v in frames]
for name, subset in scen:
    det, g = per_cell(subset)
    g = g.set_index(["grid_lat","grid_lon"])
    j = g.join(cells, how="inner")
    flag = j.detections > j.dailyMeanDetections + 2*j.dailyStdDetections
    dates = det.acq_datetime.dt.date.nunique()
    print(f"\n{name}: events={int(g.detections.sum())} cells={len(g)} with-baseline={len(j)} unusual={int(flag.sum())} ({flag.mean():.1%})  utc-dates-in-window={dates}")
    print("   median live count / baseline mean:", round(float((j.detections/j.dailyMeanDetections).median()),2))
# VIIRS-VIIRS near-duplicates: N20 detections with an N21 detection within 1 km and 12 h
vs=[v for v in ["VIIRS_SNPP_NRT","VIIRS_NOAA20_NRT","VIIRS_NOAA21_NRT"] if v in frames]
if len(vs)>=2:
    print("pair:", vs[0], vs[1])
    a = harmonize(frames[vs[0]]); b = harmonize(frames[vs[1]])
    cutoff = pd.Timestamp.now(tz="UTC").tz_localize(None) - pd.Timedelta(hours=24)
    a = a[a.acq_datetime>=cutoff]; b = b[b.acq_datetime>=cutoff]
    bl = b.latitude.to_numpy(); bo = b.longitude.to_numpy(); bt = b.acq_datetime.to_numpy()
    order = np.argsort(bl); bl, bo, bt = bl[order], bo[order], bt[order]
    hits = 0
    for la, lo, t in zip(a.latitude, a.longitude, a.acq_datetime.to_numpy()):
        i0, i1 = np.searchsorted(bl, la-0.01), np.searchsorted(bl, la+0.01)
        if i1>i0:
            d = haversine_km(la, lo, bl[i0:i1], bo[i0:i1]); dt = np.abs((bt[i0:i1]-t).astype("timedelta64[m]").astype(int))
            if ((d<=1.0)&(dt<=720)).any(): hits += 1
    print(f"\n{vs[0]} detections with a {vs[1]} detection <=1 km & <=12 h: {hits}/{len(a)} ({hits/len(a):.1%}) -- counted as separate events today")
