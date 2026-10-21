"""Dataset-quality measurements for historical.sqlite quoted in audit_2026_10/README.md.\nRun from python-service/: .venv/bin/python -m ml_experiments.audit_2026_10.measure_archive data/historical.sqlite"""
import sqlite3, sys
import numpy as np, pandas as pd
db = sys.argv[1]
c = sqlite3.connect(db)
df = pd.read_sql_query("select * from daily_area_activity", c)
df["date"] = pd.to_datetime(df.date); df["year"]=df.date.dt.year; df["month"]=df.date.dt.month
pd.set_option("display.width", 200)
y = df.groupby("year").agg(rows=("detections","size"), events=("detections","sum"), modis=("modis_detections","sum"), viirs=("viirs_detections","sum"), cells=("area_id","nunique"), days=("date","nunique"))
y["matched_pairs"] = y.modis + y.viirs - y.events
y["modis_matched_share"] = (y.matched_pairs / y.modis).round(3)
y["viirs_matched_share"] = (y.matched_pairs / y.viirs.replace(0,np.nan)).round(3)
print("== per year =="); print(y.to_string())
# calendar days with no row at all, by year
alldays = pd.date_range(df.date.min(), df.date.max())
present = set(df.date.unique())
missing = pd.Series([d for d in alldays if d not in present])
print("\n== calendar days with zero rows nationally ==", len(missing), "of", len(alldays))
print(missing.dt.year.value_counts().sort_index().to_string())
# MODIS-only days and VIIRS-only days in VIIRS era
d = df.groupby("date")[["modis_detections","viirs_detections"]].sum()
ve = d[d.index >= "2012-01-20"]
print("\nVIIRS era days:", len(ve), " days with 0 VIIRS:", int((ve.viirs_detections==0).sum()), " days with 0 MODIS:", int((ve.modis_detections==0).sum()))
first_viirs = d[d.viirs_detections>0].index.min(); print("first VIIRS day:", first_viirs.date())
# per-cell sample sizes in VIIRS era
v = df[df.date >= "2012-01-20"]
per_cell = v.groupby("area_id").size()
print("\n== VIIRS-era per-cell observed days ==")
print(per_cell.describe(percentiles=[.1,.25,.5,.75,.9]).round(1).to_string())
for t in [2,10,30,100]: print(f"cells with <{t} days:", int((per_cell<t).sum()), "of", len(per_cell))
# cell x calendar-month: distinct years with any activity
cm = v.groupby(["area_id","month"]).year.nunique()
print("\n== cell x month: distinct VIIRS-era years with >=1 detection ==")
print(cm.describe(percentiles=[.25,.5,.75,.9]).round(2).to_string())
print("share of (cell,month) with >=5 years:", round((cm>=5).mean(),3))
# detections distribution
print("\n== detections per cell-day (VIIRS era) ==")
print(v.detections.describe(percentiles=[.5,.75,.9,.95,.99,.999]).round(1).to_string())
print("share of cell-days with detections==1:", round((v.detections==1).mean(),3))
print("\n== frp_sum per cell-day (VIIRS era) ==")
print(v.frp_sum.describe(percentiles=[.5,.9,.99]).round(1).to_string())
# seasonality: share of events by month (VIIRS era)
ms = v.groupby("month").detections.sum(); print("\n== VIIRS-era monthly share of events =="); print((ms/ms.sum()).round(3).to_string())
# archive vs nrt shift: Jul-Sep 2026 (nrt) vs Jul-Sep of 2023-2025 (archive)
q = v[v.month.isin([7,8,9])].groupby(["year","source"]).agg(events=("detections","sum"), rows=("detections","size"), mean_det=("detections","mean"), frp_med=("frp_sum","median")).round(2)
print("\n== Jul-Sep by year/source =="); print(q.tail(8).to_string())
# Persistence/lag availability: fraction of cell-days whose cell had a row the previous day
v2 = v.sort_values(["area_id","date"]).copy()
v2["prev_gap"] = v2.groupby("area_id").date.diff().dt.days
print("\nshare of cell-days whose cell also had a row on the previous day:", round((v2.prev_gap==1).mean(),3))
