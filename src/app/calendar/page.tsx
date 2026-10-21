"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AreaSearch, { type AreaHit } from "@/components/AreaSearch";
import { cellTouchesPolygon, decodePolygon, encodePolygon, polygonAreaKm2, type LatLon } from "@/lib/aoiPolygon";
import dynamic from "next/dynamic";

// Leaflet touches `window`, so the drawing map is client-only.
const AoiDrawMap = dynamic(() => import("@/components/map/AoiDrawMap"), { ssr: false });
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import { getRegionOption, getRangeOption, historicalQuery, isArchiveRange, matchesRegion, type RegionOption, withFilters, labelOf } from "@/lib/filters";
import { useLiveHotspots } from "@/lib/useLiveHotspots";
import type { HistoricalCalendarResponse, LiveMonthsResponse, UnusualComparisonResponse } from "@/types";
import {
  CRITICAL_MONTH_FACTOR,
  calendarCsv,
  criticalPeriod,
  findUnusualMonths,
  isProvisional,
  mergeLiveMonths,
  monthsUntil,
  seriesValue,
  type SeriesKey,
} from "@/lib/calendarSeries";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import InfoNote from "@/components/ui/InfoNote";

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

const MONTH_LABELS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LABELS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

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
const INTENSITY_NO_DATA: IntensityBucket = { label: "Belum ada data|No data", bg: "#f1f5f9", text: "#94a3b8" };
const INTENSITY_BUCKETS: IntensityBucket[] = [
  { label: "0 - 500", bg: "#fff7e8", text: "#202b3c" },
  { label: "500 - 2k", bg: "#ffe8b5", text: "#202b3c" },
  { label: "2k - 5k", bg: "#f5d3b3", text: "#202b3c" },
  { label: "5k - 15k", bg: "#f07836", text: "#ffffff" },
  { label: "> 15k", bg: "#a91d22", text: "#ffffff" },
];
const INTENSITY_THRESHOLDS = [500, 2000, 5000, 15000];
// MODIS-only counts are about 1/5 of MODIS + VIIRS in the same months (VIIRS-era archive), so the
// comparable series gets thresholds 5x lower; otherwise almost every MODIS-only cell would sit in
// the palest bucket.
const MODIS_ONLY_THRESHOLDS = [100, 400, 1000, 3000];

function getIntensityBucket(value: number | null, thresholds: number[] = INTENSITY_THRESHOLDS): IntensityBucket {
  if (value === null) return INTENSITY_NO_DATA;
  const bucketIndex = thresholds.findIndex((threshold) => value <= threshold);
  return bucketIndex === -1 ? INTENSITY_BUCKETS[INTENSITY_BUCKETS.length - 1] : INTENSITY_BUCKETS[bucketIndex];
}

function shortCount(value: number): string {
  return value >= 1000 ? `${value / 1000}k` : String(value);
}

/** Legend label of bucket `index` for the active thresholds ("0 – 100", ..., "> 3k"). */
function bucketLabel(index: number, thresholds: number[]): string {
  if (index === 0) return `0 – ${shortCount(thresholds[0])}`;
  if (index >= thresholds.length) return `> ${shortCount(thresholds[thresholds.length - 1])}`;
  return `${shortCount(thresholds[index - 1])} – ${shortCount(thresholds[index])}`;
}

/** Works for either DEMO_MONTHLY_INTENSITY[year] or a real per-year array built from `months`. */
function summarizeYear(months: (number | null)[], monthLabels: string[], thresholds: number[] = INTENSITY_THRESHOLDS) {
  const observed = months.filter((value): value is number => value !== null);
  const total = observed.reduce((sum, value) => sum + value, 0);

  const maxValue = Math.max(...observed);
  const peakIndex = months.indexOf(maxValue);
  const prevValue = peakIndex > 0 ? (months[peakIndex - 1] ?? -1) : -1;
  const nextValue = peakIndex < months.length - 1 ? (months[peakIndex + 1] ?? -1) : -1;
  const secondIndex = prevValue >= nextValue ? peakIndex - 1 : peakIndex + 1;
  const peakRange = [peakIndex, secondIndex].filter((index) => index >= 0 && index < 12).sort((a, b) => a - b);
  const peakLabel = peakRange.map((index) => monthLabels[index]).join(" – ");

  // Proportion of observed months landing in each intensity bucket, used to draw the segmented bar.
  const bucketShares = INTENSITY_BUCKETS.map((bucket) => {
    const count = months.filter((value) => value !== null && getIntensityBucket(value, thresholds) === bucket).length;
    return observed.length > 0 ? (count / observed.length) * 100 : 0;
  });

  return { total, peakLabel, bucketShares };
}

/** The area every calendar request is for: a drawn polygon, else an admin p-code, else the region. */
interface AreaSelection {
  code: string | null;
  polygon: string | null;
}

function areaQuery(region: RegionOption, aoi: AreaSelection): string {
  if (aoi.polygon) return new URLSearchParams({ polygon: aoi.polygon }).toString();
  if (aoi.code) return new URLSearchParams({ admin_code: aoi.code }).toString();
  return historicalQuery(region);
}

/**
 * Real multi-year archive data from the Python pipeline (see src/app/api/historical/route.ts).
 * Never throws for an empty-but-valid store — `{ months: [], cells: [] }` is a legitimate
 * response, not an error (the caller treats that the same as a fetch failure: fall back to demo).
 */
async function requestHistorical(
  region: RegionOption,
  aoi: AreaSelection,
  signal?: AbortSignal
): Promise<HistoricalCalendarResponse> {
  // A kabupaten/kecamatan area (exact polygon/cell intersection) narrows the province filter.
  const query = areaQuery(region, aoi);
  const response = await fetch(`/api/historical${query ? `?${query}` : ""}`, { signal, cache: "no-store" });
  const body = (await response.json()) as HistoricalCalendarResponse & { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to load historical NASA FIRMS data.");
  }

  return { months: body.months ?? [], cells: body.cells ?? [], baseline: body.baseline, areaCells: body.areaCells };
}

/**
 * Live 24 h cells vs their own archive baseline, computed on the backend on a comparable sensor
 * population (MODIS + one VIIRS satellite, the same as the archive table) — see
 * python-service/fire_pipeline/historical.py compare_live_to_baseline().
 */
async function requestUnusual(region: RegionOption, aoi: AreaSelection, signal?: AbortSignal): Promise<UnusualComparisonResponse> {
  const query = areaQuery(region, aoi);
  const response = await fetch(`/api/historical/unusual${query ? `?${query}` : ""}`, { signal, cache: "no-store" });
  const body = (await response.json()) as UnusualComparisonResponse & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Unable to compare live data with the archive.");
  return body;
}

const SATELLITE_NAME: Record<string, string> = { SNPP: "Suomi-NPP", NOAA20: "NOAA-20" };

/** Months after the archive ends, from the live feed (python-service fire_pipeline/live_calendar.py). */
async function requestLiveMonths(region: RegionOption, aoi: AreaSelection, signal?: AbortSignal): Promise<LiveMonthsResponse> {
  const query = areaQuery(region, aoi);
  const response = await fetch(`/api/historical/live-months${query ? `?${query}` : ""}`, { signal, cache: "no-store" });
  const body = (await response.json()) as LiveMonthsResponse & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Unable to load live calendar months.");
  return body;
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
// Aqua MODIS joins Terra on 2002-07-04 (checked in the FIRMS archive file), so 2003 is the first
// full year of the two-satellite MODIS record; 2000-2002 are Terra-only and not comparable.
const FULL_MODIS_START_YEAR = 2003;

/**
 * Which record the calendar shows. "comparable" (default) = MODIS detections only: the same two
 * sensors from 2003 to 2026, so years can be compared with each other. "detail" = harmonized
 * MODIS + VIIRS events, which see far more small fires but only exist from 2012; mixing them with
 * the MODIS-only years before 2012 produced a fake five-fold jump in 2012 (2011: 56k events,
 * 2012: 307k, while MODIS alone went 56k -> 64k).
 */
type SeriesMode = "comparable" | "detail";

function CalendarPageContent() {
  const { tr, language } = useTranslation();
  const monthLabels = language === "en" ? MONTH_LABELS_EN : MONTH_LABELS_ID;
  const numLocale = language === "en" ? "en-US" : "id-ID";
  const searchParams = useSearchParams();
  const activeRegion = getRegionOption(searchParams.get("region"));
  const activeRange = getRangeOption(searchParams.get("range"));
  const hasActiveFilters = searchParams.has("region") || searchParams.has("range") || searchParams.has("aoi") || searchParams.has("aoiPolygon");
  const router = useRouter();
  const pathname = usePathname();
  // Optional finer area of interest (kabupaten/kota or kecamatan p-code), kept in the URL so a
  // calendar for one area can be shared as a link.
  const aoiCode = searchParams.get("aoi");
  const aoiLabel = searchParams.get("aoiLabel");
  // Or an area the user drew on the map ("lat,lon;..."), also in the URL. The two are exclusive.
  const aoiPolygon = searchParams.get("aoiPolygon");
  const aoiPoints = useMemo(() => decodePolygon(aoiPolygon), [aoiPolygon]);
  const [drawing, setDrawing] = useState(false);
  function setAoi(hit: AreaHit | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("aoiPolygon");
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
  function setAoiPolygon(points: LatLon[] | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("aoi");
    params.delete("aoiLabel");
    if (points) params.set("aoiPolygon", encodePolygon(points));
    else params.delete("aoiPolygon");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setDrawing(false);
  }
  const areaKey = aoiPolygon ? `polygon:${aoiPolygon}` : (aoiCode ?? activeRegion.value);
  const areaSelection = useMemo<AreaSelection>(() => ({ code: aoiCode, polygon: aoiPolygon }), [aoiCode, aoiPolygon]);

  const archiveRange = isArchiveRange(searchParams.get("range"));
  // The anomaly check compares per-cell live counts with a DAILY baseline, so the live side stays
  // on the 24h window whatever range is picked — a 7d/30d sum against a daily mean would repeat
  // the unit-mismatch bug fixed earlier (see historical.py's docstring).
  // A drawn area can cross province lines, so its live data is fetched nationally and filtered by cell.
  const { data, error, loading } = useLiveHotspots("24h", { province: aoiPoints ? undefined : activeRegion.provinsi });
  const meta = data?.meta ?? null;
  const liveAreas = useMemo(
    () =>
      (data?.areas ?? []).filter((area) =>
        aoiPoints
          ? cellTouchesPolygon(area.gridLat, area.gridLon, aoiPoints)
          : aoiCode
            ? // Live areas carry their dominant kecamatan; match it against the chosen area's p-code.
              Boolean(area.admin?.kecamatanCode?.startsWith(aoiCode))
            : matchesRegion(area.admin, activeRegion)
      ),
    [data, activeRegion, aoiCode, aoiPoints]
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
    requestHistorical(activeRegion, areaSelection, controller.signal)
      .then((body) => setHistoricalState({ key, data: body }))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        console.error("Historical NASA FIRMS fetch failed, falling back to demo data", requestError);
        setHistoricalState({ key, data: { months: [], cells: [] } });
      });

    return () => controller.abort();
  }, [activeRegion, areaSelection, areaKey]);

  // Live months (after the archive's last day) — loaded separately so the archive calendar never
  // waits for the live feed. Until they arrive the calendar simply ends where the archive ends.
  const [liveMonthsState, setLiveMonthsState] = useState<{ key: string; data: LiveMonthsResponse | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const key = areaKey;
    requestLiveMonths(activeRegion, areaSelection, controller.signal)
      .then((body) => setLiveMonthsState({ key, data: body }))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        console.warn("Live calendar months unavailable (calendar ends at the archive)", requestError);
        setLiveMonthsState({ key, data: null });
      });
    return () => controller.abort();
  }, [activeRegion, areaSelection, areaKey]);
  const liveMonthsLoading = liveMonthsState?.key !== areaKey;
  const liveMonths = liveMonthsLoading ? null : (liveMonthsState?.data ?? null);

  const mergedMonths = useMemo(() => (historical ? mergeLiveMonths(historical.months, liveMonths) : []), [historical, liveMonths]);

  const [series, setSeries] = useState<SeriesMode>("comparable");
  const seriesKey: SeriesKey = series === "comparable" ? "modisDetections" : "detections";
  const comparisonStartYear = series === "comparable" ? FULL_MODIS_START_YEAR : VIIRS_ERA_START_YEAR;
  const thresholds = series === "comparable" ? MODIS_ONLY_THRESHOLDS : INTENSITY_THRESHOLDS;
  // The months every calendar number below is computed from: `detections` is replaced by the
  // selected series (MODIS-only count, or harmonized MODIS + VIIRS events from 2012 on). Months
  // whose detail count is missing (Suomi-NPP feed incomplete) are dropped, i.e. shown as no data.
  const seriesMonths = useMemo(
    () =>
      mergedMonths
        .filter((entry) => series === "comparable" || entry.year >= VIIRS_ERA_START_YEAR)
        .map((entry) => ({ ...entry, detections: seriesValue(entry, seriesKey) }))
        .filter((entry): entry is typeof entry & { detections: number } => entry.detections !== null),
    [mergedMonths, series, seriesKey]
  );
  const unusualMonths = useMemo(
    () => findUnusualMonths(mergedMonths, seriesKey, comparisonStartYear),
    [mergedMonths, seriesKey, comparisonStartYear]
  );
  const critical = useMemo(() => criticalPeriod(mergedMonths, seriesKey, comparisonStartYear), [mergedMonths, seriesKey, comparisonStartYear]);

  // Where the drawing map opens: the middle of the selected province's archive cells (whole
  // Indonesia when no province is selected).
  const drawCenter = useMemo<LatLon | undefined>(() => {
    if (!activeRegion.provinsi || !historical || historical.cells.length === 0) return undefined;
    const lat = historical.cells.reduce((s, c) => s + c.gridLat, 0) / historical.cells.length + 0.125;
    const lon = historical.cells.reduce((s, c) => s + c.gridLon, 0) / historical.cells.length + 0.125;
    return [lat, lon];
  }, [activeRegion.provinsi, historical]);

  // Real per-year month arrays built from `seriesMonths`, same shape as DEMO_MONTHLY_INTENSITY
  // (12-length array indexed by month - 1, `null` = no data for that month).
  const realMonthlyIntensity = useMemo(() => {
    if (seriesMonths.length === 0) return null;
    const byYear: Record<number, (number | null)[]> = {};
    for (const entry of seriesMonths) {
      if (!byYear[entry.year]) byYear[entry.year] = Array(12).fill(null);
      byYear[entry.year][entry.month - 1] = entry.detections;
    }
    return byYear;
  }, [seriesMonths]);

  const realYears = useMemo(
    () => (realMonthlyIntensity ? Object.keys(realMonthlyIntensity).map(Number).sort((a, b) => a - b) : []),
    [realMonthlyIntensity]
  );

  const hasRealMonths = realMonthlyIntensity !== null && realYears.length > 0;

  // Months whose rows are (partly) provisional NRT data: shown, but marked, because NRT rows have no
  // vegetation-fire filter and are replaced once NASA publishes the standard archive.
  // Months with live days a feed failed to deliver for the selected series: shown empty, and the
  // tooltip says why, instead of a partial sum that would look like a quiet month.
  const incompleteMonths = useMemo(
    () => new Set(mergedMonths.filter((m) => seriesValue(m, seriesKey) === null).map((m) => `${m.year}-${m.month}`)),
    [mergedMonths, seriesKey]
  );

  const provisionalMonths = useMemo(() => {
    const map = new Map<string, { partialThroughDay?: number }>();
    for (const entry of mergedMonths) {
      if (isProvisional(entry)) map.set(`${entry.year}-${entry.month}`, { partialThroughDay: entry.partialThroughDay });
    }
    return map;
  }, [mergedMonths]);

  // The data actually rendered by the heatmap + yearly overview below — real archive data when
  // available, otherwise the illustrative DEMO_* fallback.
  const activeMonthlyIntensity = hasRealMonths ? realMonthlyIntensity! : DEMO_MONTHLY_INTENSITY;
  const activeYears = hasRealMonths ? realYears : DEMO_YEARS;
  // Heatmap rows only — insights/baselines above still use every year in `activeYears`.
  const heatmapYears = yearSpan === "all" ? activeYears : activeYears.slice(-yearSpan);

  // Real baseline: latest archive month vs the average of that same calendar month in prior
  // years — no invented numbers, pure arithmetic over `historical.months`.
  const realBaseline = useMemo(() => {
    if (seriesMonths.length === 0) return null;
    const sorted = [...seriesMonths].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
    const latest = sorted[sorted.length - 1];
    // Prior years of the same calendar month. A year with no row for that month recorded no
    // detections there, so it counts as 0 (only years the archive covers, from comparisonStartYear).
    const priorYears = realYears.filter((year) => year >= comparisonStartYear && year < latest.year);
    let priorValues: Map<number, number>;
    if (latest.partialThroughDay !== undefined) {
      // Month still running: compare with days 1..throughDay of the same month in earlier years.
      const mtd = liveMonths?.monthToDate;
      if (!mtd || mtd.year !== latest.year || mtd.month !== latest.month) return null;
      priorValues = new Map(mtd.prior.map((p) => [p.year, p[seriesKey]]));
    } else {
      priorValues = new Map(sorted.filter((entry) => entry.month === latest.month).map((entry) => [entry.year, entry.detections]));
    }
    const sameMonthPrevYears = priorYears.map((year) => ({ year, detections: priorValues.get(year) ?? 0 }));
    if (sameMonthPrevYears.length === 0) return null;

    const baselineValue =
      sameMonthPrevYears.reduce((sum, entry) => sum + entry.detections, 0) / sameMonthPrevYears.length;
    const deviationPct = baselineValue > 0 ? Math.round(((latest.detections - baselineValue) / baselineValue) * 100) : null;

    return {
      // "Oktober (1–20)" while the month is still running, so every sentence using it says so.
      monthLabel:
        latest.partialThroughDay !== undefined ? `${monthLabels[latest.month - 1]} (1–${latest.partialThroughDay})` : monthLabels[latest.month - 1],
      month: latest.month,
      year: latest.year,
      throughDay: latest.partialThroughDay,
      provisional: isProvisional(latest),
      current: latest.detections,
      baseline: Math.round(baselineValue),
      deviationPct,
      years: sameMonthPrevYears.length,
      firstYear: Math.min(...sameMonthPrevYears.map((entry) => entry.year)),
      lastYear: Math.max(...sameMonthPrevYears.map((entry) => entry.year)),
    };
  }, [seriesMonths, monthLabels, comparisonStartYear, realYears, liveMonths, seriesKey]);

  // Anomaly check, done on the backend since 2026-10-21 (audit_2026_10, P0): the live count per
  // cell comes from MODIS + the same single VIIRS satellite as the archive table, cells with fewer
  // than 10 archive days are reported separately, and NRT rows are left out of the baseline.
  // (Computing it here from `area.detections` compared up to three VIIRS satellites with a
  // Suomi-NPP-only baseline and flagged ~32% of cells instead of ~8%.)
  const [unusualState, setUnusualState] = useState<{ key: string; data: UnusualComparisonResponse | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const key = areaKey;
    requestUnusual(activeRegion, areaSelection, controller.signal)
      .then((body) => setUnusualState({ key, data: body }))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        console.warn("Live-vs-archive comparison unavailable (shown as such in the tile)", requestError);
        setUnusualState({ key, data: null });
      });
    return () => controller.abort();
  }, [activeRegion, areaSelection, areaKey]);
  const unusualLoading = unusualState?.key !== areaKey;
  const unusual = unusualLoading ? null : (unusualState?.data ?? null);
  const unusualAreas = useMemo(
    () =>
      unusual?.comparable && unusual.summary
      ? {
          matchedCells: unusual.summary.comparedCells,
          unusualCells: unusual.summary.unusualCells,
          insufficientCells: unusual.summary.insufficientHistoryCells,
          noHistoryCells: unusual.summary.noHistoryCells,
          notSeenCells: unusual.summary.notSeenByReferenceCells,
          fallbackCells: unusual.summary.fallbackBaselineCells ?? 0,
          // Previous, current and next month in calendar order ("Des–Feb" for January).
          seasonMonths: unusual.baseline?.seasonal
            ? [((unusual.baseline.seasonal.month + 10) % 12) + 1, ((unusual.baseline.seasonal.month % 12) + 1)]
            : null,
          satellite: SATELLITE_NAME[unusual.reference ?? ""] ?? unusual.reference ?? "",
        }
      : null,
    [unusual]
  );

  // Real aggregate peak month across every real year available, used by the insight panel below
  // instead of the hardcoded "Agustus–September" demo claim.
  const realPeakMonthLabel = useMemo(() => {
    if (!hasRealMonths) return null;
    // Settled months only: provisional (NRT / live / unfinished) months would skew the totals.
    const totals = Array(12).fill(0);
    for (const entry of seriesMonths) {
      if (entry.year >= comparisonStartYear && !isProvisional(entry)) totals[entry.month - 1] += entry.detections;
    }
    const maxValue = Math.max(...totals);
    const peakIndex = totals.indexOf(maxValue);
    return monthLabels[peakIndex];
  }, [hasRealMonths, seriesMonths, monthLabels, comparisonStartYear]);

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
    if (!hasRealMonths || seriesMonths.length === 0) return [];
    const insights: { icon: string; text: string; target?: InsightTarget }[] = [];
    const sorted = [...seriesMonths].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
    const latest = sorted[sorted.length - 1];
    const latestMonthLabel = monthLabels[latest.month - 1];
    // Year-against-year comparisons below only use settled months (not NRT / live / unfinished).
    const settled = sorted.filter((entry) => !isProvisional(entry));

    // 1) Peak month overall across the whole archive. Links to the single real year that had
    // the highest value for that peak month, as one concrete example contributing to the claim
    // (the claim itself is an aggregate across all years, not any one cell).
    if (realPeakMonthLabel) {
      const peakMonthIndex = monthLabels.indexOf(realPeakMonthLabel) + 1;
      const peakMonthEntries = sorted.filter((entry) => entry.month === peakMonthIndex);
      const peakMonthBestEntry =
        peakMonthEntries.length > 0
          ? peakMonthEntries.reduce((max, entry) => (entry.detections > max.detections ? entry : max))
          : null;
      insights.push({
        icon: "insights",
        text: tr(
          `${realPeakMonthLabel} adalah bulan paling aktif (${Math.max(activeYears[0], comparisonStartYear)}–${activeYears[activeYears.length - 1]}).`,
          `${realPeakMonthLabel} is the most active month (${Math.max(activeYears[0], comparisonStartYear)}–${activeYears[activeYears.length - 1]}).`
        ),
        target: peakMonthBestEntry ? { kind: "cell", year: peakMonthBestEntry.year, month: peakMonthBestEntry.month } : undefined,
      });
    }

    // Critical period: the months that usually carry the season (see lib/calendarSeries.ts), and
    // where today falls relative to it -- the "anticipate critical periods" part of the brief.
    if (critical) {
      const rangeLabel = (range: number[]) =>
        range.length === 1 ? monthLabels[range[0] - 1] : `${monthLabels[range[0] - 1]}–${monthLabels[range[range.length - 1] - 1]}`;
      const ranges = critical.ranges.map(rangeLabel).join(", ");
      const share = Math.round(critical.share * 100);
      const nowMonth = new Date().getUTCMonth() + 1;
      const inside = critical.months.includes(nowMonth);
      const currentRange = critical.ranges.find((range) => range.includes(nowMonth));
      const nextStart = critical.ranges
        .map((range) => range[0])
        .sort((a, b) => monthsUntil(nowMonth, a) - monthsUntil(nowMonth, b))[0];
      const ahead = monthsUntil(nowMonth, nextStart);
      const timing = inside
        ? tr(
            `Sekarang masuk periode kritis, biasanya sampai ${monthLabels[currentRange![currentRange!.length - 1] - 1]}.`,
            `We are in the critical period now, usually until ${monthLabels[currentRange![currentRange!.length - 1] - 1]}.`
          )
        : tr(
            `Periode kritis berikutnya mulai ${monthLabels[nextStart - 1]}, ${ahead} bulan lagi.`,
            `The next critical period starts in ${monthLabels[nextStart - 1]}, ${ahead} month${ahead === 1 ? "" : "s"} from now.`
          );
      insights.push({
        icon: "event_upcoming",
        text: tr(
          `Periode kritis: ${ranges} (${share}% kejadian setahun). ${timing}`,
          `Critical period: ${ranges} (${share}% of a year's events). ${timing}`
        ),
      });
    }

    // Unusual months in the record: far above the same month in the other years.
    if (unusualMonths.size > 0) {
      const ranked = [...unusualMonths.values()].sort((a, b) => b.value / b.mean - a.value / a.mean);
      const named = ranked
        .slice(0, 3)
        .map((u) => `${monthLabels[u.month - 1]} ${u.year} (${(u.value / u.mean).toLocaleString(numLocale, { maximumFractionDigits: 1 })}×)`)
        .join(", ");
      insights.push({
        icon: "error",
        text: tr(
          `${unusualMonths.size} bulan jauh di atas normal (titik merah). Paling tinggi: ${named}.`,
          `${unusualMonths.size} months far above normal (red dot). Highest: ${named}.`
        ),
        target: { kind: "cell", year: ranked[0].year, month: ranked[0].month },
      });
    }

    // 2) Current/latest archived month vs. its own historical baseline (reuses realBaseline).
    if (realBaseline && realBaseline.deviationPct !== null) {
      const direction = realBaseline.deviationPct > 0 ? tr("lebih tinggi", "higher") : tr("lebih rendah", "lower");
      insights.push({
        icon: realBaseline.deviationPct > 0 ? "trending_up" : "trending_down",
        text: tr(
          `${realBaseline.monthLabel} ${realBaseline.year}: ${realBaseline.current.toLocaleString(numLocale)} deteksi, ${Math.abs(realBaseline.deviationPct)}% ${direction} dari biasanya (${realBaseline.baseline.toLocaleString(numLocale)}).${realBaseline.provisional ? " Data sementara (NRT)." : ""}`,
          `${realBaseline.monthLabel} ${realBaseline.year}: ${realBaseline.current.toLocaleString(numLocale)} detections, ${Math.abs(realBaseline.deviationPct)}% ${direction} than usual (${realBaseline.baseline.toLocaleString(numLocale)}).${realBaseline.provisional ? " Provisional data (NRT)." : ""}`
        ),
        target: { kind: "cell", year: realBaseline.year, month: realBaseline.month },
      });
    }

    // 3) Which specific year had the worst value for this same calendar month historically.
    const sameMonthEntries = settled.filter((entry) => entry.month === latest.month && entry.year >= comparisonStartYear);
    if (sameMonthEntries.length > 1) {
      const peakEntry = sameMonthEntries.reduce((max, entry) => (entry.detections > max.detections ? entry : max));
      insights.push({
        icon: "history",
        text: tr(
          `${latestMonthLabel} tertinggi: tahun ${peakEntry.year}, ${peakEntry.detections.toLocaleString(numLocale)} deteksi.`,
          `The highest ${latestMonthLabel} on record was in ${peakEntry.year}, with ${peakEntry.detections.toLocaleString(numLocale)} detections.`
        ),
        target: { kind: "cell", year: peakEntry.year, month: peakEntry.month },
      });
    }

    // 4) Forward-look: historical average for next calendar month vs. this month, so an officer
    // sees whether the season is historically still climbing or past its peak.
    const nextMonthNum = (latest.month % 12) + 1;
    const nextMonthLabel = monthLabels[nextMonthNum - 1];
    const inEra = (entry: { year: number }) => entry.year >= comparisonStartYear && entry.year <= latest.year;
    const nextMonthEntries = settled.filter((entry) => entry.month === nextMonthNum && inEra(entry));
    const thisMonthEntries = settled.filter((entry) => entry.month === latest.month && inEra(entry));
    if (nextMonthEntries.length > 0 && thisMonthEntries.length > 0) {
      const nextAvg = nextMonthEntries.reduce((sum, e) => sum + e.detections, 0) / nextMonthEntries.length;
      const thisAvg = thisMonthEntries.reduce((sum, e) => sum + e.detections, 0) / thisMonthEntries.length;
      const pct = thisAvg > 0 ? Math.round(((nextAvg - thisAvg) / thisAvg) * 100) : 0;
      const mostRecentNextMonthEntry = nextMonthEntries[nextMonthEntries.length - 1];
      insights.push({
        icon: pct >= 0 ? "warning" : "south",
        text:
          pct >= 10
            ? tr(
                `${nextMonthLabel} biasanya ${Math.round(pct)}% lebih tinggi dari ${latestMonthLabel}. Waspada.`,
                `${nextMonthLabel} is usually ${Math.round(pct)}% higher than ${latestMonthLabel}. Stay alert.`
              )
            : pct <= -10
              ? tr(
                  `${nextMonthLabel} biasanya ${Math.abs(Math.round(pct))}% lebih rendah dari ${latestMonthLabel}.`,
                  `${nextMonthLabel} is usually ${Math.abs(Math.round(pct))}% lower than ${latestMonthLabel}.`
                )
              : tr(
                  `${nextMonthLabel} biasanya mirip ${latestMonthLabel}. Belum ada tanda turun.`,
                  `${nextMonthLabel} is usually similar to ${latestMonthLabel}. No sign of a drop yet.`
                ),
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
            ? tr(
                `${unusualAreas.unusualCells} dari ${unusualAreas.matchedCells} area aktif hari ini di atas normal. Cek area itu dulu.`,
                `${unusualAreas.unusualCells} of ${unusualAreas.matchedCells} active areas today are above normal. Check them first.`
              )
            : tr(
                `Tidak ada area aktif hari ini yang di atas normal (${unusualAreas.matchedCells} area dicek).`,
                `No active area today is above normal (${unusualAreas.matchedCells} areas checked).`
              ),
        target: { kind: "map" },
      });
    }

    return insights;
  }, [hasRealMonths, seriesMonths, series, comparisonStartYear, realPeakMonthLabel, realBaseline, unusualAreas, activeYears, monthLabels, numLocale, tr, critical, unusualMonths]);

  // Display name of the area every number on the page is for.
  const areaName = aoiPoints
    ? `${tr("Area gambar sendiri", "Drawn area")} (±${polygonAreaKm2(aoiPoints).toLocaleString(numLocale, { maximumFractionDigits: 0 })} km²)`
    : aoiCode
      ? (aoiLabel ?? aoiCode)
      : labelOf(activeRegion, language);

  // CSV of the months behind the calendar, both series side by side, with the same flags the page
  // shows (unusual months per series, critical months from the comparable MODIS series).
  function downloadCsv() {
    const area = aoiPoints ? `drawn-area ${aoiPolygon}` : areaName;
    const csv = calendarCsv(
      mergedMonths,
      area,
      findUnusualMonths(mergedMonths, "modisDetections", FULL_MODIS_START_YEAR),
      findUnusualMonths(mergedMonths, "detections", VIIRS_ERA_START_YEAR),
      criticalPeriod(mergedMonths, "modisDetections", FULL_MODIS_START_YEAR)
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `agnibhumi-calendar-${area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

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
              <span>{tr("Pola Historis", "Historical Patterns")}</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{tr("Aktivitas Kebakaran Historis", "Historical Burning Activity")}</h1>
            <p className="text-sm text-gray-500 max-w-2xl">
              {tr(
                "Pola kebakaran per bulan dan tahun, dibandingkan dengan data hari ini. Ini pola, bukan ramalan.",
                "Fire patterns by month and year, compared with today's data. Patterns, not forecasts."
              )}
            </p>
          </div>
        </div>

        {/* Info pills — reflect the TopBar's real region/range selection (?region=, ?range=) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-8 px-3 inline-flex items-center bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm">
            {tr("Wilayah", "Area")}: {areaName}
          </span>
          <span className="h-8 px-3 inline-flex items-center bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm">
            {tr("Periode arsip", "Archive period")}: {archiveRange ? labelOf(activeRange, language) : tr("Seluruh arsip (2000–2026)", "Full archive (2000–2026)")}
          </span>
          <span className="h-8 px-3 inline-flex items-center bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm">
            Sensor: {tr("Gabungan (MODIS + VIIRS)", "Unified (MODIS + VIIRS)")}
          </span>
          {hasActiveFilters && (
            <Link
              href="/calendar"
              className="h-8 px-3 inline-flex items-center bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-500 shadow-sm hover:bg-gray-50"
            >
              {tr("Hapus Filter", "Clear Filters")}
            </Link>
          )}
        </div>

        {/* Area of interest — a kabupaten/kota or kecamatan, or an area drawn on the map */}
        <Card className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="md:w-72 shrink-0">
              <p className="text-sm font-bold text-gray-900">{tr("Area analisis", "Area of interest")}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {aoiPoints
                  ? tr(
                      `${areaName}: ${aoiPoints.length} titik${historical?.areaCells !== undefined ? `, ${historical.areaCells} sel grid 0,25° dengan riwayat` : ""}. Semua sel yang tersentuh garis area ikut dihitung.`,
                      `${areaName}: ${aoiPoints.length} points${historical?.areaCells !== undefined ? `, ${historical.areaCells} 0.25° grid cells with history` : ""}. Every cell the outline touches is counted.`
                    )
                  : aoiCode
                    ? tr(`${aoiLabel ?? aoiCode}. Sel grid 0,25° yang beririsan dengan batas wilayahnya.`, `${aoiLabel ?? aoiCode}. 0.25° grid cells intersecting its boundary.`)
                    : tr(
                        `${labelOf(activeRegion, language)}. Persempit ke kabupaten/kota atau kecamatan, atau gambar area sendiri (konsesi, taman nasional, lahan gambut):`,
                        `${labelOf(activeRegion, language)}. Narrow to a regency/city or district, or draw your own area (concession, national park, peatland):`
                      )}
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <AreaSearch onPick={(hit) => setAoi(hit)} />
            </div>
            <button
              type="button"
              onClick={() => setDrawing((open) => !open)}
              aria-expanded={drawing}
              className="shrink-0 h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              <span className="material-symbols-outlined text-[16px]">draw</span>
              {aoiPoints ? tr("Ubah area gambar", "Edit drawn area") : tr("Gambar area di peta", "Draw area on map")}
            </button>
            {(aoiCode || aoiPoints) && (
              <button
                type="button"
                onClick={() => (aoiPoints ? setAoiPolygon(null) : setAoi(null))}
                className="shrink-0 h-9 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                {tr("Kembali ke", "Back to")} {labelOf(activeRegion, language)}
              </button>
            )}
          </div>
          {drawing && (
            <AoiDrawMap
              initial={aoiPoints}
              center={drawCenter}
              zoom={drawCenter ? 7 : 5}
              onUse={(points) => setAoiPolygon(points)}
              onCancel={() => setDrawing(false)}
            />
          )}
        </Card>

        {activeRange.window !== null && activeRange.window !== "24h" && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-900">
            <span className="material-symbols-outlined text-blue-600 text-base shrink-0">info</span>
            <p>
              {tr(
                `Rentang "${labelOf(activeRange, language)}" tidak berlaku di kalender. Statistik live tetap 24 jam.`,
                `The "${labelOf(activeRange, language)}" range doesn't apply to the calendar. Live stats stay at 24 hours.`
              )}
            </p>
          </div>
        )}

        {/* Live stat (always real) + baseline/deviation/anomaly stats — real once `historical`
            loads with data, demo-labeled fallback otherwise. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            icon="local_fire_department"
            iconTone="red"
            label={tr("Deteksi 24 Jam Terakhir (Live)", "Detections, Last 24 Hours (Live)")}
            value={loading ? "…" : liveDetectionTotal.toLocaleString(numLocale)}
            caption={error ? error : loading ? tr("Memuat NASA FIRMS…", "Loading NASA FIRMS…") : tr("Data live NASA FIRMS di wilayah ini", "Live NASA FIRMS data for this area")}
            detailsTitle={tr("Cara membaca angka ini", "How to read this")}
            details={
              error || loading
                ? undefined
                : [
                    { label: tr("Sumber aktif", "Feeds live"), value: `${sourcesAvailable} / 4` },
                    { label: tr("Jenis data", "Data type"), value: tr("NRT (sementara)", "NRT (provisional)") },
                    { label: tr("Yang dihitung", "Counted"), value: tr("deteksi MODIS + VIIRS", "MODIS + VIIRS detections") },
                  ]
            }
          />
          <StatTile
            icon="query_stats"
            iconTone="blue"
            label={
              historicalLoading
                ? tr("Baseline Historis", "Historical Baseline")
                : realBaseline
                  ? `${tr("Baseline Historis", "Historical Baseline")} ${realBaseline.monthLabel}`
                  : `${tr("Baseline Historis", "Historical Baseline")} ${DEMO_BASELINE_MONTH_LABEL} (${tr("Contoh", "Example")})`
            }
            value={
              historicalLoading
                ? "…"
                : (realBaseline ? realBaseline.baseline : DEMO_BASELINE_REFERENCE).toLocaleString(numLocale)
            }
            caption={
              historicalLoading
                ? tr("Memuat arsip historis…", "Loading historical archive…")
                : realBaseline
                  ? tr(`Rata-rata ${realBaseline.monthLabel} di tahun-tahun sebelumnya`, `Average ${realBaseline.monthLabel} in earlier years`)
                  : tr("Data ilustratif (contoh)", "Illustrative data (example)")
            }
            detailsTitle={tr("Cara membaca angka ini", "How to read this")}
            details={
              realBaseline
                ? [
                    { label: tr("Tahun pembanding", "Years compared"), value: `${realBaseline.firstYear}–${realBaseline.lastYear} (${realBaseline.years})` },
                    { label: tr("Seri", "Series"), value: series === "comparable" ? tr("MODIS saja", "MODIS only") : "MODIS + VIIRS" },
                    { label: tr("Sumber", "Source"), value: tr("arsip NASA FIRMS", "NASA FIRMS archive") },
                  ]
                : undefined
            }
          />
          <StatTile
            icon="warning"
            iconTone="amber"
            label={
              historicalLoading || realBaseline
                ? tr("Deviasi dari Baseline", "Deviation from Baseline")
                : tr("Deviasi dari Baseline (Contoh)", "Deviation from Baseline (Example)")
            }
            value={
              historicalLoading
                ? "…"
                : realBaseline && realBaseline.deviationPct !== null
                  ? `${realBaseline.deviationPct > 0 ? "+" : ""}${realBaseline.deviationPct}%`
                  : realBaseline
                    ? "-"
                    : `${DEMO_BASELINE_DEVIATION_PCT > 0 ? "+" : ""}${DEMO_BASELINE_DEVIATION_PCT}%`
            }
            trend={
              historicalLoading
                ? undefined
                : realBaseline
                  ? realBaseline.deviationPct !== null
                    ? {
                        direction: realBaseline.deviationPct > 0 ? "up" : "down",
                        label: realBaseline.deviationPct > 0 ? tr("Di atas baseline", "Above baseline") : tr("Di bawah baseline", "Below baseline"),
                      }
                    : undefined
                  : {
                      direction: DEMO_BASELINE_DEVIATION_PCT > 0 ? "up" : "down",
                      label: DEMO_BASELINE_DEVIATION_PCT > 0 ? tr("Di atas baseline", "Above baseline") : tr("Di bawah baseline", "Below baseline"),
                    }
            }
            caption={
              historicalLoading
                ? tr("Memuat arsip historis…", "Loading historical archive…")
                : realBaseline
                  ? tr(`${realBaseline.monthLabel} ${realBaseline.year} dibanding rata-ratanya`, `${realBaseline.monthLabel} ${realBaseline.year} compared with its average`)
                  : tr("Data ilustratif (contoh), bukan kondisi sebenarnya", "Illustrative data (example), not real conditions")
            }
            detailsTitle={tr("Cara membaca angka ini", "How to read this")}
            details={
              realBaseline
                ? [
                    { label: `${realBaseline.monthLabel} ${realBaseline.year}`, value: realBaseline.current.toLocaleString(numLocale) },
                    { label: tr("Rata-rata tahun sebelumnya", "Average of earlier years"), value: realBaseline.baseline.toLocaleString(numLocale) },
                  ]
                : undefined
            }
            note={
              realBaseline?.provisional
                ? tr(
                    "Bulan ini masih data sementara (NRT atau belum selesai), jadi angkanya bisa berubah.",
                    "This month is still provisional (NRT or not finished), so the number may change."
                  )
                : undefined
            }
          />
          <StatTile
            icon="travel_explore"
            iconTone="amber"
            label={tr("Area dengan Aktivitas Tidak Biasa", "Areas with Unusual Activity")}
            value={unusualLoading ? "…" : unusualAreas ? unusualAreas.unusualCells.toLocaleString(numLocale) : "-"}
            caption={
              unusualLoading
                ? tr("Membandingkan data live dengan arsip…", "Comparing live data with the archive…")
                : unusualAreas
                  ? tr(
                      `dari ${unusualAreas.matchedCells.toLocaleString(numLocale)} sel grid 0,25° yang bisa dibandingkan hari ini`,
                      `of ${unusualAreas.matchedCells.toLocaleString(numLocale)} 0.25° grid cells that can be compared today`
                    )
                  : unusual && !unusual.comparable
                    ? tr("Belum bisa dibandingkan", "Can't compare right now")
                    : tr("Perbandingan sedang tidak tersedia", "Comparison unavailable right now")
            }
            detailsTitle={tr("Cara membaca angka ini", "How to read this")}
            details={
              unusualAreas
                ? [
                    {
                      label: tr("Satelit", "Satellites"),
                      value: tr(`MODIS + VIIRS ${unusualAreas.satellite} (sama dengan arsip)`, `MODIS + VIIRS ${unusualAreas.satellite} (same as archive)`),
                    },
                    {
                      label: tr("Dibanding", "Compared with"),
                      value: unusualAreas.seasonMonths
                        ? tr(
                            `${unusualAreas.seasonMonths.map((m) => monthLabels[m - 1]).join("–")} tahun-tahun sebelumnya`,
                            `${unusualAreas.seasonMonths.map((m) => monthLabels[m - 1]).join("–")} of earlier years`
                          )
                        : tr("semua bulan sebelumnya", "all earlier months"),
                    },
                    { label: tr("Disebut tidak biasa jika", "Unusual when"), value: tr("> rata-rata + 2 std", "> average + 2 std") },
                    {
                      label: tr("Pakai semua bulan (riwayat musim kurang)", "Using all months (thin seasonal history)"),
                      value: tr(`${unusualAreas.fallbackCells} sel`, `${unusualAreas.fallbackCells} cells`),
                      muted: unusualAreas.fallbackCells === 0,
                    },
                    {
                      label: tr("Tidak dinilai: riwayat < 10 hari", "Not judged: < 10 days of history"),
                      value: tr(`${unusualAreas.insufficientCells} sel`, `${unusualAreas.insufficientCells} cells`),
                      muted: true,
                    },
                    {
                      label: tr("Tidak dinilai: tanpa riwayat", "Not judged: no history"),
                      value: tr(`${unusualAreas.noHistoryCells} sel`, `${unusualAreas.noHistoryCells} cells`),
                      muted: true,
                    },
                    {
                      label: tr("Tidak dinilai: hanya terlihat satelit lain", "Not judged: seen only by other satellites"),
                      value: tr(`${unusualAreas.notSeenCells} sel`, `${unusualAreas.notSeenCells} cells`),
                      muted: true,
                    },
                  ]
                : undefined
            }
            note={
              !unusualLoading && unusual && !unusual.comparable
                ? tr(
                    `Satelit pembanding sedang tidak ada di data live, jadi belum bisa dibandingkan.`,
                    `The reference satellite is missing from live data, so no comparison yet.`
                  )
                : undefined
            }
          />
        </div>

        {historicalLoading ? (
          <Card className="p-10 flex items-center justify-center">
            <span className="text-sm text-gray-400 animate-pulse flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
              {tr("Memuat arsip historis NASA FIRMS…", "Loading the NASA FIRMS historical archive…")}
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
                      <h3 className="font-bold text-gray-900 text-base">{tr("Ringkasan Aktivitas Tahunan", "Yearly Activity Overview")}</h3>
                      {!hasRealMonths && <DemoBadge />}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {hasRealMonths
                        ? tr(
                            `Perbandingan total titik panas dan periode puncak. ${overviewYears.length} tahun terakhir dari arsip nyata.`,
                            `Total hotspots and peak period comparison. Last ${overviewYears.length} years of the real archive.`
                          )
                        : tr("Perbandingan total titik panas dan periode puncak.", "Total hotspots and peak period comparison.")}
                    </p>
                  </div>
                  {/* No historical cluster/trend view exists yet for this page specifically — routes
                      to Analytics, the closest existing page that covers multi-area trend analysis. */}
                  <Link
                    href={withFilters("/analytics", searchParams)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 shrink-0"
                  >
                    {tr("Lihat detail", "View details")}
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                </div>

                <div className="space-y-6">
                  {overviewYears.map((year) => {
                    const { total, peakLabel, bucketShares } = summarizeYear(activeMonthlyIntensity[year], monthLabels, thresholds);
                    return (
                      <div key={year} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-bold text-gray-800">{year}</span>
                            <span className="text-xs text-gray-400">
                              {total.toLocaleString(numLocale)} {tr("titik panas", "hotspots")}{hasRealMonths ? "" : tr(" (contoh)", " (example)")}
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
                            <span className="text-xs font-medium text-gray-600 whitespace-nowrap">{tr("Puncak", "Peak")}: {peakLabel}</span>
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
                      <h3 className="font-bold text-[#b91c1c] text-sm">{tr("Insight & rekomendasi aktivitas", "Activity insights & recommendations")}</h3>
                      {!hasRealMonths && <DemoBadge />}
                    </div>
                    <p className="text-[11px] text-red-900/70">
                      {labelOf(activeRegion, language)} •{" "}
                      {hasRealMonths ? `${activeYears[0]}–${activeYears[activeYears.length - 1]}` : "2023–2026"} •{" "}
                      {tr("Gabungan (MODIS + VIIRS)", "Unified (MODIS + VIIRS)")}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 mb-4">
                  <h4 className="text-sm font-semibold text-[#b91c1c]">{tr("Insight historis", "Historical insights")}</h4>
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
                                {tr("Lihat data mentahnya →", "See the raw data →")}
                              </button>
                            )}
                            {insight.target?.kind === "map" && (
                              <Link href={withFilters("/map", searchParams)} className="font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2">
                                {tr("Lihat di peta →", "View on map →")}
                              </Link>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] leading-[18px] text-red-900/80">
                      {tr(
                        "Agustus–September menjadi puncak aktivitas pada contoh data 2023–2026 ini. Pola berulang seperti ini membantu menentukan waktu prioritas pemantauan. Aktivitas lebih rendah di luar puncak tidak berarti bebas risiko.",
                        "August–September is the activity peak in this 2023–2026 example data. Recurring patterns like this help time monitoring priorities. Lower activity outside the peak doesn't mean no risk."
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-2 mb-4">
                  <h4 className="text-sm font-semibold text-[#b91c1c]">{tr("Rekomendasi tindak lanjut", "Recommended follow-up")}</h4>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2.5 text-[13px] text-red-900/80">
                      <span className="material-symbols-outlined text-red-600 text-base shrink-0 leading-5">check_circle</span>
                      {tr("Sebelum bulan puncak", "Before the peak month")}
                      {hasRealMonths && realPeakMonthLabel ? ` (${realPeakMonthLabel})` : tr(" (Agustus)", " (August)")}:{" "}
                      {tr("siapkan jadwal pemantauan dan koordinasi tim.", "prepare the monitoring schedule and team coordination.")}
                    </li>
                    <li className="flex items-start gap-2.5 text-[13px] text-red-900/80">
                      <span className="material-symbols-outlined text-red-600 text-base shrink-0 leading-5">check_circle</span>
                      {tr("Pada bulan puncak", "During the peak month")}
                      {hasRealMonths && realPeakMonthLabel ? ` (${realPeakMonthLabel})` : tr(" (Agustus–September)", " (August–September)")}:{" "}
                      {tr("prioritaskan pemantauan dan verifikasi deteksi.", "prioritize monitoring and verifying detections.")}
                    </li>
                    {hasRealMonths && unusualAreas && unusualAreas.unusualCells > 0 && (
                      <li className="flex items-start gap-2.5 text-[13px] text-red-900/80">
                        <span className="material-symbols-outlined text-red-600 text-base shrink-0 leading-5">priority_high</span>
                        {tr(
                          `Saat ini: ${unusualAreas.unusualCells} sel grid sudah di atas baseline historisnya hari ini. Prioritaskan verifikasi di sel tersebut lebih dulu.`,
                          `Right now: ${unusualAreas.unusualCells} grid cells are above their historical baseline today. Verify those cells first.`
                        )}
                      </li>
                    )}
                    <li className="flex items-start gap-2.5 text-[13px] text-red-900/80">
                      <span className="material-symbols-outlined text-red-600 text-base shrink-0 leading-5">check_circle</span>
                      {tr("Di luar puncak: lanjutkan pemantauan rutin dan tinjau deteksi baru.", "Outside the peak: keep routine monitoring and review new detections.")}
                    </li>
                  </ul>
                </div>

                <div className="flex items-start gap-2 bg-white rounded-md px-3 py-2">
                  <span className="material-symbols-outlined text-[14px] text-red-600 mt-0.5 shrink-0">info</span>
                  <p className="text-xs leading-[18px] text-red-900/80">
                    {tr(
                      "Pola historis, bukan kondisi terkini. Deteksi satelit merupakan indikasi dan perlu verifikasi lapangan.",
                      "Historical patterns, not current conditions. Satellite detections are indications and need field verification."
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Burning Activity Calendar — heatmap */}
            <Card className="p-6">
              <div ref={heatmapRef} className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 text-sm">{tr("Kalender Aktivitas Kebakaran", "Burning Activity Calendar")}</h3>
                    {!hasRealMonths && <DemoBadge />}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {hasRealMonths
                      ? tr(
                          `Pola historis aktivitas kebakaran, ${heatmapYears[0]}–${heatmapYears[heatmapYears.length - 1]} (arsip NASA FIRMS nyata). Klik satu sel untuk melihat angka pastinya.`,
                          `Historical fire activity pattern, ${heatmapYears[0]}–${heatmapYears[heatmapYears.length - 1]} (real NASA FIRMS archive). Click a cell for its exact numbers.`
                        )
                      : tr("Pola historis aktivitas kebakaran di area ini.", "Historical pattern of fire activity in this area.")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                {hasRealMonths && (
                  <button
                    type="button"
                    onClick={downloadCsv}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    title={tr(
                      "Data bulanan wilayah ini: kedua seri, status data, dan tanda bulan tidak biasa/kritis",
                      "Monthly data for this area: both series, data status, and unusual/critical flags"
                    )}
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    CSV
                  </button>
                )}
                {hasRealMonths && (
                  <div role="group" aria-label={tr("Seri data", "Data series")} className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 text-xs font-semibold">
                    {([
                      ["comparable", tr("Sebanding 2000–2026 · MODIS", "Comparable 2000–2026 · MODIS")],
                      ["detail", tr("Detail 2012–2026 · MODIS + VIIRS", "Detail 2012–2026 · MODIS + VIIRS")],
                    ] as [SeriesMode, string][]).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={series === mode}
                        onClick={() => {
                          setSeries(mode);
                          setSelectedCell(null);
                        }}
                        className={`rounded-md px-2.5 py-1.5 transition-colors ${
                          series === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {activeYears.length > 5 && (
                  <div role="group" aria-label={tr("Rentang tahun", "Year range")} className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 text-xs font-semibold">
                    {([
                      [5, tr("5 tahun", "5 years")],
                      [10, tr("10 tahun", "10 years")],
                      ["all", `${tr("Semua", "All")} (${activeYears.length})`],
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
              </div>

              {hasRealMonths && series === "comparable" ? (
                <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/60 px-3 py-2 mb-5 text-xs leading-relaxed text-blue-900">
                  <strong>{tr("Seri sebanding: hanya deteksi MODIS (Terra & Aqua).", "Comparable series: MODIS detections only (Terra & Aqua).")}</strong>{" "}
                  {tr(
                    "Sensor yang sama dipakai dari 2003 sampai sekarang, jadi tahun-tahun bisa dibandingkan langsung. VIIRS, yang baru ada sejak 2012, tidak dihitung di sini; kalau ikut dihitung, angka sejak 2012 melonjak sekitar 5 kali hanya karena ada sensor baru. Tahun 2000–2002 hanya berisi Terra (Aqua mulai Juli 2002), jadi ditandai * dan tidak dipakai untuk perbandingan.",
                    "The same sensors are used from 2003 to today, so years can be compared directly. VIIRS, which only exists since 2012, is left out here; counting it makes every year since 2012 jump about 5x just because a new sensor arrived. 2000–2002 hold Terra only (Aqua started in July 2002), so they're marked * and left out of comparisons."
                  )}{" "}
                  {tr(
                    "Catatan: sejak 2021–2022 orbit Terra dan Aqua mulai bergeser sehingga jam lewatnya berubah. NASA masih meneliti dampaknya ke jumlah deteksi api, jadi tahun-tahun terbaru perlu dibaca lebih hati-hati.",
                    "Note: since 2021–2022 the Terra and Aqua orbits have been drifting, changing their overpass times. NASA is still studying how this affects fire detection counts, so read the most recent years with extra care."
                  )}
                </div>
              ) : hasRealMonths ? (
                <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/60 px-3 py-2 mb-5 text-xs leading-relaxed text-blue-900">
                  <strong>{tr("Seri detail: MODIS + VIIRS, 2012–2026.", "Detail series: MODIS + VIIRS, 2012–2026.")}</strong>{" "}
                  {tr(
                    "VIIRS punya piksel lebih kecil, jadi jauh lebih banyak api kecil yang terlihat. Pasangan MODIS–VIIRS dihitung satu kali. Seri ini hanya dimulai 2012 karena VIIRS belum ada sebelumnya; untuk membandingkan dengan tahun-tahun yang lebih lama, pakai seri sebanding.",
                    "VIIRS has smaller pixels, so far more small fires show up. A MODIS–VIIRS pair counts once. This series starts in 2012 because VIIRS didn't exist before; to compare with older years, use the comparable series."
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2 mb-5 text-xs text-amber-800">
                  {tr(
                    "Data ilustratif untuk mendemonstrasikan tampilan kalender multi-tahun. Gagal memuat arsip historis nyata dari backend, menampilkan data contoh sebagai fallback.",
                    "Illustrative data to demonstrate the multi-year calendar. The real historical archive failed to load from the backend, so example data is shown as a fallback."
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  {/* Month headers */}
                  <div className="flex text-[10px] text-gray-400 font-medium mb-2 ml-11 gap-2">
                    {monthLabels.map((month, index) => {
                      const isCritical = hasRealMonths && critical?.months.includes(index + 1);
                      return (
                        <span
                          key={month}
                          className={`flex-1 text-center ${isCritical ? "rounded-sm bg-amber-100 font-bold text-amber-800" : ""}`}
                          title={isCritical ? tr("Termasuk periode kritis wilayah ini", "Part of this area's critical period") : undefined}
                        >
                          {month}
                        </span>
                      );
                    })}
                  </div>

                  {/* Year rows */}
                  {[...heatmapYears].reverse().map((year) => (
                    <div key={year} className="flex items-center mb-2 gap-2">
                      <span
                        className={`text-xs w-9 font-semibold shrink-0 ${hasRealMonths && year < comparisonStartYear ? "text-gray-300" : "text-gray-500"}`}
                        title={hasRealMonths && year < comparisonStartYear ? tr("Hanya Terra, tidak dipakai untuk perbandingan", "Terra only, not used for comparisons") : undefined}
                      >
                        {year}
                        {hasRealMonths && year < comparisonStartYear ? "*" : ""}
                      </span>
                      <div className="flex gap-2 flex-1">
                        {activeMonthlyIntensity[year].map((value, monthIndex) => {
                          const bucket = getIntensityBucket(value, thresholds);
                          const month = monthIndex + 1;
                          const isSelected = hasRealMonths && selectedCell?.year === year && selectedCell?.month === month;
                          const clickable = hasRealMonths && value !== null;
                          const provisional = hasRealMonths ? provisionalMonths.get(`${year}-${month}`) : undefined;
                          const unusualMonth = hasRealMonths ? unusualMonths.get(`${year}-${month}`) : undefined;
                          return (
                            <button
                              key={monthIndex}
                              type="button"
                              disabled={!clickable}
                              onClick={() => clickable && jumpToCell(year, month)}
                              className={`relative flex-1 h-10 rounded-md hover:ring-2 hover:ring-offset-2 transition-all ${
                                provisional ? "outline outline-2 outline-dashed outline-slate-500 -outline-offset-2" : ""
                              } ${
                                isSelected
                                  ? "ring-2 ring-offset-2 ring-emerald-600"
                                  : "hover:ring-gray-300"
                              } ${clickable ? "cursor-pointer" : "cursor-default"}`}
                              style={{ backgroundColor: bucket.bg }}
                              title={
                                value === null
                                  ? incompleteMonths.has(`${year}-${month}`)
                                    ? `${monthLabels[monthIndex]} ${year}: ${tr(
                                        "data live belum lengkap (sebagian hari gagal diambil dari NASA FIRMS, akan dicoba lagi)",
                                        "live data incomplete (some days couldn't be fetched from NASA FIRMS; retrying)"
                                      )}`
                                    : `${monthLabels[monthIndex]} ${year}: ${tr("belum ada data", "no data")}`
                                  : hasRealMonths
                                    ? `${monthLabels[monthIndex]} ${year}: ${value.toLocaleString(numLocale)} ${tr("deteksi. Klik untuk detail", "detections. Click for details")}${
                                        provisional
                                          ? provisional.partialThroughDay !== undefined
                                            ? ` • ${tr(`data sementara, baru sampai tanggal ${provisional.partialThroughDay}`, `provisional, only up to day ${provisional.partialThroughDay}`)}`
                                            : ` • ${tr("data NRT sementara", "provisional NRT data")}`
                                          : ""
                                      }${
                                        unusualMonth
                                          ? ` • ${tr(
                                              `jauh di atas ${monthLabels[monthIndex]} tahun lain (${(unusualMonth.value / unusualMonth.mean).toLocaleString(numLocale, { maximumFractionDigits: 1 })}× rata-ratanya)`,
                                              `far above ${monthLabels[monthIndex]} in other years (${(unusualMonth.value / unusualMonth.mean).toLocaleString(numLocale, { maximumFractionDigits: 1 })}× its average)`
                                            )}`
                                          : ""
                                      }`
                                    : `${monthLabels[monthIndex]} ${year}: ${value.toLocaleString(numLocale)} ${tr("deteksi (contoh)", "detections (example)")}`
                              }
                            >
                              {provisional && (
                                <span className="absolute right-1 top-0.5 text-[9px] font-bold text-slate-700">
                                  {provisional.partialThroughDay !== undefined ? `1–${provisional.partialThroughDay}` : "NRT"}
                                </span>
                              )}
                              {unusualMonth && (
                                <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white" aria-hidden="true" />
                              )}
                            </button>
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
                      {monthLabels[selectedCell.month - 1]} {selectedCell.year}. {tr("data mentah", "raw data")}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setSelectedCell(null)}
                      className="text-gray-400 hover:text-gray-700"
                      aria-label={tr("Tutup detail sel", "Close cell details")}
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                  {selectedCellDetail ? (
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="text-gray-400">{tr("Total deteksi", "Total detections")}</div>
                        <div className="font-bold text-gray-900">{selectedCellDetail.detections.toLocaleString(numLocale)}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">MODIS</div>
                        <div className="font-bold text-gray-900">{selectedCellDetail.modisDetections.toLocaleString(numLocale)}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">VIIRS</div>
                        <div className="font-bold text-gray-900">{selectedCellDetail.viirsDetections.toLocaleString(numLocale)}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">Total FRP</div>
                        <div className="font-bold text-gray-900">{selectedCellDetail.frpSum.toLocaleString(numLocale)} MW</div>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">{tr("Tidak ada data arsip untuk sel ini.", "No archive data for this cell.")}</p>
                  )}
                  <InfoNote className="mt-2">
                    {tr(
                      `Total untuk ${areaName} pada bulan itu, dari data yang sama dengan heatmap di atas.`,
                      `Totals for ${areaName} that month, from the same data as the heatmap above.`
                    )}
                  </InfoNote>
                </div>
              )}

              {/* Intensity legend */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-2 border-t border-gray-100">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-gray-500 tracking-wide mr-1">{tr("INTENSITAS", "INTENSITY")}:</span>
                  {INTENSITY_BUCKETS.map((bucket, index) => (
                    <span
                      key={bucket.bg}
                      className="text-[11px] font-medium px-2 py-0.5 rounded"
                      style={{ backgroundColor: bucket.bg, color: bucket.text }}
                    >
                      {bucketLabel(index, thresholds)}
                    </span>
                  ))}
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded border border-gray-200"
                    style={{ backgroundColor: INTENSITY_NO_DATA.bg, color: INTENSITY_NO_DATA.text }}
                  >
                    {tr(...(INTENSITY_NO_DATA.label.split("|") as [string, string]))}
                  </span>
                  {provisionalMonths.size > 0 && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded border-2 border-dashed border-slate-500 text-slate-700">
                      {tr(
                        "NRT / 1–N = data sementara (belum disaring ke api vegetasi, atau bulan belum selesai); tidak dipakai sebagai riwayat",
                        "NRT / 1–N = provisional data (not yet filtered to vegetation fires, or month not finished); not used as history"
                      )}
                    </span>
                  )}
                  {hasRealMonths && unusualMonths.size > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-700">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                      {tr("bulan tidak biasa (> rata-rata + 2 SD bulan yang sama)", "unusual month (> average + 2 SD of the same month)")}
                    </span>
                  )}
                  {hasRealMonths && critical && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-700">
                      <span className="rounded-sm bg-amber-100 px-1 font-bold text-amber-800">{monthLabels[critical.months[0] - 1]}</span>
                      {tr(
                        `periode kritis (bulan ≥ ${CRITICAL_MONTH_FACTOR}× rata-rata bulan biasa)`,
                        `critical period (months ≥ ${CRITICAL_MONTH_FACTOR}× an average month)`
                      )}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {hasRealMonths
                    ? tr("Satuan: jumlah kejadian termal unik per sel kalender (arsip NASA FIRMS nyata).", "Unit: unique thermal events per calendar cell (real NASA FIRMS archive).")
                    : tr("Satuan: jumlah kejadian termal unik per sel kalender (data ilustratif).", "Unit: unique thermal events per calendar cell (illustrative data).")}
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
