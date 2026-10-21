"""Feasibility probe for 'will this grid cell still show satellite-detected activity in the next 7 days?'
Population: (cell, issue day t) where the cell had >=1 recorded event in [t-6, t]; issue days weekly.
Label: >=1 recorded event in [t+1, t+7]. Labels are satellite DETECTIONS, not confirmed fires.
Zeros: a day with no row for a cell is treated as 0 events ONLY on days the archive has rows nationally
(sensors operating); issue dates whose [t-30, t+7] window touches a nationally empty day are dropped.
Archive rows only (NRT 2026 lacks the type==0 filter). VIIRS = Suomi-NPP only (as in the archive).
Rolling-origin by year: train on issue dates < Jan 1 of Y (and whose label window ends before it), test on Y.
Needs scikit-learn (ml_experiments/audit_2026_10/requirements.txt), which production does not use.
Run: <venv with sklearn>/bin/python -m ml_experiments.audit_2026_10.forecast_probe data/historical.sqlite"""
import sqlite3, sys, time
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier, IsolationForest
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
SEED = 20261021
t0 = time.time()
df = pd.read_sql_query("select date, area_id, grid_lat, grid_lon, detections, frp_sum, source from daily_area_activity", sqlite3.connect(sys.argv[1]))
df["date"] = pd.to_datetime(df.date)
df = df[(df.date >= "2012-01-20") & (df.source == "archive")]
days = pd.date_range(df.date.min(), df.date.max()); D = len(days)
cells = df[["area_id", "grid_lat", "grid_lon"]].drop_duplicates("area_id").reset_index(drop=True); C = len(cells)
ci = pd.Series(np.arange(C), index=cells.area_id); di = pd.Series(np.arange(D), index=days)
E = np.zeros((C, D), np.float32); F = np.zeros((C, D), np.float32)
r, c = ci[df.area_id].to_numpy(), di[df.date].to_numpy()
E[r, c] = df.detections.to_numpy(); F[r, c] = df.frp_sum.to_numpy()
national_empty = (E.sum(0) == 0)
print(f"cells={C} days={D} nationally-empty days={int(national_empty.sum())} load {time.time()-t0:.0f}s")
cumE = np.concatenate([np.zeros((C, 1), np.float32), E.cumsum(1)], 1)
cumA = np.concatenate([np.zeros((C, 1), np.float32), (E > 0).cumsum(1, dtype=np.float32)], 1)
cumF = np.concatenate([np.zeros((C, 1), np.float32), F.cumsum(1)], 1)
cumNE = np.concatenate([[0], national_empty.cumsum()])
def wsum(cum, d, k):  # sum over days [d-k+1, d]
    return cum[:, d + 1] - cum[:, max(d - k + 1, 0)]
idx = np.arange(D)
last_active = np.where(E > 0, idx, -1); last_active = np.maximum.accumulate(last_active, axis=1)
# climatology: per cell x (year, month) active days; prior-years-only fraction looked up at issue time
months = days.month.to_numpy(); years = days.year.to_numpy()
ym = pd.DataFrame({"y": years, "m": months})
act = pd.DataFrame((E > 0).T.astype(np.int16)); act["y"] = years; act["m"] = months
ym_act = act.groupby(["y", "m"]).sum()  # rows (y,m), cols cells
ym_days = ym.groupby(["y", "m"]).size()
lat_i = np.round((cells.grid_lat - cells.grid_lat.min()) / 0.25).astype(int).to_numpy()
lon_i = np.round((cells.grid_lon - cells.grid_lon.min()) / 0.25).astype(int).to_numpy()
G = np.zeros((lat_i.max() + 3, lon_i.max() + 3), np.float32)
rows = []
issue_days = [d for d in range(31, D - 8, 7)]
for d in issue_days:
    if cumNE[d + 8] - cumNE[d - 30] > 0:
        continue
    e7 = wsum(cumE, d, 7); pop = np.nonzero(e7 > 0)[0]
    if len(pop) == 0: continue
    y, m = years[d], months[d]
    prior = ym_act.loc[(ym_act.index.get_level_values(0) < y) & (ym_act.index.get_level_values(1) == m)]
    pdays = ym_days.loc[(ym_days.index.get_level_values(0) < y) & (ym_days.index.get_level_values(1) == m)].sum()
    clim = (prior.sum(0).to_numpy() / pdays) if pdays > 0 else np.full(C, np.nan, dtype=float)
    G[:] = 0; G[lat_i + 1, lon_i + 1] = e7
    nb = sum(G[1 + dy: G.shape[0] - 1 + dy, 1 + dx: G.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    nb7 = nb[lat_i, lon_i] - e7
    fut = cumE[:, d + 8] - cumE[:, d + 1]
    doy = days[d].dayofyear
    rows.append(pd.DataFrame({
        "day": d, "year": y, "cell": pop,
        "e1": wsum(cumE, d, 1)[pop], "e3": wsum(cumE, d, 3)[pop], "e7": e7[pop], "e30": wsum(cumE, d, 30)[pop],
        "a7": wsum(cumA, d, 7)[pop], "a30": wsum(cumA, d, 30)[pop], "f7": wsum(cumF, d, 7)[pop],
        "since": (d - last_active[pop, d]).astype(np.float32), "clim": clim[pop], "nb7": nb7[pop],
        "nat7": float(wsum(cumE, d, 7).sum()), "doy_s": np.sin(2 * np.pi * doy / 365.25), "doy_c": np.cos(2 * np.pi * doy / 365.25),
        "y_any": (fut[pop] > 0).astype(int), "y_5": (fut[pop] >= 5).astype(int),
    }))
X = pd.concat(rows, ignore_index=True)
print(f"samples={len(X)} issue dates={X.day.nunique()} base rate any={X.y_any.mean():.3f} >=5={X.y_5.mean():.3f} build {time.time()-t0:.0f}s")
FEATS = ["e1", "e3", "e7", "e30", "a7", "a30", "f7", "since", "clim", "nb7", "nat7", "doy_s", "doy_c"]
for f in ["e1", "e3", "e7", "e30", "f7", "nb7", "nat7"]: X[f + "_l"] = np.log1p(X[f])
LF = [f + "_l" if f in ["e1", "e3", "e7", "e30", "f7", "nb7", "nat7"] else f for f in FEATS]
def topk_precision(sub, score, k=50):
    out = []
    for _, g in sub.assign(s=score).groupby("day"):
        out.append(g.nlargest(min(k, len(g)), "s")[TARGET].mean())
    return float(np.mean(out))
for TARGET in ["y_any", "y_5"]:
    print(f"\n######## target {TARGET}")
    res = []
    for Y in range(2018, 2026):
        tr = X[(X.year < Y) & (X.day + 7 < di[pd.Timestamp(f"{Y}-01-01")])]
        te = X[X.year == Y]
        ytr, yte = tr[TARGET], te[TARGET]
        clim_fill = tr.clim.median()
        scores = {
            "persistence a7 (rule)": te.a7 + 1e-3 * te.e7,
            "recency (rule)": -te.since + 1e-3 * te.e7,
            "climatology (rule)": te.clim.fillna(clim_fill),
        }
        lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(tr[LF].fillna(clim_fill), ytr)
        scores["logistic"] = lr.predict_proba(te[LF].fillna(clim_fill))[:, 1]
        gb = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, random_state=SEED).fit(tr[FEATS], ytr)
        scores["gradient boosting"] = gb.predict_proba(te[FEATS])[:, 1]
        for name, s in scores.items():
            s = np.asarray(s, float)
            row = {"Y": Y, "model": name, "n": len(te), "base": yte.mean(), "auc": roc_auc_score(yte, s), "ap": average_precision_score(yte, s), "p@50": topk_precision(te, s)}
            if name in ("logistic", "gradient boosting"): row["brier"] = brier_score_loss(yte, s)
            res.append(row)
    R = pd.DataFrame(res)
    print(R.groupby("model")[["auc", "ap", "p@50", "brier"]].mean().round(3).sort_values("ap").to_string())
    print("base rate (mean over test years):", round(R.groupby("Y").base.first().mean(), 3))
    w = R.pivot(index="Y", columns="model", values="ap").round(3); print(w.to_string())
# Isolation Forest on the same feature set (unsupervised): what does its score track?
sample = X[X.year < 2020].sample(50000, random_state=SEED)
iso = IsolationForest(n_estimators=200, random_state=SEED).fit(sample[LF].fillna(0))
te = X[X.year >= 2020]; iso_score = -iso.score_samples(te[LF].fillna(0))
rk = lambda a: pd.Series(a).rank().to_numpy()
print("\nIsolation Forest anomaly score, Spearman with e7:", round(np.corrcoef(rk(iso_score), rk(te.e7))[0, 1], 2),
      " with f7:", round(np.corrcoef(rk(iso_score), rk(te.f7))[0, 1], 2), " with nat7:", round(np.corrcoef(rk(iso_score), rk(te.nat7))[0, 1], 2),
      " | AUC for y_any:", round(roc_auc_score(te.y_any, iso_score), 3), "(not its purpose; shown only to show it is not a forecaster)")
print(f"total {time.time()-t0:.0f}s")
