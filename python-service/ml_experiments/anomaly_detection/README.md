# Goal A — Anomaly Detection Experiment (Stage 2)

> **Update 2026-10-21.** Re-run on the rebuilt archive (nominal+high filter, 1,069,505 rows). The numbers below are from that run (`results/latest.json`). Two conclusions from the first version were wrong and are corrected in place: the "31.5% fallback" was a fold-design artifact, not data sparsity, and the 95–97% agreement is mostly chance agreement. The follow-up audit, which also covers a problem in the live comparison this experiment never looked at, is in [`../audit_2026_10/README.md`](../audit_2026_10/README.md).

**Status: experiment, isolated from production.** Nothing in this directory is imported by `fire_pipeline/`, `main.py`, or the frontend. No ML, no LLM, no weather features — both methods compared here are closed-form statistics (mean/std + a threshold), not trained models.

## What this compares

1. **Fixed per-cell daily baseline** — the current production method (post P0-fix, see `fire_pipeline/historical.py`), reimplemented here (not imported) and verified identical to production via `tests/test_baselines.py::test_fixed_baseline_matches_production_historical_py`. Per grid cell: mean/std of single-day detection counts, over whatever days that cell has history for.
2. **Regional-seasonal baseline** — per region (same 5 provinces as `src/lib/filters.ts`'s `REGION_OPTIONS`) × calendar month: mean/std of single-day counts, pooled across however many years of that region/month combination exist. Falls back to the region's all-months pooled baseline when fewer than `MIN_REGIONAL_SEASONAL_YEARS` (default 5) years of that specific month are available.

Both flag a day as "unusual" the same way: `count > mean + 2×std`.

## Why this comparison exists

Stage 1 of this audit measured `historical.sqlite`'s sparsity on the old high-confidence-only archive: median 34 observed days per grid cell, 30% of cells with under 10 days. On the rebuilt archive the VIIRS-era median is 177 days per cell, but 443 of 3,231 cells still have under 10 days, so the concern still applies to a minority of cells. Pooling to 5 regions × 12 months trades spatial precision for sample size, to test whether that trade is actually worth it on this real data — not assumed to be.

## Verified facts this design depends on (re-checked before any baseline code was written)

Run `python -m ml_experiments.anomaly_detection.data_audit` to reproduce these on the current `historical.sqlite`:

- **Zero-detection rows: 0.** The table is built via a `groupby` over actual detections (`daily_grid_activity()` in `fire_pipeline/harmonize_events.py`) — a (date, cell) pair with no detections simply has no row, it is never stored as a `detections=0` row.
- **This means "missing" is NOT distinguishable from**: no satellite pass that day, detections present but below the confidence filter, or true zero. **Zero-filling missing days to compute a "true daily rate" would fabricate a label this table cannot support — not done anywhere in this experiment.** Every mean/std below is "mean/std of days where at least 1 detection was recorded", not "mean/std of all possible days."
- Median per-cell density (observed days ÷ that cell's own first-to-last observed span): **0.0312** (was 0.0069 on the old archive). 441/3,250 cells have fewer than 10 total observed days.
- VIIRS contributes 0 rows before 2012-01-20 (confirmed directly on the data) — any baseline whose training window spans this boundary mixes a MODIS-only era with a MODIS+VIIRS era. This is why the evaluation below runs twice: once "full-history" (this confound present, included for completeness) and once "VIIRS-era-only" (training restricted to ≥2013, confound avoided).

## Reproducing the results

```bash
cd python-service
.venv/bin/python -m ml_experiments.anomaly_detection.data_audit     # Step 1: data representation audit
.venv/bin/python -m ml_experiments.anomaly_detection.evaluate       # Step 2: rolling-origin comparison + sensitivity + qualitative check
# writes ml_experiments/anomaly_detection/results/latest.json

# Tests (NOT part of the default `pytest` run — pytest.ini's testpaths=tests
# deliberately does not include this directory, so production's test count
# is unaffected by this experiment's existence):
.venv/bin/python -m pytest ml_experiments/anomaly_detection/tests -v
```

## Rolling-origin evaluation design

- **Folds**: for each of the 5 regions, one fold per test year from 2014 onward, training on every available year strictly before the test year (no fold ever trains on its own or a later year — enforced and tested in `tests/test_evaluate.py`).
- **Two regimes**: `full_history` (training window can start at year 2000) and `viirs_era` (training window restricted to ≥2013) — reported separately, not blended, because of the sensor-era confound above.
- **Sensitivity sweep**: both methods re-run at threshold z ∈ {1.5, 2.0, 2.5, 3.0} and at the regional method's minimum-years-for-seasonal floor ∈ {3, 5, 8}.
- **Qualitative year check**: NOT a ground-truth validation (no independent fire-occurrence labels exist anywhere in this dataset or this project — confirmed in the Stage 1 audit). Only checks whether either method's flag rate is directionally higher during years this dataset's own yearly totals already show as high-activity (2015, 2019) vs. low-activity (2020–2022).

## Results (from the run committed with this experiment — reproduce with the command above to verify)

| Regime | Folds | Mean cell-method flag rate | Mean seasonal-method flag rate | Seasonal fallback rate | Agreement rate |
|---|---|---|---|---|---|
| Full-history (confounded) | 65 | 4.0% | 2.9% | 0.0% | 96.6% |
| VIIRS-era-only (≥2013) | 65 | 3.8% | 1.9% | 30.8% | 96.6% |

**Sensitivity (VIIRS-era-only regime):**

| z threshold | cell flag rate | seasonal flag rate | agreement |
|---|---|---|---|
| 1.5 | 5.0% | 2.7% | 95.6% |
| 2.0 | 3.8% | 1.9% | 96.6% |
| 2.5 | 3.0% | 1.5% | 97.2% |
| 3.0 | 2.5% | 1.2% | 97.7% |

| min-years-for-seasonal | seasonal flag rate | seasonal fallback rate |
|---|---|---|
| 3 | 2.1% | 15.4% |
| 5 (default) | 1.9% | 30.8% |
| 8 | 1.8% | 53.8% |

**Qualitative check** — known high-activity years (2015, 2019) vs. known low-activity years (2020–2022), VIIRS-era regime:

| | cell-method flag rate | seasonal-method flag rate |
|---|---|---|
| High-activity years | 9.6% | 5.5% |
| Low-activity years | 0.9% | 0.7% |

## Interpretation (Decision for Stage 2, per the 3-option framework: Adopt / Continue research / Reject)

**Decision: Continue research — do not adopt the regional-seasonal method as a replacement yet; the fixed per-cell method stays in production as-is.**

Reasoning, from the measured results above, not from preference:

1. **The two methods agree 95-97% of the time**, but this says little: both flag under 5% of observations, so two unrelated methods would already agree about 94% of the time by chance. (Corrected 2026-10-21; the first version read this as evidence the methods behave alike.) Cohen's κ or a contingency table is the right summary. The follow-up audit measures κ = 0.74 between the production per-cell baseline and a per-cell seasonal baseline.
2. **The "fallback rate" is a fold-design artifact (corrected 2026-10-21).** In the VIIRS-era regime, training starts in 2013, so the test-year folds 2014–2017 have 1–4 training years and *must* fall below a 5-year floor. 4 of 13 folds = 30.8%; floor 3 → 2/13 = 15.4%; floor 8 → 7/13 = 53.8%, exactly the sweep above. It does not show that the archive lacks 5+ years per calendar month: 58.8% of (cell, month) pairs already have ≥5 VIIRS-era years.
3. **Both methods pass the qualitative sanity check** — both flag meaningfully more during 2015/2019 than during 2020-2022, which is reassuring (neither is obviously broken), but this is explicitly not validation against real fire occurrence, and should not be read as one.
4. **No independent ground truth exists to decide "more correct" between the two** — only internal consistency, sensitivity, and the qualitative check above are available, and none of them show a decisive winner.

**What would change this decision**: a seasonal baseline at the cell level rather than the pooled region level (tested in the follow-up audit and recommended there), or a genuine ground-truth signal (e.g. a cross-reference against an independent, dated list of known regional fire events) to actually measure which method's flags correspond better to real activity — neither of which exists today.

## Limitations (explicit)

- No independent fire-occurrence ground truth anywhere in this project. Every number above is about statistical behavior (flag rate, agreement, sensitivity), never "accuracy."
- The region definitions (5 provinces) are approximate rectangles that overlap each other in places (documented in `shared/dataset.py`). The product has since moved to real BPS province boundaries, so these no longer match what users see.
- The regional method compares one cell's daily count against the pooled distribution of every cell in the region, so cells that are always busy get flagged more often.
- "Qualitative year check" years (2015/2019 high, 2020-2022 low) come from this dataset's own yearly totals, which are themselves confounded by sensor-coverage changes over time (Stage 1 finding) — not an independent record of real fire years.
- This experiment does not touch, call, or depend on `fire_pipeline/`, `main.py`, or any frontend code. It can be deleted with zero production impact.
