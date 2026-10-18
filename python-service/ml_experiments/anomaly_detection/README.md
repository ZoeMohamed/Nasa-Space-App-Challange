# Goal A — Anomaly Detection Experiment (Stage 2)

**Status: experiment, isolated from production.** Nothing in this directory is imported by `fire_pipeline/`, `main.py`, or the frontend. No ML, no LLM, no weather features — both methods compared here are closed-form statistics (mean/std + a threshold), not trained models.

## What this compares

1. **Fixed per-cell daily baseline** — the current production method (post P0-fix, see `fire_pipeline/historical.py`), reimplemented here (not imported) and verified identical to production via `tests/test_baselines.py::test_fixed_baseline_matches_production_historical_py`. Per grid cell: mean/std of single-day detection counts, over whatever days that cell has history for.
2. **Regional-seasonal baseline** — per region (same 5 provinces as `src/lib/filters.ts`'s `REGION_OPTIONS`) × calendar month: mean/std of single-day counts, pooled across however many years of that region/month combination exist. Falls back to the region's all-months pooled baseline when fewer than `MIN_REGIONAL_SEASONAL_YEARS` (default 5) years of that specific month are available.

Both flag a day as "unusual" the same way: `count > mean + 2×std`.

## Why this comparison exists

Stage 1 of this audit measured `historical.sqlite`'s real sparsity: median 34 observed days per grid cell across a 26-year span, 30% of cells with under 10 days total. The per-cell daily baseline is statistically shaky for most cells at that sample size. Pooling to 5 regions × 12 months trades spatial precision for sample size, to test whether that trade is actually worth it on this real data — not assumed to be.

## Verified facts this design depends on (re-checked before any baseline code was written)

Run `python -m ml_experiments.anomaly_detection.data_audit` to reproduce these on the current `historical.sqlite`:

- **Zero-detection rows: 0.** The table is built via a `groupby` over actual detections (`daily_grid_activity()` in `fire_pipeline/harmonize_events.py`) — a (date, cell) pair with no detections simply has no row, it is never stored as a `detections=0` row.
- **This means "missing" is NOT distinguishable from**: no satellite pass that day, detections present but below the confidence filter, or true zero. **Zero-filling missing days to compute a "true daily rate" would fabricate a label this table cannot support — not done anywhere in this experiment.** Every mean/std below is "mean/std of days where at least 1 detection was recorded", not "mean/std of all possible days."
- Median per-cell density (observed days ÷ that cell's own first-to-last observed span): **0.0069**. 782/2,612 cells have fewer than 10 total observed days.
- VIIRS contributes 0 rows before 2012-01-23 (confirmed directly on the data) — any baseline whose training window spans this boundary mixes a MODIS-only era with a MODIS+VIIRS era. This is why the evaluation below runs twice: once "full-history" (this confound present, included for completeness) and once "VIIRS-era-only" (training restricted to ≥2013, confound avoided).

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
| Full-history (confounded) | 65 | 4.0% | 2.9% | 0.0% | 96.8% |
| VIIRS-era-only (≥2013) | 65 | 5.3% | 2.3% | 31.5% | 95.4% |

**Sensitivity (VIIRS-era-only regime):**

| z threshold | cell flag rate | seasonal flag rate | agreement |
|---|---|---|---|
| 1.5 | 6.9% | 3.2% | 94.2% |
| 2.0 | 5.3% | 2.3% | 95.4% |
| 2.5 | 4.2% | 1.8% | 96.2% |
| 3.0 | 3.4% | 1.4% | 96.8% |

| min-years-for-seasonal | seasonal flag rate | seasonal fallback rate |
|---|---|---|
| 3 | 2.7% | 15.6% |
| 5 (default) | 2.3% | 31.5% |
| 8 | 2.2% | 57.3% |

**Qualitative check** — known high-activity years (2015, 2019) vs. known low-activity years (2020–2022), VIIRS-era regime:

| | cell-method flag rate | seasonal-method flag rate |
|---|---|---|
| High-activity years | 12.6% | 6.4% |
| Low-activity years | 1.7% | 0.5% |

## Interpretation (Decision for Stage 2, per the 3-option framework: Adopt / Continue research / Reject)

**Decision: Continue research — do not adopt the regional-seasonal method as a replacement yet; the fixed per-cell method stays in production as-is.**

Reasoning, from the measured results above, not from preference:

1. **The two methods agree 95-97% of the time** across every regime and threshold tested. That's a real, measured finding: whatever precision the regional pooling buys isn't visible as a large behavioral difference from the already-fixed per-cell method, at least not via this flag/no-flag summary statistic.
2. **The regional method's fallback rate is high in the realistic (VIIRS-era) regime — 31.5% at the default 5-year floor**, meaning nearly a third of region×month evaluations don't actually get the seasonal benefit this method was built for; they're using the same weaker all-months-pooled fallback regardless of month. This directly limits how much the regional approach can be said to outperform the per-cell one in practice, with the training history this archive currently has (most VIIRS-era regions don't yet have 5+ years of VIIRS-era history per calendar month).
3. **Both methods pass the qualitative sanity check** — both flag meaningfully more during 2015/2019 than during 2020-2022, which is reassuring (neither is obviously broken), but this is explicitly not validation against real fire occurrence, and should not be read as one.
4. **No independent ground truth exists to decide "more correct" between the two** — only internal consistency, sensitivity, and the qualitative check above are available, and none of them show a decisive winner.

**What would change this decision**: a few more years of VIIRS-era archive data (lowering the regional method's fallback rate materially), or a genuine ground-truth signal (e.g. a cross-reference against an independent, dated list of known regional fire events) to actually measure which method's flags correspond better to real activity — neither of which exists today.

## Limitations (explicit)

- No independent fire-occurrence ground truth anywhere in this project. Every number above is about statistical behavior (flag rate, agreement, sensitivity), never "accuracy."
- The region definitions (5 provinces) are the same approximate rectangles already used by the product's filters — not official administrative boundaries, and they overlap each other in places (documented in `shared/dataset.py`).
- "Qualitative year check" years (2015/2019 high, 2020-2022 low) come from this dataset's own yearly totals, which are themselves confounded by sensor-coverage changes over time (Stage 1 finding) — not an independent record of real fire years.
- This experiment does not touch, call, or depend on `fire_pipeline/`, `main.py`, or any frontend code. It can be deleted with zero production impact.
