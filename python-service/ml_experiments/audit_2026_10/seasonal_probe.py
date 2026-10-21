"""Rolling-origin probe (VIIRS era, archive rows only): does the production per-cell all-months
baseline mostly flag 'fire season'? Compare with a per-cell seasonal (month +-1) baseline.
Run: .venv/bin/python -m ml_experiments.audit_2026_10.seasonal_probe data/historical.sqlite
Training for test year Y uses only dates in [2012-01-20, Y-01-01). No zero-filling: like production,
both baselines are conditional on 'a cell-day with >=1 recorded detection'."""
import sqlite3, sys
import numpy as np, pandas as pd
df = pd.read_sql_query("select date, area_id, detections, source from daily_area_activity", sqlite3.connect(sys.argv[1]))
df["date"] = pd.to_datetime(df.date); df = df[(df.date >= "2012-01-20") & (df.source == "archive")]
df["year"] = df.date.dt.year; df["month"] = df.date.dt.month
Z = 2.0
rows = []
for Y in range(2016, 2026):
    train = df[df.year < Y]; test = df[df.year == Y]
    a = train.groupby("area_id").detections.agg(a_mean="mean", a_std="std", a_n="size")
    # seasonal: for each test month m, training cell-days in months m-1, m, m+1 (circular)
    parts = []
    for m in range(1, 13):
        win = {((m - 2) % 12) + 1, m, (m % 12) + 1}
        s = train[train.month.isin(win)].groupby("area_id").detections.agg(s_mean="mean", s_std="std", s_n="size")
        s["s_years"] = train[train.month.isin(win)].groupby("area_id").year.nunique()
        s["month"] = m; parts.append(s.reset_index())
    seas = pd.concat(parts)
    t = test.merge(a, on="area_id", how="left").merge(seas, on=["area_id", "month"], how="left")
    t["Y"] = Y
    rows.append(t)
t = pd.concat(rows, ignore_index=True)
t["a_ok"] = t.a_n >= 2
t["a_flag"] = t.a_ok & (t.detections > t.a_mean + Z * t.a_std)
t["s_ok"] = (t.s_n >= 10) & (t.s_years >= 3)
t["s_flag"] = t.s_ok & (t.detections > t.s_mean + Z * t.s_std)
print("test cell-days:", len(t), "years 2016-2025")
print("production baseline available (n>=2):", round(t.a_ok.mean(), 3), "| with n>=10:", round((t.a_n >= 10).mean(), 3))
print("seasonal baseline available (>=10 days, >=3 yrs in month+-1):", round(t.s_ok.mean(), 3))
both = t[t.a_ok & t.s_ok]
p1, p2 = both.a_flag.mean(), both.s_flag.mean(); po = (both.a_flag == both.s_flag).mean()
pe = p1 * p2 + (1 - p1) * (1 - p2); kappa = (po - pe) / (1 - pe)
print(f"\non cell-days where both are available (n={len(both)}): prod flag {p1:.3%}, seasonal flag {p2:.3%}, raw agreement {po:.3%}, chance agreement {pe:.3%}, Cohen kappa {kappa:.3f}")
by_m = t.groupby("month").agg(cell_days=("detections", "size"), prod_flags=("a_flag", "sum"), seas_flags=("s_flag", "sum"))
by_m["prod_share_of_flags"] = (by_m.prod_flags / by_m.prod_flags.sum()).round(3)
by_m["seas_share_of_flags"] = (by_m.seas_flags / by_m.seas_flags.sum()).round(3)
by_m["share_of_cell_days"] = (by_m.cell_days / by_m.cell_days.sum()).round(3)
by_m["prod_rate"] = (by_m.prod_flags / by_m.cell_days).round(3)
by_m["seas_rate"] = (by_m.seas_flags / by_m.cell_days).round(3)
print("\n== flags by calendar month =="); print(by_m.to_string())
aso = t.month.isin([8, 9, 10])
print(f"\nAug-Oct share of prod flags: {t[aso].a_flag.sum()/t.a_flag.sum():.1%}; of seasonal flags: {t[aso].s_flag.sum()/t.s_flag.sum():.1%}; of all cell-days: {aso.mean():.1%}")
by_y = t.groupby("Y").agg(prod_rate=("a_flag", "mean"), seas_rate=("s_flag", "mean"), events=("detections", "sum")).round(3)
print("\n== by test year =="); print(by_y.to_string())
rank = lambda col: by_y[col].rank()
print("Spearman(yearly events, prod rate):", round(rank("events").corr(rank("prod_rate")), 2), " seasonal:", round(rank("events").corr(rank("seas_rate")), 2))
