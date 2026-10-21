"""Flag rate and flags per calendar month of the production per-cell daily baseline, before
(std from 2 days) and after (10-day minimum) P0. Rolling-origin: test year Y (2016-2025, archive
rows) uses a baseline from VIIRS-era archive rows before Jan 1 of Y. NRT rows (2026 only) are
outside every test year here, so this isolates the minimum-history change.
Run: .venv/bin/python -m ml_experiments.audit_2026_10.p0_monthly_flags data/historical.sqlite"""
import sqlite3, sys
import pandas as pd
df = pd.read_sql_query("select date, area_id, detections, source from daily_area_activity", sqlite3.connect(sys.argv[1]))
df["date"] = pd.to_datetime(df.date); df = df[(df.date >= "2012-01-20") & (df.source != "nrt")]
df["year"] = df.date.dt.year; df["month"] = df.date.dt.month
parts = []
for Y in range(2016, 2026):
    s = df[df.year < Y].groupby("area_id").detections.agg(mean="mean", std="std", n="size")
    parts.append(df[df.year == Y].join(s, on="area_id"))
t = pd.concat(parts)
for name, k in [("before (n>=2)", 2), ("after (n>=10)", 10)]:
    ok = (t.n >= k) & t["std"].notna()
    t[name] = ok & (t.detections > t["mean"] + 2 * t["std"])
    t[name + " ok"] = ok
print(f"test cell-days {len(t)}")
for name in ["before (n>=2)", "after (n>=10)"]:
    ok = t[name + " ok"]
    print(f"{name}: compared {ok.mean():.2%} of active cell-days, flagged {t[name].sum()} = {t[name].sum()/ok.sum():.2%} of compared; "
          f"Aug-Oct share of flags {t[t.month.isin([8,9,10])][name].sum()/t[name].sum():.1%}")
m = t.groupby("month").agg(cell_days=("detections", "size"), before=("before (n>=2)", "sum"), after=("after (n>=10)", "sum"))
m["before_rate"] = (m.before / m.cell_days).round(4); m["after_rate"] = (m.after / m.cell_days).round(4)
print(m.to_string())
print(f"share of all active cell-days in Aug-Oct: {t.month.isin([8,9,10]).mean():.1%}")
