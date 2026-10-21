"""How close are VIIRS detections of (probably) the same fire seen by different satellites, versus
neighbouring pixels seen by the SAME satellite? Used to choose the cross-satellite merge rule in
fire_pipeline/harmonize_events.py (collapse_viirs_cross_satellite).

Input: a frozen FIRMS snapshot directory with VIIRS_SNPP_NRT.csv / VIIRS_NOAA20_NRT.csv /
VIIRS_NOAA21_NRT.csv (raw API CSVs) and the snapshot's UTC time for the 24 h cutoff.
Run from python-service/:
  .venv/bin/python -m ml_experiments.audit_2026_10.viirs_cross_satellite_probe results/snapshot_2026-10-21T0239Z 2026-10-21T02:39
"""
import sys
import numpy as np, pandas as pd
from fire_pipeline.clean import add_quality_flags, confidence_tier, harmonize
from fire_pipeline.matching import haversine_km

def _snapshot_csv(directory, source_id):
    """Snapshot files may be plain (.csv) or gzipped (.csv.gz, as committed in results/)."""
    import os
    plain = f"{directory}/{source_id}.csv"
    return plain if os.path.exists(plain) else plain + ".gz"


snap, now = sys.argv[1], pd.Timestamp(sys.argv[2])
def load(sid):
    f = pd.read_csv(_snapshot_csv(snap, sid)); f["sensor"] = "VIIRS"; f["source"] = sid
    d = add_quality_flags(harmonize(f)); d = d[d.quality_ok]
    d = d[confidence_tier(d, "confidence_raw").ne("low")]
    return d[d.acq_datetime >= now - pd.Timedelta(hours=24)].reset_index(drop=True)
sats = {s: load(s) for s in ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"]}
for s, d in sats.items(): print(s, len(d), "nominal+high rows in 24 h; overpass hours UTC:", sorted(d.acq_datetime.dt.hour.unique().tolist()))

def nearest(a, b, same=False, max_deg=0.05):
    """For each row of a: (distance km, |time diff| min) to the nearest row of b (excluding itself if same)."""
    order = np.argsort(b.latitude.to_numpy()); bl = b.latitude.to_numpy()[order]; bo = b.longitude.to_numpy()[order]
    bt = b.acq_datetime.to_numpy()[order]
    out_d, out_t = [], []
    for i, (la, lo, t) in enumerate(zip(a.latitude.to_numpy(), a.longitude.to_numpy(), a.acq_datetime.to_numpy())):
        i0, i1 = np.searchsorted(bl, la - max_deg), np.searchsorted(bl, la + max_deg)
        if i1 <= i0: out_d.append(np.nan); out_t.append(np.nan); continue
        d = haversine_km(la, lo, bl[i0:i1], bo[i0:i1]); dt = np.abs((bt[i0:i1] - t) / np.timedelta64(1, "m"))
        if same: d = np.where(d == 0, np.inf, d)  # skip the row itself
        k = int(np.argmin(d)); out_d.append(d[k] if np.isfinite(d[k]) else np.nan); out_t.append(dt[k])
    return pd.DataFrame({"km": out_d, "min": out_t})

def describe(name, r):
    r = r.dropna()
    q = r.km.quantile([.1, .25, .5, .75, .9]).round(3).tolist()
    print(f"{name}: n={len(r)} km p10/p25/p50/p75/p90={q}; time-diff of that neighbour min p50={r['min'].median():.0f}, share <=120 min: {(r['min']<=120).mean():.1%}")
    for km in (0.375, 0.5, 0.75, 1.0):
        print(f"    share with neighbour <= {km} km AND <= 120 min: {((r.km<=km)&(r['min']<=120)).mean():.1%}")
names = list(sats)
for i in range(3):
    for j in range(3):
        if i != j: describe(f"{names[i][6:-4]} -> nearest {names[j][6:-4]}", nearest(sats[names[i]], sats[names[j]]))
for n in names:
    describe(f"{n[6:-4]} -> nearest OTHER pixel, same satellite (must NOT merge)", nearest(sats[n], sats[n], same=True))
# time gap between satellites' passes over the same cell
