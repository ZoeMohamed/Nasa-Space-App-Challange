"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import { getRegionOption, getRangeOption, isWithinBounds } from "@/lib/filters";
import type { HistoricalCalendarResponse, HistoricalCell, HotspotApiResponse } from "@/types";

/**
 * Figma source: file wasTTtlmYfsjK1ZkH1Kzim, node 169:16396 ("Desktop - 10"). That top frame
 * actually bundles 8 separate screen mockups as flattened sibling groups (same multi-screen-
 * canvas pattern already called out in this app's other Figma source comments) — the real
 * "Historical Burning Activity" screen content lives in the loose sibling frames starting at
 * 169:20381 ("Header & Filter Row") through 169:20646, specifically 169:20387 ("Filters Ribbon"),
 * 169:20448 ("Card 2: Burning Activity Calendar" — the month x year heatmap + intensity legend),
 * 169:20596 ("Yearly Activity Overview Card") and 169:20568 ("Insight & rekomendasi aktivitas").
 * Fetched individually via get_design_context after the bundled top-level response came back
 * sparse, matched against the local reference screenshot "Desktop - 10.png".
 *
 * HISTORICAL DATA, READ BEFORE EDITING NUMBERS BELOW:
 * This page is inherently about multi-year fire history and a historical baseline — exactly
 * what the NASA Space Apps brief asks for ("compare current conditions to a historical baseline
 * to flag unusual activity"). A backend pipeline now genuinely has this: a real ingest of NASA
 * FIRMS archive + NRT files (2000-2026, 177,983 daily/grid rows) exposed via
 * `GET /api/historical` (proxying the Python `/api/historical/calendar` endpoint — see
 * src/app/api/historical/route.ts). The heatmap, yearly overview and baseline/deviation stat
 * tiles below now render that real data when it's available (`months`/`cells` non-empty) and
 * only fall back to the DEMO_* constants further down if the fetch fails or the store happens to
 * be empty — see `hasRealMonths` in CalendarPageContent. The DEMO_* constants are kept
 * intentionally, as a documented fallback path, not deleted.
 *
 * Two real, honest limitations remain even with real data (see the methodology note rendered
 * near the heatmap): (1) the archive's `type==0` vegetation-fire filter only applies to archive
 * rows — NRT rows don't have that column, so recent months may include non-vegetation thermal
 * anomalies that older months exclude; (2) the high-confidence filter is strict, especially for
 * VIIRS (~3.4% pass rate), so VIIRS-heavy periods can look sparser than they really are.
 *
 * The "Deteksi 24 Jam Terakhir" stat tile is still the one *live* (not historical-archive) number
 * on this page, fetched the same way as /map, /analytics and /priority-areas
 * (`fetch("/api/hotspots")`) and filtered by the shared Region selector that already lives in
 * TopBar.tsx — see src/lib/filters.ts. The "area dengan aktivitas tidak biasa" stat tile compares
 * that live snapshot, binned into the same 0.25° grid cells, against each cell's real historical
 * mean + 2×std from `/api/historical` — a real anomaly check, not an invented one.
 * The content-area "Filters Ribbon" dropdowns shown in the Figma mock are intentionally NOT
 * reimplemented here as a second, disconnected set of controls: TopBar already owns the real
 * Region + Time Range selectors (writing to `?region=`/`?range=`) that every other filterable
 * page in this app reads back via `useSearchParams()`. This page follows that same convention
 * instead of bolting on decorative, non-functional dropdowns next to real ones.
 */

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// DEMO / ILLUSTRATIVE DATA — FALLBACK ONLY, isolated here so it's obvious at a glance what is
// fabricated. Used only when GET /api/historical fails or returns empty `months` (see
// `hasRealMonths` below) — the primary path now renders the real multi-year NASA FIRMS archive
// ingest instead. Contoh — data historis asli: FIRMS Archive Download
// (firms.modaps.eosdis.nasa.gov/download). Setiap angka di bawah ini ilustratif untuk keperluan
// tampilan, BUKAN hasil pengukuran atau perhitungan nyata dari NASA FIRMS.
// ---------------------------------------------------------------------------------------------

const DEMO_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `null` = bulan belum terjadi / belum ada data (mis. sisa 2026 setelah September dalam contoh ini). */
const DEMO_MONTHLY_INTENSITY: Record<number, (number | null)[]> = {
  2023: [80, 260, 640, 1800, 3400, 6200, 9800, 16800, 13200, 3900, 700, 180],
  2024: [60, 210, 520, 1500, 2900, 5600, 8700, 12200, 9800, 3100, 640, 150],
  2025: [70, 230, 580, 1650, 3100, 5900, 9100, 13400, 10600, 3300, 680, 160],
  2026: [90, 280, 690, 1950, 3600, 6500, 10200, 17600, 14100, null, null, null],
};
const DEMO_YEARS = Object.keys(DEMO_MONTHLY_INTENSITY).map(Number).sort((a, b) => a - b);

// Konsep "kondisi tidak biasa" dari brief NASA Space Apps: bandingkan periode berjalan terhadap
// baseline historis. Di sini "periode berjalan" = September tahun terbaru dalam dataset contoh
// (bulan puncak yang berulang tiap tahun, lihat array di atas), dibandingkan rata-rata 3 tahun
// sebelumnya pada bulan yang sama. Baseline asli butuh arsip multi-tahun yang sama seperti di atas.
const DEMO_BASELINE_MONTH_LABEL = "September";
const DEMO_BASELINE_REFERENCE = Math.round(
  ((DEMO_MONTHLY_INTENSITY[2023][8] ?? 0) + (DEMO_MONTHLY_INTENSITY[2024][8] ?? 0) + (DEMO_MONTHLY_INTENSITY[2025][8] ?? 0)) / 3
);
const DEMO_CURRENT_PERIOD_VALUE = DEMO_MONTHLY_INTENSITY[2026][8] ?? 0;
const DEMO_BASELINE_DEVIATION_PCT = Math.round(
  ((DEMO_CURRENT_PERIOD_VALUE - DEMO_BASELINE_REFERENCE) / DEMO_BASELINE_REFERENCE) * 100
);

interface IntensityBucket {
  label: string;
  bg: string;
  text: string;
}

/** Matches the 5-bucket intensity legend from the Figma heatmap (node 169:20448) exactly. */
const INTENSITY_NO_DATA: IntensityBucket = { label: "Belum ada data", bg: "#f1f5f9", text: "#94a3b8" };
const INTENSITY_BUCKETS: IntensityBucket[] = [
  { label: "0 - 500", bg: "#fff7e8", text: "#202b3c" },
  { label: "500 - 2k", bg: "#ffe8b5", text: "#202b3c" },
  { label: "2k - 5k", bg: "#f5d3b3", text: "#202b3c" },
  { label: "5k - 15k", bg: "#f07836", text: "#ffffff" },
  { label: "> 15k", bg: "#a91d22", text: "#ffffff" },
];
const INTENSITY_THRESHOLDS = [500, 2000, 5000, 15000];

function getIntensityBucket(value: number | null): IntensityBucket {
  if (value === null) return INTENSITY_NO_DATA;
  const bucketIndex = INTENSITY_THRESHOLDS.findIndex((threshold) => value <= threshold);
  return bucketIndex === -1 ? INTENSITY_BUCKETS[INTENSITY_BUCKETS.length - 1] : INTENSITY_BUCKETS[bucketIndex];
}

/** Works for either DEMO_MONTHLY_INTENSITY[year] or a real per-year array built from `months`. */
function summarizeYear(months: (number | null)[]) {
  const observed = months.filter((value): value is number => value !== null);
  const total = observed.reduce((sum, value) => sum + value, 0);

  const maxValue = Math.max(...observed);
  const peakIndex = months.indexOf(maxValue);
  const prevValue = peakIndex > 0 ? (months[peakIndex - 1] ?? -1) : -1;
  const nextValue = peakIndex < months.length - 1 ? (months[peakIndex + 1] ?? -1) : -1;
  const secondIndex = prevValue >= nextValue ? peakIndex - 1 : peakIndex + 1;
  const peakRange = [peakIndex, secondIndex].filter((index) => index >= 0 && index < 12).sort((a, b) => a - b);
  const peakLabel = peakRange.map((index) => DEMO_MONTH_LABELS[index]).join(" – ");

  // Proportion of observed months landing in each intensity bucket, used to draw the segmented bar.
  const bucketShares = INTENSITY_BUCKETS.map((bucket) => {
    const count = months.filter((value) => value !== null && getIntensityBucket(value) === bucket).length;
    return observed.length > 0 ? (count / observed.length) * 100 : 0;
  });

  return { total, peakLabel, bucketShares };
}

async function requestHotspots(signal?: AbortSignal) {
  const response = await fetch("/api/hotspots", { signal, cache: "no-store" });
  const body = (await response.json()) as HotspotApiResponse & { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to load NASA FIRMS data.");
  }

  return body;
}

function requestErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load NASA FIRMS data.";
}

/**
 * Real multi-year archive data from the Python pipeline (see src/app/api/historical/route.ts).
 * Never throws for an empty-but-valid store — `{ months: [], cells: [] }` is a legitimate
 * response, not an error (the caller treats that the same as a fetch failure: fall back to demo).
 */
async function requestHistorical(signal?: AbortSignal): Promise<HistoricalCalendarResponse> {
  const response = await fetch("/api/historical", { signal, cache: "no-store" });
  const body = (await response.json()) as HistoricalCalendarResponse & { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to load historical NASA FIRMS data.");
  }

  return { months: body.months ?? [], cells: body.cells ?? [] };
}

function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <Badge tone="medium" className={className}>
      Contoh data
    </Badge>
  );
}

function CalendarPageContent() {
  const searchParams = useSearchParams();
  const activeRegion = getRegionOption(searchParams.get("region"));
  const activeRange = getRangeOption(searchParams.get("range"));
  const hasActiveFilters = searchParams.has("region") || searchParams.has("range");

  const [allMarkers, setAllMarkers] = useState<HotspotApiResponse["markers"]>([]);
  const [meta, setMeta] = useState<HotspotApiResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Region filter on the one real data source this page shows — same client-side bbox check
  // every other filterable page uses (src/lib/filters.ts).
  const liveMarkers = useMemo(
    () => allMarkers.filter((marker) => isWithinBounds(marker.lat, marker.lng, activeRegion.bounds)),
    [allMarkers, activeRegion]
  );

  useEffect(() => {
    const controller = new AbortController();

    const load = () => {
      requestHotspots(controller.signal)
        .then((body) => {
          setAllMarkers(body.markers);
          setMeta(body.meta);
          setError(null);
        })
        .catch((requestError: unknown) => {
          if (requestError instanceof DOMException && requestError.name === "AbortError") return;
          setError(requestErrorMessage(requestError));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    };

    load();
    const interval = window.setInterval(load, REFRESH_INTERVAL_MS);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  // Real multi-year archive data (months + per-cell baselines) — fetched once on mount. Falls
  // back to the DEMO_* constants below if this fails or comes back empty; see `hasRealMonths`.
  const [historical, setHistorical] = useState<HistoricalCalendarResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    requestHistorical(controller.signal)
      .then((body) => setHistorical(body))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        console.error("Historical NASA FIRMS fetch failed, falling back to demo data", requestError);
        setHistorical({ months: [], cells: [] });
      });

    return () => controller.abort();
  }, []);

  // Real per-year month arrays built from `historical.months`, same shape as DEMO_MONTHLY_INTENSITY
  // (12-length array indexed by month - 1, `null` = no data for that month).
  const realMonthlyIntensity = useMemo(() => {
    if (!historical || historical.months.length === 0) return null;
    const byYear: Record<number, (number | null)[]> = {};
    for (const entry of historical.months) {
      if (!byYear[entry.year]) byYear[entry.year] = Array(12).fill(null);
      byYear[entry.year][entry.month - 1] = entry.detections;
    }
    return byYear;
  }, [historical]);

  const realYears = useMemo(
    () => (realMonthlyIntensity ? Object.keys(realMonthlyIntensity).map(Number).sort((a, b) => a - b) : []),
    [realMonthlyIntensity]
  );

  const hasRealMonths = realMonthlyIntensity !== null && realYears.length > 0;

  // The data actually rendered by the heatmap + yearly overview below — real archive data when
  // available, otherwise the illustrative DEMO_* fallback.
  const activeMonthlyIntensity = hasRealMonths ? realMonthlyIntensity! : DEMO_MONTHLY_INTENSITY;
  const activeYears = hasRealMonths ? realYears : DEMO_YEARS;

  // Real baseline: latest archive month vs the average of that same calendar month in prior
  // years — no invented numbers, pure arithmetic over `historical.months`.
  const realBaseline = useMemo(() => {
    if (!historical || historical.months.length === 0) return null;
    const sorted = [...historical.months].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
    const latest = sorted[sorted.length - 1];
    const sameMonthPrevYears = sorted.filter((entry) => entry.month === latest.month && entry.year < latest.year);
    if (sameMonthPrevYears.length === 0) return null;

    const baselineValue =
      sameMonthPrevYears.reduce((sum, entry) => sum + entry.detections, 0) / sameMonthPrevYears.length;
    const deviationPct = baselineValue > 0 ? Math.round(((latest.detections - baselineValue) / baselineValue) * 100) : null;

    return {
      monthLabel: DEMO_MONTH_LABELS[latest.month - 1],
      year: latest.year,
      current: latest.detections,
      baseline: Math.round(baselineValue),
      deviationPct,
      firstYear: Math.min(...sameMonthPrevYears.map((entry) => entry.year)),
      lastYear: Math.max(...sameMonthPrevYears.map((entry) => entry.year)),
    };
  }, [historical]);

  // Real anomaly check: today's live NRT detections, binned into the same 0.25° grid the archive
  // baselines use, compared against each cell's real historical mean + 2×std. A cell only counts
  // as "unusual" if a single day's live count already exceeds that cell's typical FULL MONTH mean
  // by more than 2 standard deviations — intentionally conservative, not a fabricated threshold.
  const unusualAreas = useMemo(() => {
    if (!historical || historical.cells.length === 0) return null;

    const cellByKey = new Map<string, HistoricalCell>();
    for (const cell of historical.cells) {
      cellByKey.set(`${cell.gridLat.toFixed(2)},${cell.gridLon.toFixed(2)}`, cell);
    }

    const liveCountByKey = new Map<string, number>();
    for (const marker of liveMarkers) {
      const gridLat = Math.floor(marker.lat / 0.25) * 0.25;
      const gridLon = Math.floor(marker.lng / 0.25) * 0.25;
      const key = `${gridLat.toFixed(2)},${gridLon.toFixed(2)}`;
      liveCountByKey.set(key, (liveCountByKey.get(key) ?? 0) + 1);
    }

    let matchedCells = 0;
    let unusualCells = 0;
    for (const [key, count] of liveCountByKey) {
      const cell = cellByKey.get(key);
      if (!cell || cell.monthlyStdDetections === null) continue;
      matchedCells += 1;
      if (count > cell.monthlyMeanDetections + 2 * cell.monthlyStdDetections) unusualCells += 1;
    }

    return { matchedCells, unusualCells };
  }, [historical, liveMarkers]);

  // Real aggregate peak month across every real year available, used by the insight panel below
  // instead of the hardcoded "Agustus–September" demo claim.
  const realPeakMonthLabel = useMemo(() => {
    if (!hasRealMonths) return null;
    const totals = Array(12).fill(0);
    for (const year of realYears) {
      activeMonthlyIntensity[year].forEach((value, index) => {
        if (value !== null) totals[index] += value;
      });
    }
    const maxValue = Math.max(...totals);
    const peakIndex = totals.indexOf(maxValue);
    return DEMO_MONTH_LABELS[peakIndex];
  }, [hasRealMonths, realYears, activeMonthlyIntensity]);

  // "Yearly Activity Overview" shows one bar per year — with real data spanning 2000-2026 that's
  // 26 rows, too many to read usefully next to the insight panel, so this card specifically shows
  // only the most recent 6 real years. The heatmap above still shows every real year.
  const overviewYears = hasRealMonths ? realYears.slice(-6) : DEMO_YEARS;

  const sourcesAvailable = meta?.sources.filter((source) => source.available).length ?? 0;

  return (
    <WorkstationLayout activeTab="Calendar">
      <div className="max-w-[1400px] mx-auto space-y-6">

        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
              <span>Historical Patterns</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Historical Burning Activity</h1>
            <p className="text-sm text-gray-500 max-w-2xl">
              Explore historical fire activity patterns across months and years, and compare them with today&apos;s
              live snapshot below — this shows patterns, not predictions of future fires.
            </p>
          </div>
        </div>

        {/* Info pills — reflect the TopBar's real region/range selection (?region=, ?range=) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-8 px-3 inline-flex items-center bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm">
            Wilayah: {activeRegion.label}
          </span>
          <span className="h-8 px-3 inline-flex items-center bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm">
            Window (live stat): {activeRange.label}
          </span>
          <span className="h-8 px-3 inline-flex items-center bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm">
            Sensor: Unified (MODIS + VIIRS)
          </span>
          {hasActiveFilters && (
            <Link
              href="/calendar"
              className="h-8 px-3 inline-flex items-center bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-500 shadow-sm hover:bg-gray-50"
            >
              Clear Filters
            </Link>
          )}
        </div>

        {/* Live stat (always real) + baseline/deviation/anomaly stats — real once `historical`
            loads with data, demo-labeled fallback otherwise. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            icon="local_fire_department"
            iconTone="red"
            label="Deteksi 24 Jam Terakhir (Live)"
            value={loading ? "…" : liveMarkers.length.toLocaleString("id-ID")}
            caption={
              error
                ? error
                : loading
                  ? "Memuat NASA FIRMS…"
                  : `${sourcesAvailable}/4 feed NASA FIRMS aktif • snapshot NRT, bukan arsip historis`
            }
          />
          <StatTile
            icon="query_stats"
            iconTone="blue"
            label={
              realBaseline
                ? `Baseline Historis ${realBaseline.monthLabel}`
                : `Baseline Historis ${DEMO_BASELINE_MONTH_LABEL} (Contoh)`
            }
            value={(realBaseline ? realBaseline.baseline : DEMO_BASELINE_REFERENCE).toLocaleString("id-ID")}
            caption={
              realBaseline
                ? `Rata-rata ${realBaseline.monthLabel} ${realBaseline.firstYear}–${realBaseline.lastYear} — arsip NASA FIRMS nyata`
                : "Rata-rata 2023–2025 — data ilustratif, lihat catatan sumber di kode"
            }
          />
          <StatTile
            icon="warning"
            iconTone="amber"
            label={realBaseline ? "Deviasi dari Baseline" : "Deviasi dari Baseline (Contoh)"}
            value={
              realBaseline && realBaseline.deviationPct !== null
                ? `${realBaseline.deviationPct > 0 ? "+" : ""}${realBaseline.deviationPct}%`
                : realBaseline
                  ? "—"
                  : `${DEMO_BASELINE_DEVIATION_PCT > 0 ? "+" : ""}${DEMO_BASELINE_DEVIATION_PCT}%`
            }
            trend={
              realBaseline
                ? realBaseline.deviationPct !== null
                  ? {
                      direction: realBaseline.deviationPct > 0 ? "up" : "down",
                      label: realBaseline.deviationPct > 0 ? "Di atas baseline" : "Di bawah baseline",
                    }
                  : undefined
                : {
                    direction: DEMO_BASELINE_DEVIATION_PCT > 0 ? "up" : "down",
                    label: DEMO_BASELINE_DEVIATION_PCT > 0 ? "Di atas baseline" : "Di bawah baseline",
                  }
            }
            caption={
              realBaseline
                ? `${realBaseline.monthLabel} ${realBaseline.year} vs rata-rata ${realBaseline.firstYear}–${realBaseline.lastYear} — data arsip nyata`
                : `${DEMO_BASELINE_MONTH_LABEL} 2026 (contoh) vs rata-rata 2023–2025 — bukan kondisi real-time aktual`
            }
          />
          <StatTile
            icon="travel_explore"
            iconTone="amber"
            label="Area dengan Aktivitas Tidak Biasa"
            value={unusualAreas ? unusualAreas.unusualCells.toLocaleString("id-ID") : "—"}
            caption={
              unusualAreas
                ? `dari ${unusualAreas.matchedCells.toLocaleString("id-ID")} sel 0.25° dengan deteksi live hari ini • deteksi hari ini > rata-rata bulanan + 2×std sel (baseline arsip nyata)`
                : "Data baseline per-sel belum tersedia"
            }
          />
        </div>

        {/* Burning Activity Calendar — heatmap */}
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 text-sm">Burning Activity Calendar</h3>
                {!hasRealMonths && <DemoBadge />}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {hasRealMonths
                  ? `Pola historis aktivitas kebakaran, ${activeYears[0]}–${activeYears[activeYears.length - 1]} (arsip NASA FIRMS nyata).`
                  : "Historical pattern of fire activity in this area."}
              </p>
            </div>
          </div>

          {hasRealMonths ? (
            <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/60 px-3 py-2 mb-5 text-xs text-blue-900">
              Data arsip NASA FIRMS nyata ({activeYears[0]}–{activeYears[activeYears.length - 1]}). Catatan metodologi:
              filter tipe vegetasi (type==0) hanya berlaku pada baris arsip — baris NRT tidak memiliki kolom ini,
              jadi bulan-bulan terbaru bisa menyertakan anomali termal non-vegetasi yang disaring di bulan-bulan
              lama. Filter kepercayaan tinggi juga ketat, terutama untuk VIIRS (~3.4% lolos), sehingga periode
              dominan-VIIRS bisa terlihat lebih jarang dari kondisi sebenarnya.
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2 mb-5 text-xs text-amber-800">
              Data ilustratif untuk mendemonstrasikan tampilan kalender multi-tahun — gagal memuat arsip historis
              nyata dari backend, menampilkan data contoh sebagai fallback.
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              {/* Month headers */}
              <div className="flex text-[10px] text-gray-400 font-medium mb-2 ml-10 gap-2">
                {DEMO_MONTH_LABELS.map((month) => (
                  <span key={month} className="flex-1 text-center">
                    {month}
                  </span>
                ))}
              </div>

              {/* Year rows */}
              {activeYears.map((year) => (
                <div key={year} className="flex items-center mb-2 gap-2">
                  <span className="text-xs text-gray-500 w-8 font-semibold shrink-0">{year}</span>
                  <div className="flex gap-2 flex-1">
                    {activeMonthlyIntensity[year].map((value, monthIndex) => {
                      const bucket = getIntensityBucket(value);
                      return (
                        <div
                          key={monthIndex}
                          className="flex-1 h-10 rounded-md hover:ring-2 hover:ring-offset-2 hover:ring-gray-300 transition-all cursor-default"
                          style={{ backgroundColor: bucket.bg }}
                          title={
                            value === null
                              ? `${DEMO_MONTH_LABELS[monthIndex]} ${year}: belum ada data`
                              : hasRealMonths
                                ? `${DEMO_MONTH_LABELS[monthIndex]} ${year}: ${value.toLocaleString("id-ID")} deteksi`
                                : `${DEMO_MONTH_LABELS[monthIndex]} ${year}: ${value.toLocaleString("id-ID")} deteksi (contoh)`
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Intensity legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-2 border-t border-gray-100">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-500 tracking-wide mr-1">INTENSITAS:</span>
              {INTENSITY_BUCKETS.map((bucket) => (
                <span
                  key={bucket.label}
                  className="text-[11px] font-medium px-2 py-0.5 rounded"
                  style={{ backgroundColor: bucket.bg, color: bucket.text }}
                >
                  {bucket.label}
                </span>
              ))}
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded border border-gray-200"
                style={{ backgroundColor: INTENSITY_NO_DATA.bg, color: INTENSITY_NO_DATA.text }}
              >
                {INTENSITY_NO_DATA.label}
              </span>
            </div>
            <span className="text-xs text-gray-400">
              {hasRealMonths
                ? "Satuan: Jumlah observasi termal unik per sel kalender (arsip NASA FIRMS nyata)."
                : "Satuan: Jumlah observasi termal unik per sel kalender (data ilustratif)."}
            </span>
          </div>
        </Card>

        {/* Yearly Activity Overview + Insight & rekomendasi */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-900 text-base">Yearly Activity Overview</h3>
                  {!hasRealMonths && <DemoBadge />}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {hasRealMonths
                    ? `Total hotspots and peak period comparison — ${overviewYears.length} tahun terakhir dari arsip nyata.`
                    : "Total hotspots and peak period comparison."}
                </p>
              </div>
              {/* No historical cluster/trend view exists yet for this page specifically — routes
                  to Analytics, the closest existing page that covers multi-area trend analysis. */}
              <Link
                href="/analytics"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 shrink-0"
              >
                View details
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>

            <div className="space-y-6">
              {overviewYears.map((year) => {
                const { total, peakLabel, bucketShares } = summarizeYear(activeMonthlyIntensity[year]);
                return (
                  <div key={year} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-gray-800">{year}</span>
                        <span className="text-xs text-gray-400">
                          {total.toLocaleString("id-ID")} hotspots{hasRealMonths ? "" : " (contoh)"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-4 rounded-full bg-gray-100 overflow-hidden flex">
                        {bucketShares.map((share, index) =>
                          share > 0 ? (
                            <div
                              key={index}
                              className="h-full"
                              style={{ width: `${share}%`, backgroundColor: INTENSITY_BUCKETS[index].bg }}
                            />
                          ) : null
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="w-2 h-2 rounded-full bg-rose-600" />
                        <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Peak: {peakLabel}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="bg-red-50/60 border border-red-100 rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[16px] text-[#b91c1c]">warning</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-[#b91c1c] text-sm">Insight &amp; rekomendasi aktivitas</h3>
                  {!hasRealMonths && <DemoBadge />}
                </div>
                <p className="text-[11px] text-red-900/70">
                  {activeRegion.label} •{" "}
                  {hasRealMonths ? `${activeYears[0]}–${activeYears[activeYears.length - 1]}` : "2023–2026"} •
                  Unified (MODIS + VIIRS)
                </p>
              </div>
            </div>

            <div className="space-y-1.5 mb-4">
              <h4 className="text-sm font-semibold text-[#b91c1c]">Insight historis</h4>
              <p className="text-[13px] leading-[18px] text-red-900/80">
                {hasRealMonths && realPeakMonthLabel
                  ? `${realPeakMonthLabel} menjadi bulan dengan total deteksi tertinggi secara agregat pada arsip ${activeYears[0]}–${activeYears[activeYears.length - 1]} ini. Pola berulang seperti ini membantu menentukan waktu prioritas pemantauan.`
                  : "Agustus–September menjadi puncak aktivitas pada contoh data 2023–2026 ini. Pola berulang seperti ini membantu menentukan waktu prioritas pemantauan."}
              </p>
              <p className="text-[13px] leading-[18px] text-red-900/80">
                Aktivitas lebih rendah di luar puncak tidak berarti bebas risiko.
              </p>
            </div>

            <div className="space-y-2 mb-4">
              <h4 className="text-sm font-semibold text-[#b91c1c]">Rekomendasi tindak lanjut</h4>
              <ul className="space-y-2">
                <li className="flex items-start gap-2.5 text-[13px] text-red-900/80">
                  <span className="material-symbols-outlined text-red-600 text-base shrink-0 leading-5">check_circle</span>
                  Sebelum bulan puncak{hasRealMonths && realPeakMonthLabel ? ` (${realPeakMonthLabel})` : " (Agustus)"}: siapkan jadwal pemantauan dan koordinasi tim.
                </li>
                <li className="flex items-start gap-2.5 text-[13px] text-red-900/80">
                  <span className="material-symbols-outlined text-red-600 text-base shrink-0 leading-5">check_circle</span>
                  Pada bulan puncak{hasRealMonths && realPeakMonthLabel ? ` (${realPeakMonthLabel})` : " (Agustus–September)"}: prioritaskan pemantauan dan verifikasi deteksi.
                </li>
                <li className="flex items-start gap-2.5 text-[13px] text-red-900/80">
                  <span className="material-symbols-outlined text-red-600 text-base shrink-0 leading-5">check_circle</span>
                  Di luar puncak: lanjutkan pemantauan rutin dan tinjau deteksi baru.
                </li>
              </ul>
            </div>

            <div className="flex items-start gap-2 bg-white rounded-md px-3 py-2">
              <span className="material-symbols-outlined text-[14px] text-red-600 mt-0.5 shrink-0">info</span>
              <p className="text-xs leading-[18px] text-red-900/80">
                Pola historis, bukan kondisi terkini. Deteksi satelit merupakan indikasi dan perlu verifikasi
                lapangan.
              </p>
            </div>
          </div>
        </div>

      </div>
    </WorkstationLayout>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageContent />
    </Suspense>
  );
}
