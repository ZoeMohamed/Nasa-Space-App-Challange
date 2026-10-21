"""P1 before/after: all-months baseline (P0) vs seasonal baseline with labelled fallback (P1).

1) The frozen live snapshot, through the production function compare_live_to_baseline().
2) Rolling-origin 2016-2025 on the archive with the exact production rules: seasonal = same
   month +-1 in earlier years with >= 10 days from >= 3 years, else all-months >= 10 days, else
   insufficient. Training for test year Y uses archive rows from 2012-01-20 to the end of Y-1.

Run from python-service/:
  .venv/bin/python -m ml_experiments.audit_2026_10.p1_seasonal_measure results/snapshot_2026-10-21T0239Z 2026-10-21T02:39
"""
import os
import sys

import numpy as np
import pandas as pd

from fire_pipeline import live
from fire_pipeline.historical import MIN_BASELINE_SAMPLE_DAYS, MIN_SEASONAL_YEARS, _read_table, compare_live_to_baseline, seasonal_months

snap, now = sys.argv[1], pd.Timestamp(sys.argv[2])
frames = []
for sid, sensor in live.SOURCES:
    path = f"{snap}/{sid}.csv"
    f = pd.read_csv(path if os.path.exists(path) else path + ".gz")
    f["sensor"], f["source"], f["source_file"] = sensor, sid, sid
    frames.append(f)
result = live.ensure_reference_counts(live.build_live_result(frames, [{"id": s, "available": True} for s, _ in live.SOURCES], window_hours=24, now=now))
db = live.default_historical_db_path()
before = compare_live_to_baseline(result.areas, db, "SNPP")["summary"]
after = compare_live_to_baseline(result.areas, db, "SNPP", month=now.month)["summary"]
print(f"== live snapshot {now} UTC (month {now.month}, seasonal window {seasonal_months(now.month)}) ==")
for name, s in (("P0 all-months", before), ("P1 seasonal  ", after)):
    print(f"{name}: unusual {s['unusualCells']}/{s['comparedCells']} = {s['unusualCells']/s['comparedCells']:.1%}; insufficient {s['insufficientHistoryCells']}; "
          f"seasonal {s.get('seasonalBaselineCells', 0)}, fallback {s.get('fallbackBaselineCells', 0)}")

# --- rolling origin on the archive ---
a = _read_table(db)
a["date"] = pd.to_datetime(a.date)
a = a[(a.date >= "2012-01-20") & (a.source != "nrt")].assign(year=lambda f: f.date.dt.year, month=lambda f: f.date.dt.month)
parts = []
for Y in range(2016, 2026):
    train, test = a[a.year < Y], a[a.year == Y]
    allm = train.groupby("area_id").detections.agg(a_mean="mean", a_std="std", a_n="size")
    t = test.join(allm, on="area_id")
    for m in range(1, 13):
        w = train[train.month.isin(seasonal_months(m))].groupby("area_id").agg(s_mean=("detections", "mean"), s_std=("detections", "std"), s_n=("detections", "size"), s_y=("year", "nunique"))
        idx = t.month == m
        t.loc[idx, ["s_mean", "s_std", "s_n", "s_y"]] = t.loc[idx, ["area_id"]].join(w, on="area_id")[["s_mean", "s_std", "s_n", "s_y"]].to_numpy()
    parts.append(t)
t = pd.concat(parts)
p0_ok = t.a_n >= MIN_BASELINE_SAMPLE_DAYS
t["p0"] = p0_ok & (t.detections > t.a_mean + 2 * t.a_std)
seasonal_ok = (t.s_n >= MIN_BASELINE_SAMPLE_DAYS) & (t.s_y >= MIN_SEASONAL_YEARS)
mean = np.where(seasonal_ok, t.s_mean, t.a_mean)
std = np.where(seasonal_ok, t.s_std, t.a_std)
p1_ok = seasonal_ok | p0_ok
t["p1"] = p1_ok & (t.detections > mean + 2 * std)
print(f"\n== rolling-origin 2016-2025, {len(t)} active cell-days ==")
print(f"P0 compared {p0_ok.mean():.2%}, flag rate {t.p0.sum()/p0_ok.sum():.2%}")
print(f"P1 compared {p1_ok.mean():.2%} (seasonal {seasonal_ok.mean():.2%}, fallback {(p1_ok & ~seasonal_ok).mean():.2%}), flag rate {t.p1.sum()/p1_ok.sum():.2%}")
both = p0_ok & p1_ok
p1v, p2v = t.p0[both].mean(), t.p1[both].mean(); po = (t.p0[both] == t.p1[both]).mean(); pe = p1v * p2v + (1 - p1v) * (1 - p2v)
print(f"agreement {po:.2%}, chance {pe:.2%}, Cohen kappa {(po - pe) / (1 - pe):.3f}")
aso = t.month.isin([8, 9, 10])
print(f"Aug-Oct share of flags: P0 {t[aso].p0.sum()/t.p0.sum():.1%}, P1 {t[aso].p1.sum()/t.p1.sum():.1%}; share of active cell-days {aso.mean():.1%}")
by = t.groupby("month").agg(cell_days=("detections", "size"), p0=("p0", "sum"), p1=("p1", "sum"))
by["p0_rate"] = (by.p0 / by.cell_days).round(4); by["p1_rate"] = (by.p1 / by.cell_days).round(4)
print(by.to_string())
yr = t.groupby("year").agg(events=("detections", "sum"), p0=("p0", "mean"), p1=("p1", "mean")).round(4)
print(yr.to_string())
rank = lambda c: yr[c].rank()
print("Spearman(yearly events, flag rate): P0", round(rank("events").corr(rank("p0")), 2), " P1", round(rank("events").corr(rank("p1")), 2))
