"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AreaSearch, { type AreaHit } from "@/components/AreaSearch";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import { getRegionOption, getRangeOption, historicalQuery, isArchiveRange, matchesRegion, type RegionOption, withFilters } from "@/lib/filters";
import { useLiveHotspots } from "@/lib/useLiveHotspots";
import type { HistoricalCalendarResponse, HistoricalCell } from "@/types";

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
 * anomalies that older months exclude; (2) VIIRS joins the record on 2012-01-20 and dominates the
 * nominal+high counts after that, so cross-year comparisons and per-cell baselines use 2012+ only.
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

/**
 * Real multi-year archive data from the Python pipeline (see src/app/api/historical/route.ts).
 * Never throws for an empty-but-valid store — `{ months: [], cells: [] }` is a legitimate
 * response, not an error (the caller treats that the same as a fetch failure: fall back to demo).
 */
async function requestHistorical(
  region: RegionOption,
  aoiCode: string | null,
  signal?: AbortSignal
): Promise<HistoricalCalendarResponse> {
  // A kabupaten/kecamatan area (exact polygon/cell intersection) narrows the province filter.
  const query = aoiCode ? new URLSearchParams({ admin_code: aoiCode }).toString() : historicalQuery(region);
  const response = await fetch(`/api/historical${query ? `?${query}` : ""}`, { signal, cache: "no-store" });
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

// VIIRS (Suomi-NPP) enters the FIRMS archive on 2012-01-20 and, with the nominal+high filter,
// dominates every count after that (2011: 56k events, 2012: 307k). Multi-year comparisons below use
// 2012+ only so a sensor change is never read as a change in fire activity; the heatmap still shows
// every year, with a note.
const VIIRS_ERA_START_YEAR = 2012;

function CalendarPageContent() {
  const searchParams = useSearchParams();
  const activeRegion = getRegionOption(searchParams.get("region"));
  const activeRange = getRangeOption(searchParams.get("range"));
  const hasActiveFilters = searchParams.has("region") || searchParams.has("range") || searchParams.has("aoi");
  const router = useRouter();
  const pathname = usePathname();
  // Optional finer area of interest (kabupaten/kota or kecamatan p-code), kept in the URL so a
  // calendar for one area can be shared as a link.
  const aoiCode = searchParams.get("aoi");
  const aoiLabel = searchParams.get("aoiLabel");
  function setAoi(hit: AreaHit | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (hit) {
      params.set("aoi", hit.code);
      params.set("aoiLabel", hit.label);
    } else {
      params.delete("aoi");
      params.delete("aoiLabel");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }
  const areaKey = aoiCode ?? activeRegion.value;

  const archiveRange = isArchiveRange(searchParams.get("range"));
  // The anomaly check compares per-cell live counts with a DAILY baseline, so the live side stays
  // on the 24h window whatever range is picked — a 7d/30d sum against a daily mean would repeat
  // the unit-mismatch bug fixed earlier (see historical.py's docstring).
  const { data, error, loading } = useLiveHotspots("24h", { province: activeRegion.provinsi });
  const meta = data?.meta ?? null;
  const liveAreas = useMemo(
    () =>
      (data?.areas ?? []).filter((area) =>
        aoiCode
          ? // Live areas carry their dominant kecamatan; match it against the chosen area's p-code.
            Boolean(area.admin?.kecamatanCode?.startsWith(aoiCode))
          : matchesRegion(area.admin, activeRegion)
      ),
    [data, activeRegion, aoiCode]
  );
  // Exact total over every detection (markers are capped): raw MODIS + VIIRS per area.
  const liveDetectionTotal = useMemo(
    () => liveAreas.reduce((sum, area) => sum + (area.modisDetections ?? 0) + (area.viirsDetections ?? 0), 0),
    [liveAreas]
  );

  // Real multi-year archive data (months + per-cell baselines) — fetched once on mount. Falls
  // back to the DEMO_* constants below if this fails or comes back empty; see `hasRealMonths`.
  // `historicalLoading` starts true and stays true until the fetch actually settles, so the UI
  // shows a loading state rather than flashing DEMO_* data and then swapping to real data once
  // it arrives (historical was previously null during the fetch, which hasRealMonths read as
  // "no real data yet" and rendered the demo fallback for that whole window).
  const [historicalState, setHistoricalState] = useState<{ key: string; data: HistoricalCalendarResponse } | null>(null);
  const historicalLoading = historicalState?.key !== areaKey;
  const historical = useMemo(() => {
    if (historicalLoading || !historicalState) return null;
    if (!archiveRange) return historicalState.data;
    // Archive range: keep only Jan 2023 – Dec 2024 months (per-cell baselines stay multi-year).
    return {
      ...historicalState.data,
      months: historicalState.data.months.filter((m) => m.year >= 2023 && m.year <= 2024),
    };
  }, [historicalLoading, historicalState, archiveRange]);
  // The one cell a user has clicked to inspect its exact underlying numbers — lets insights
  // ("September ini 20% di atas rata-rata") link to the real data that produced them, instead
  // of ending at a sentence with no way to verify it.
  const [selectedCell, setSelectedCell] = useState<{ year: number; month: number } | null>(null);
  const heatmapRef = useRef<HTMLDivElement>(null);
  const [yearSpan, setYearSpan] = useState<5 | 10 | "all">(5);

  useEffect(() => {
    const controller = new AbortController();

    const key = areaKey;
    requestHistorical(activeRegion, aoiCode, controller.signal)
      .then((body) => setHistoricalState({ key, data: body }))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        console.error("Historical NASA FIRMS fetch failed, falling back to demo data", requestError);
        setHistoricalState({ key, data: { months: [], cells: [] } });
      });

    return () => controller.abort();
  }, [activeRegion, aoiCode, areaKey]);

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
  // Heatmap rows only — insights/baselines above still use every year in `activeYears`.
  const heatmapYears = yearSpan === "all" ? activeYears : activeYears.slice(-yearSpan);

  // Real baseline: latest archive month vs the average of that same calendar month in prior
  // years — no invented numbers, pure arithmetic over `historical.months`.
  const realBaseline = useMemo(() => {
    if (!historical || historical.months.length === 0) return null;
    const sorted = [...historical.months].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
    const latest = sorted[sorted.length - 1];
    const sameMonthPrevYears = sorted.filter(
      (entry) => entry.month === latest.month && entry.year < latest.year && entry.year >= VIIRS_ERA_START_YEAR
    );
    if (sameMonthPrevYears.length === 0) return null;

    const baselineValue =
      sameMonthPrevYears.reduce((sum, entry) => sum + entry.detections, 0) / sameMonthPrevYears.length;
    const deviationPct = baselineValue > 0 ? Math.round(((latest.detections - baselineValue) / baselineValue) * 100) : null;

    return {
      monthLabel: DEMO_MONTH_LABELS[latest.month - 1],
      month: latest.month,
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

    // Live per-cell counts from the backend's areas: harmonized events (a MODIS+VIIRS pair counts
    // once) over EVERY detection — the same counting basis as the archive's daily `detections`.
    // (Counting raw markers here double-counted matched pairs, and markers are now capped.)
    const liveCountByKey = new Map<string, number>();
    for (const area of liveAreas) {
      if (area.detections === null) continue;
      liveCountByKey.set(`${area.gridLat.toFixed(2)},${area.gridLon.toFixed(2)}`, area.detections);
    }

    let matchedCells = 0;
    let unusualCells = 0;
    for (const [key, count] of liveCountByKey) {
      const cell = cellByKey.get(key);
      // Compare like-with-like: `count` is a single day's detections (live
      // snapshot, windowHours=24), so it must be measured against the
      // cell's DAILY baseline, not its monthly one — comparing against
      // monthlyMeanDetections/monthlyStdDetections mixed day vs. month
      // units and was a real bug (see historical.py's docstring).
      if (!cell || cell.dailyStdDetections === null) continue;
      matchedCells += 1;
      if (count > cell.dailyMeanDetections + 2 * cell.dailyStdDetections) unusualCells += 1;
    }

    return { matchedCells, unusualCells };
  }, [historical, liveAreas]);

  // Real aggregate peak month across every real year available, used by the insight panel below
  // instead of the hardcoded "Agustus–September" demo claim.
  const realPeakMonthLabel = useMemo(() => {
    if (!hasRealMonths) return null;
    const totals = Array(12).fill(0);
    for (const year of realYears.filter((y) => y >= VIIRS_ERA_START_YEAR)) {
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

  // Multiple real, independently-computed insights (not one hardcoded sentence) — each one is
  // pure arithmetic over `historical.months`, and is simply omitted if the archive doesn't have
  // enough years to support that specific comparison. This is the set an officer actually wants
  // before/during the fire season: where's the current month, is next month likely to stay high,
  // which year was the worst for this month historically, and is anything live right now already
  // outside the historical envelope for its grid cell.
  type InsightTarget = { kind: "cell"; year: number; month: number } | { kind: "map" };

  const historicalInsights = useMemo(() => {
    if (!hasRealMonths || !historical || historical.months.length === 0) return [];
    const insights: { icon: string; text: string; target?: InsightTarget }[] = [];
    const sorted = [...historical.months].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
    const latest = sorted[sorted.length - 1];
    const latestMonthLabel = DEMO_MONTH_LABELS[latest.month - 1];

    // 1) Peak month overall across the whole archive. Links to the single real year that had
    // the highest value for that peak month, as one concrete example contributing to the claim
    // (the claim itself is an aggregate across all years, not any one cell).
    if (realPeakMonthLabel) {
      const peakMonthIndex = DEMO_MONTH_LABELS.indexOf(realPeakMonthLabel) + 1;
      const peakMonthEntries = sorted.filter((entry) => entry.month === peakMonthIndex);
      const peakMonthBestEntry =
        peakMonthEntries.length > 0
          ? peakMonthEntries.reduce((max, entry) => (entry.detections > max.detections ? entry : max))
          : null;
      insights.push({
        icon: "insights",
        text: `${realPeakMonthLabel} secara historis adalah bulan paling aktif, dihitung dari total deteksi ${Math.max(activeYears[0], VIIRS_ERA_START_YEAR)}–${activeYears[activeYears.length - 1]} (era MODIS + VIIRS).`,
        target: peakMonthBestEntry ? { kind: "cell", year: peakMonthBestEntry.year, month: peakMonthBestEntry.month } : undefined,
      });
    }

    // 2) Current/latest archived month vs. its own historical baseline (reuses realBaseline).
    if (realBaseline && realBaseline.deviationPct !== null) {
      const direction = realBaseline.deviationPct > 0 ? "lebih tinggi" : "lebih rendah";
      insights.push({
        icon: realBaseline.deviationPct > 0 ? "trending_up" : "trending_down",
        text: `${realBaseline.monthLabel} ${realBaseline.year}: ${realBaseline.current.toLocaleString("id-ID")} deteksi, ${Math.abs(realBaseline.deviationPct)}% ${direction} dari rata-rata ${realBaseline.monthLabel} ${realBaseline.firstYear}–${realBaseline.lastYear} (${realBaseline.baseline.toLocaleString("id-ID")} deteksi).`,
        target: { kind: "cell", year: realBaseline.year, month: realBaseline.month },
      });
    }

    // 3) Which specific year had the worst value for this same calendar month historically.
    const sameMonthEntries = sorted.filter((entry) => entry.month === latest.month);
    if (sameMonthEntries.length > 1) {
      const peakEntry = sameMonthEntries.reduce((max, entry) => (entry.detections > max.detections ? entry : max));
      insights.push({
        icon: "history",
        text: `Fase tertinggi untuk bulan ${latestMonthLabel} dalam arsip terjadi di tahun ${peakEntry.year}, dengan ${peakEntry.detections.toLocaleString("id-ID")} deteksi.`,
        target: { kind: "cell", year: peakEntry.year, month: peakEntry.month },
      });
    }

    // 4) Forward-look: historical average for next calendar month vs. this month, so an officer
    // sees whether the season is historically still climbing or past its peak.
    const nextMonthNum = (latest.month % 12) + 1;
    const nextMonthLabel = DEMO_MONTH_LABELS[nextMonthNum - 1];
    const inEra = (entry: { year: number }) => entry.year >= VIIRS_ERA_START_YEAR && entry.year <= latest.year;
    const nextMonthEntries = sorted.filter((entry) => entry.month === nextMonthNum && inEra(entry));
    const thisMonthEntries = sorted.filter((entry) => entry.month === latest.month && inEra(entry));
    if (nextMonthEntries.length > 0 && thisMonthEntries.length > 0) {
      const nextAvg = nextMonthEntries.reduce((sum, e) => sum + e.detections, 0) / nextMonthEntries.length;
      const thisAvg = thisMonthEntries.reduce((sum, e) => sum + e.detections, 0) / thisMonthEntries.length;
      const pct = thisAvg > 0 ? Math.round(((nextAvg - thisAvg) / thisAvg) * 100) : 0;
      const mostRecentNextMonthEntry = nextMonthEntries[nextMonthEntries.length - 1];
      insights.push({
        icon: pct >= 0 ? "warning" : "south",
        text:
          pct >= 10
            ? `Secara historis, ${nextMonthLabel} rata-rata ${Math.round(pct)}% lebih tinggi dari ${latestMonthLabel} (dari ${nextMonthEntries.length} tahun data) — waspadai kelanjutan tren musim kebakaran ke bulan berikutnya.`
            : pct <= -10
              ? `Secara historis, aktivitas cenderung turun ${Math.abs(Math.round(pct))}% memasuki ${nextMonthLabel} dibanding ${latestMonthLabel} (dari ${nextMonthEntries.length} tahun data).`
              : `Secara historis, ${nextMonthLabel} berada pada tingkat yang mirip dengan ${latestMonthLabel} (selisih rata-rata ${Math.abs(Math.round(pct))}%, dari ${nextMonthEntries.length} tahun data) — belum ada tanda penurunan signifikan.`,
        target: { kind: "cell", year: mostRecentNextMonthEntry.year, month: mostRecentNextMonthEntry.month },
      });
    }

    // 5) Live anomaly cells today, same arithmetic as the "Area dengan Aktivitas Tidak Biasa" stat tile.
    // Underlying data for THIS insight is the live feed (not the archive), so it links to /map.
    if (unusualAreas && unusualAreas.matchedCells > 0) {
      insights.push({
        icon: "travel_explore",
        text:
          unusualAreas.unusualCells > 0
            ? `${unusualAreas.unusualCells} dari ${unusualAreas.matchedCells} sel grid dengan deteksi live hari ini sudah berada di atas baseline historisnya (>2×std harian) — prioritaskan verifikasi di sel tersebut.`
            : `Tidak ada sel grid dengan deteksi live hari ini yang melebihi baseline historisnya saat ini (dari ${unusualAreas.matchedCells} sel yang punya riwayat arsip).`,
        target: { kind: "map" },
      });
    }

    return insights;
  }, [hasRealMonths, historical, realPeakMonthLabel, realBaseline, unusualAreas, activeYears]);

  function jumpToCell(year: number, month: number) {
    setSelectedCell({ year, month });
    // An insight can point at a year outside the visible span — widen just enough to show it.
    const latestYear = activeYears[activeYears.length - 1];
    if (yearSpan !== "all" && latestYear - year >= yearSpan) setYearSpan("all");
    heatmapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Exact numbers for the currently-selected heatmap cell, looked up from the same
  // `historical.months` data the heatmap/insights are built from — not recomputed or guessed.
  const selectedCellDetail = useMemo(() => {
    if (!selectedCell || !historical) return null;
    return historical.months.find((m) => m.year === selectedCell.year && m.month === selectedCell.month) ?? null;
  }, [selectedCell, historical]);

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
            Wilayah: {aoiCode ? aoiLabel ?? aoiCode : activeRegion.label}
          </span>
          <span className="h-8 px-3 inline-flex items-center bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm">
            Periode arsip: {archiveRange ? activeRange.label : "Seluruh arsip (2000–2026)"}
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

        {/* Area of interest — narrow the calendar to one kabupaten/kota or kecamatan */}
        <Card className="p-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="md:w-72 shrink-0">
            <p className="text-sm font-bold text-gray-900">Area analisis</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {aoiCode
                ? `${aoiLabel ?? aoiCode} — sel grid 0,25° yang beririsan dengan batas wilayahnya.`
                : `${activeRegion.label}. Persempit ke kabupaten/kota atau kecamatan:`}
            </p>
          </div>
          <div className="flex-1 min-w-0">
            <AreaSearch onPick={(hit) => setAoi(hit)} />
          </div>
          {aoiCode && (
            <button
              type="button"
              onClick={() => setAoi(null)}
              className="shrink-0 h-9 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Kembali ke {activeRegion.label}
            </button>
          )}
        </Card>

        {activeRange.window !== null && activeRange.window !== "24h" && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-900">
            <span className="material-symbols-outlined text-blue-600 text-base shrink-0">info</span>
            <p>
              Kalender ini menampilkan arsip bulanan, jadi rentang &quot;{activeRange.label}&quot; tidak mengubahnya.
              Statistik live tetap 24 jam karena dibandingkan dengan baseline harian per sel. Rentang ini berlaku di
              Dashboard, Map, Analytics, dan Priority Areas.
            </p>
          </div>
        )}

        {/* Live stat (always real) + baseline/deviation/anomaly stats — real once `historical`
            loads with data, demo-labeled fallback otherwise. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            icon="local_fire_department"
            iconTone="red"
            label="Deteksi 24 Jam Terakhir (Live)"
            value={loading ? "…" : liveDetectionTotal.toLocaleString("id-ID")}
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
              historicalLoading
                ? "Baseline Historis"
                : realBaseline
                  ? `Baseline Historis ${realBaseline.monthLabel}`
                  : `Baseline Historis ${DEMO_BASELINE_MONTH_LABEL} (Contoh)`
            }
            value={
              historicalLoading
                ? "…"
                : (realBaseline ? realBaseline.baseline : DEMO_BASELINE_REFERENCE).toLocaleString("id-ID")
            }
            caption={
              historicalLoading
                ? "Memuat arsip historis…"
                : realBaseline
                  ? `Rata-rata ${realBaseline.monthLabel} ${realBaseline.firstYear}–${realBaseline.lastYear} — arsip NASA FIRMS nyata`
                  : "Rata-rata 2023–2025 — data ilustratif, lihat catatan sumber di kode"
            }
          />
          <StatTile
            icon="warning"
            iconTone="amber"
            label={historicalLoading ? "Deviasi dari Baseline" : realBaseline ? "Deviasi dari Baseline" : "Deviasi dari Baseline (Contoh)"}
            value={
              historicalLoading
                ? "…"
                : realBaseline && realBaseline.deviationPct !== null
                  ? `${realBaseline.deviationPct > 0 ? "+" : ""}${realBaseline.deviationPct}%`
                  : realBaseline
                    ? "—"
                    : `${DEMO_BASELINE_DEVIATION_PCT > 0 ? "+" : ""}${DEMO_BASELINE_DEVIATION_PCT}%`
            }
            trend={
              historicalLoading
                ? undefined
                : realBaseline
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
              historicalLoading
                ? "Memuat arsip historis…"
                : realBaseline
                  ? `${realBaseline.monthLabel} ${realBaseline.year} vs rata-rata ${realBaseline.firstYear}–${realBaseline.lastYear} — data arsip nyata`
                  : `${DEMO_BASELINE_MONTH_LABEL} 2026 (contoh) vs rata-rata 2023–2025 — bukan kondisi real-time aktual`
            }
          />
          <StatTile
            icon="travel_explore"
            iconTone="amber"
            label="Area dengan Aktivitas Tidak Biasa"
            value={historicalLoading ? "…" : unusualAreas ? unusualAreas.unusualCells.toLocaleString("id-ID") : "—"}
            caption={
              historicalLoading
                ? "Memuat arsip historis…"
                : unusualAreas
                  ? `dari ${unusualAreas.matchedCells.toLocaleString("id-ID")} sel 0.25° dengan deteksi live hari ini • deteksi hari ini > rata-rata harian + 2×std sel (baseline arsip nyata)`
                  : "Data baseline per-sel belum tersedia"
            }
          />
        </div>

        {historicalLoading ? (
          <Card className="p-10 flex items-center justify-center">
            <span className="text-sm text-gray-400 animate-pulse flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
              Memuat arsip historis NASA FIRMS…
            </span>
          </Card>
        ) : (
          <>
            {/* Yearly Activity Overview + Insight & rekomendasi — moved above the calendar heatmap
                per user request, so the summary/recommendations are seen before the raw grid. */}
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
                    href={withFilters("/analytics", searchParams)}
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

                <div className="space-y-2.5 mb-4">
                  <h4 className="text-sm font-semibold text-[#b91c1c]">Insight historis</h4>
                  {hasRealMonths && historicalInsights.length > 0 ? (
                    <ul className="space-y-2">
                      {historicalInsights.map((insight, index) => (
                        <li key={index} className="flex items-start gap-2.5 text-[13px] leading-[18px] text-red-900/80">
                          <span className="material-symbols-outlined text-red-600 text-base shrink-0 leading-5">{insight.icon}</span>
                          <span>
                            {insight.text}{" "}
                            {insight.target?.kind === "cell" && (
                              <button
                                type="button"
                                onClick={() => jumpToCell((insight.target as { kind: "cell"; year: number; month: number }).year, (insight.target as { kind: "cell"; year: number; month: number }).month)}
                                className="font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2"
                              >
                                Lihat data mentahnya →
                              </button>
                            )}
                            {insight.target?.kind === "map" && (
                              <Link href={withFilters("/map", searchParams)} className="font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2">
                                Lihat di peta →
                              </Link>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] leading-[18px] text-red-900/80">
                      Agustus–September menjadi puncak aktivitas pada contoh data 2023–2026 ini. Pola berulang seperti
                      ini membantu menentukan waktu prioritas pemantauan. Aktivitas lebih rendah di luar puncak tidak
                      berarti bebas risiko.
                    </p>
                  )}
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
                    {hasRealMonths && unusualAreas && unusualAreas.unusualCells > 0 && (
                      <li className="flex items-start gap-2.5 text-[13px] text-red-900/80">
                        <span className="material-symbols-outlined text-red-600 text-base shrink-0 leading-5">priority_high</span>
                        Saat ini: {unusualAreas.unusualCells} sel grid sudah di atas baseline historisnya hari ini — prioritaskan verifikasi di sel tersebut lebih dulu.
                      </li>
                    )}
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

            {/* Burning Activity Calendar — heatmap */}
            <Card className="p-6">
              <div ref={heatmapRef} className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 text-sm">Burning Activity Calendar</h3>
                    {!hasRealMonths && <DemoBadge />}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {hasRealMonths
                      ? `Pola historis aktivitas kebakaran, ${heatmapYears[0]}–${heatmapYears[heatmapYears.length - 1]} (arsip NASA FIRMS nyata). Klik satu sel untuk melihat angka pastinya.`
                      : "Historical pattern of fire activity in this area."}
                  </p>
                </div>
                {activeYears.length > 5 && (
                  <div role="group" aria-label="Rentang tahun" className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 text-xs font-semibold">
                    {([
                      [5, "5 tahun"],
                      [10, "10 tahun"],
                      ["all", `Semua (${activeYears.length})`],
                    ] as [5 | 10 | "all", string][])
                      .filter(([span]) => span === "all" || span < activeYears.length)
                      .map(([span, label]) => (
                        <button
                          key={String(span)}
                          type="button"
                          aria-pressed={yearSpan === span}
                          onClick={() => setYearSpan(span)}
                          className={`rounded-md px-2.5 py-1.5 transition-colors ${
                            yearSpan === span ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {hasRealMonths ? (
                <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/60 px-3 py-2 mb-5 text-xs text-blue-900">
                  Data arsip NASA FIRMS nyata ({activeYears[0]}–{activeYears[activeYears.length - 1]}). Catatan metodologi:
                  filter tipe vegetasi (type==0) hanya berlaku pada baris arsip — baris NRT tidak memiliki kolom ini,
                  jadi bulan-bulan terbaru bisa menyertakan anomali termal non-vegetasi yang disaring di bulan-bulan
                  lama. <strong>Mulai 20 Januari 2012 VIIRS ikut terhitung</strong> (sebelumnya hanya MODIS), sehingga
                  angka sebelum 2012 jauh lebih kecil dan tidak bisa dibandingkan langsung dengan sesudahnya — semua
                  perbandingan antar-tahun dan baseline per sel di halaman ini hanya memakai data 2012 ke atas.
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
                  {[...heatmapYears].reverse().map((year) => (
                    <div key={year} className="flex items-center mb-2 gap-2">
                      <span className="text-xs text-gray-500 w-8 font-semibold shrink-0">{year}</span>
                      <div className="flex gap-2 flex-1">
                        {activeMonthlyIntensity[year].map((value, monthIndex) => {
                          const bucket = getIntensityBucket(value);
                          const month = monthIndex + 1;
                          const isSelected = hasRealMonths && selectedCell?.year === year && selectedCell?.month === month;
                          const clickable = hasRealMonths && value !== null;
                          return (
                            <button
                              key={monthIndex}
                              type="button"
                              disabled={!clickable}
                              onClick={() => clickable && jumpToCell(year, month)}
                              className={`flex-1 h-10 rounded-md hover:ring-2 hover:ring-offset-2 transition-all ${
                                isSelected
                                  ? "ring-2 ring-offset-2 ring-emerald-600"
                                  : "hover:ring-gray-300"
                              } ${clickable ? "cursor-pointer" : "cursor-default"}`}
                              style={{ backgroundColor: bucket.bg }}
                              title={
                                value === null
                                  ? `${DEMO_MONTH_LABELS[monthIndex]} ${year}: belum ada data`
                                  : hasRealMonths
                                    ? `${DEMO_MONTH_LABELS[monthIndex]} ${year}: ${value.toLocaleString("id-ID")} deteksi — klik untuk detail`
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

              {/* Selected cell detail — exact numbers behind the clicked sel, straight from
                  historical.months, so insights/heatmap cells are never a dead-end sentence. */}
              {selectedCell && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-bold text-gray-900">
                      {DEMO_MONTH_LABELS[selectedCell.month - 1]} {selectedCell.year} — data mentah
                    </h4>
                    <button
                      type="button"
                      onClick={() => setSelectedCell(null)}
                      className="text-gray-400 hover:text-gray-700"
                      aria-label="Tutup detail sel"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                  {selectedCellDetail ? (
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="text-gray-400">Total deteksi</div>
                        <div className="font-bold text-gray-900">{selectedCellDetail.detections.toLocaleString("id-ID")}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">MODIS</div>
                        <div className="font-bold text-gray-900">{selectedCellDetail.modisDetections.toLocaleString("id-ID")}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">VIIRS</div>
                        <div className="font-bold text-gray-900">{selectedCellDetail.viirsDetections.toLocaleString("id-ID")}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">Total FRP</div>
                        <div className="font-bold text-gray-900">{selectedCellDetail.frpSum.toLocaleString("id-ID")} MW</div>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">Tidak ada data arsip untuk sel ini.</p>
                  )}
                  <p className="mt-2 text-[11px] text-gray-400">
                    Angka ini total untuk wilayah {activeRegion.label} pada bulan tersebut, dari arsip NASA FIRMS yang sama dengan heatmap di atas — bukan dihitung ulang.
                  </p>
                </div>
              )}

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
          </>
        )}

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
