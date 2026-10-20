"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import { getRegionOption, getRangeOption, historicalQuery, isArchiveRange, liveWindowFor, matchesRegion, type RegionOption, withFilters } from "@/lib/filters";
import { windowLoadingNote } from "@/lib/hotspots";
import { useLiveHotspots } from "@/lib/useLiveHotspots";
import type { AreaSummary, HistoricalCalendarResponse } from "@/types";
import { areaRegionLabel } from "@/lib/adminRegion";

/**
 * Figma source: file wasTTtlmYfsjK1ZkH1Kzim, node 169:7795 ("Desktop - 9"), the loose group of
 * sections starting at node 169:11780 (sidebar instance + "Historical Burning Activity" header,
 * 169:11800 "Section - 4 Metric Cards Grid", 169:11865 "Section - Monthly Comparison & Yearly
 * Overview" / "Grafik Trend", 169:12022 "Activity Insights & Recommendations", 169:12044
 * "Cluster Analysis & Deep Table Section" / "Identified Spatial Fire Clusters").
 *
 * This screen is deliberately NOT a 1:1 port of the Figma copy — the mock shows a multi-year
 * monthly time series (Jan 2023 – Dec 2024, "Total Hotspots 2,482 ↓18%", "Aug–Sep" peak period,
 * DBSCAN clustering at ε=1.2km, a "Land Cover Type" column, "ALGORITHM REFRESH RATE: 15 MIN")
 * that this backend does not produce. `GET /api/hotspots` only returns a live NASA FIRMS snapshot
 * (meta.windowHours === 24) plus `areas: AreaSummary[]`, a per-0.25°-grid-cell summary with no
 * historical baseline (see src/types/index.ts and python-service/fire_pipeline/live.py). So:
 *  - The 3 stat cards keep the Figma layout (icon + label + bold value + caption) via StatTile,
 *    but are re-derived from real markers/areas counts instead of fabricated 2023–2024 numbers.
 *  - "Grafik Trend" keeps its card shell/title but shows an honest empty state instead of drawn
 *    bars — there is no monthly series to plot.
 *  - "Identified Spatial Fire Clusters" maps 1:1 onto `areas`: detections → Hotspots,
 *    frpMean/frpMax → Avg/Peak FRP, priorityTier → Risk Classification (only high/medium/low —
 *    Figma's 4th "CRITICAL" tier does not exist in the data), modisDetections/viirsDetections →
 *    a sensor coverage bar (NOT a confidence/agreement percentage), attentionCriteria shown
 *    verbatim. There is no "Land Cover Type" column (no data source — omitted, not invented) and
 *    no DBSCAN/ε=1.2km claim (the real backend groups by a simple 0.25° grid cell, see
 *    python-service/fire_pipeline/features.py aggregate_grid(cell_size=0.25)).
 */

const MAX_CLUSTERS_SHOWN = 20;

type ClusterFilter = "all" | "highFrp";

const TIER_STYLE: Record<AreaSummary["priorityTier"], { label: string; tone: "high" | "medium" | "low"; dot: string }> = {
  high: { label: "HIGH RISK", tone: "high", dot: "bg-[#f04438]" },
  medium: { label: "MEDIUM", tone: "medium", dot: "bg-orange-500" },
  low: { label: "LOW / WATCH", tone: "low", dot: "bg-gray-400" },
};

function requestErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load NASA FIRMS data.";
}

async function requestHistorical(region: RegionOption, signal?: AbortSignal) {
  const query = historicalQuery(region);
  const response = await fetch(`/api/historical${query ? `?${query}` : ""}`, { signal, cache: "no-store" });
  const body = (await response.json()) as HistoricalCalendarResponse & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Unable to load historical NASA FIRMS data.");
  return { months: body.months ?? [], cells: body.cells ?? [] };
}

function SensorCoverageBar({ modis, viirs }: { modis: number; viirs: number }) {
  const total = modis + viirs;
  const modisPct = total > 0 ? Math.round((modis / total) * 100) : 0;

  return (
    <div className="w-36">
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden flex">
        {total > 0 ? (
          <>
            <div className="h-full bg-blue-400" style={{ width: `${modisPct}%` }} />
            <div className="h-full bg-amber-400" style={{ width: `${100 - modisPct}%` }} />
          </>
        ) : (
          <div className="h-full w-full bg-gray-200" />
        )}
      </div>
      <div className="text-[10px] text-gray-400 mt-1 font-medium">
        MODIS {modis} &middot; VIIRS {viirs}
      </div>
    </div>
  );
}

function ClusterRow({ area, rank }: { area: AreaSummary; rank: number }) {
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  const tier = TIER_STYLE[area.priorityTier] ?? TIER_STYLE.low;
  const modis = area.modisDetections ?? 0;
  const viirs = area.viirsDetections ?? 0;

  return (
    <>
      <tr className="border-b border-gray-100 last:border-0 align-top">
        <td className="py-3 pr-3 w-[220px]">
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${tier.dot}`} />
            <div>
              <div className="font-bold text-gray-900 text-[11px]">
                CL-{String(rank).padStart(2, "0")} &middot; {areaRegionLabel(area).title}
              </div>
              <div className="text-gray-400 text-[11px] mt-0.5">{areaRegionLabel(area).caption}</div>
            </div>
          </div>
        </td>
        <td className="py-3 pr-3 whitespace-nowrap">
          <span className="text-lg font-bold text-gray-900">{area.detections ?? "—"}</span>
          <span className="text-[10px] text-gray-400 ml-1">pts</span>
        </td>
        <td className="py-3 pr-3 whitespace-nowrap">
          <div className="text-[12px] font-bold text-gray-900">
            {area.frpMean !== null ? `${area.frpMean.toFixed(1)} MW` : "—"}
            <span className="text-gray-400 font-normal"> / {area.frpMax !== null ? `${area.frpMax.toFixed(1)} MW` : "—"}</span>
          </div>
        </td>
        <td className="py-3 pr-3">
          <Badge tone={tier.tone}>{tier.label}</Badge>
        </td>
        <td className="py-3 pr-3">
          <SensorCoverageBar modis={modis} viirs={viirs} />
        </td>
        <td className="py-3 pl-3 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <Link
              href={withFilters("/map", searchParams)}
              className="px-2.5 py-1 rounded-md bg-gray-900 text-white text-[10px] font-semibold hover:bg-gray-700 whitespace-nowrap"
            >
              Peta
            </Link>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-semibold hover:bg-emerald-100 whitespace-nowrap"
            >
              {expanded ? "Tutup" : "Detail"}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/70 border-b border-gray-100">
          <td colSpan={6} className="px-3 py-3">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
              <div className="col-span-2 md:col-span-4">
                <dt className="text-gray-400">Kriteria prioritas</dt>
                <dd className="font-medium text-gray-800 font-mono mt-0.5">{area.attentionCriteria}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Deteksi pertama</dt>
                <dd className="font-medium text-gray-800 mt-0.5">{area.firstDate}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Deteksi puncak</dt>
                <dd className="font-medium text-gray-800 mt-0.5">{area.peakDate}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Deteksi terakhir</dt>
                <dd className="font-medium text-gray-800 mt-0.5">{area.lastDate}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Hari aktif berturut-turut</dt>
                <dd className="font-medium text-gray-800 mt-0.5">{area.consecutiveActiveDays ?? "—"}</dd>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

function AnalyticsPageContent() {
  const searchParams = useSearchParams();
  const activeRegion = getRegionOption(searchParams.get("region"));
  const activeRange = getRangeOption(searchParams.get("range"));

  const archiveRange = isArchiveRange(searchParams.get("range"));
  const liveWindow = liveWindowFor(searchParams.get("range"));
  const periodLabel = archiveRange ? "24 Jam Terakhir" : activeRange.label;
  const { data, error, loading, refresh } = useLiveHotspots(liveWindow, { province: activeRegion.provinsi });
  const meta = data?.meta ?? null;
  const [clusterFilter, setClusterFilter] = useState<ClusterFilter>("all");
  const [historical, setHistorical] = useState<HistoricalCalendarResponse | null>(null);
  const [historicalLoadedKey, setHistoricalLoadedKey] = useState<string | null>(null);
  const [historicalErrorState, setHistoricalErrorState] = useState<{ key: string; message: string } | null>(null);

  const areas = useMemo(
    () => (data?.areas ?? []).filter((area) => matchesRegion(area.admin, activeRegion)),
    [data, activeRegion]
  );
  // Raw MODIS + VIIRS counts per area cover every detection, unlike the API's `markers`, which
  // are capped to the highest-FRP ones for 7d/30d windows.
  const totalDetections = useMemo(
    () => areas.reduce((sum, area) => sum + (area.modisDetections ?? 0) + (area.viirsDetections ?? 0), 0),
    [areas]
  );

  useEffect(() => {
    const controller = new AbortController();
    const regionKey = activeRegion.value;

    requestHistorical(activeRegion, controller.signal)
      .then((body) => {
        setHistorical(body);
        setHistoricalLoadedKey(regionKey);
        setHistoricalErrorState(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setHistorical(null);
        setHistoricalLoadedKey(regionKey);
        setHistoricalErrorState({ key: regionKey, message: requestErrorMessage(requestError) });
      });

    return () => controller.abort();
  }, [activeRegion]);

  const sortedAreas = useMemo(
    () => [...areas].sort((a, b) => (a.priorityRank ?? Number.MAX_SAFE_INTEGER) - (b.priorityRank ?? Number.MAX_SAFE_INTEGER)),
    [areas],
  );

  const filteredAreas = useMemo(
    () => (clusterFilter === "highFrp" ? sortedAreas.filter((area) => (area.frpMax ?? 0) > 50) : sortedAreas),
    [sortedAreas, clusterFilter],
  );

  const shownAreas = filteredAreas.slice(0, MAX_CLUSTERS_SHOWN);
  const topArea = sortedAreas[0] ?? null;
  const highTierCount = areas.filter((area) => area.priorityTier === "high").length;
  const avgPerGrid = areas.length > 0 ? totalDetections / areas.length : null;
  const sourcesAvailable = meta?.sources.filter((source) => source.available).length ?? 0;
  const historicalKey = activeRegion.value;
  const historicalError = historicalErrorState?.key === historicalKey ? historicalErrorState.message : null;
  const historicalLoading = historicalLoadedKey !== historicalKey && historicalError === null;
  const historicalMonths = (historical?.months ?? []).filter(
    (month) => !archiveRange || (month.year >= 2023 && month.year <= 2024)
  );
  const historicalHasData = historicalMonths.length > 0;
  // > 36 months can't fit as monthly bars (the full archive is ~311), so roll up to yearly totals.
  const trendBars = useMemo(() => {
    if (historicalMonths.length <= 36) {
      return historicalMonths.map((month) => ({
        key: `${month.year}-${month.month}`,
        label: `${String(month.month).padStart(2, "0")}/${String(month.year).slice(2)}`,
        title: `${month.year}-${String(month.month).padStart(2, "0")}: ${month.detections.toLocaleString()} deteksi`,
        value: month.detections,
        partial: false,
        modisOnly: month.year < 2012,
      }));
    }
    const byYear = new Map<number, { total: number; months: number }>();
    for (const month of historicalMonths) {
      const entry = byYear.get(month.year) ?? { total: 0, months: 0 };
      entry.total += month.detections;
      entry.months += 1;
      byYear.set(month.year, entry);
    }
    return [...byYear.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, { total, months }]) => ({
        key: String(year),
        label: `'${String(year).slice(2)}`,
        title: `${year}: ${total.toLocaleString()} deteksi${months < 12 ? ` (data parsial, ${months} bulan)` : ""}${year < 2012 ? " — hanya MODIS" : ""}`,
        value: total,
        partial: months < 12,
        modisOnly: year < 2012,
      }));
  }, [historicalMonths]);
  const trendIsYearly = historicalMonths.length > 36;
  const historicalMax = Math.max(...trendBars.map((bar) => bar.value), 1);

  return (
    <WorkstationLayout activeTab="Analytics">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
              <span>Fire Activity Intelligence</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics</h1>
            <p className="text-sm text-gray-500 max-w-2xl">
              Statistik dan klaster spasial dari snapshot NASA FIRMS 24 jam terakhir, dibandingkan dengan arsip
              historis nyata (2000–2026) untuk wilayah terpilih. Deteksi satelit adalah indikasi anomali termal,
              bukan konfirmasi kebakaran — perlu verifikasi lapangan sebelum tindak lanjut.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="h-9 px-4 bg-white border border-gray-200 rounded-lg text-sm font-medium text-blue-600 shadow-sm hover:bg-gray-50 disabled:text-gray-400"
          >
            Refresh
          </button>
        </div>

        {/* Info pills — now reflect the TopBar's region/range selection (?region=, ?range=) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-8 px-3 inline-flex items-center bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm">
            Periode: {activeRange.label}
          </span>
          <span className="h-8 px-3 inline-flex items-center bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm">
            Wilayah: {activeRegion.label}
          </span>
          <span className="h-8 px-3 inline-flex items-center bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm">
            Sumber: NASA FIRMS (MODIS + VIIRS)
          </span>
        </div>

        {/* Status line */}
        <div className="min-h-6 flex items-center gap-2 text-xs" aria-live="polite">
          <span
            className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : loading ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`}
          />
          <span className={error ? "text-red-600" : "text-gray-500"}>
            {error
              ? error
              : loading
                ? (windowLoadingNote(liveWindow) ?? "NASA live → Python processing…")
                : meta
                  ? `${areas.length.toLocaleString()} area • ${sourcesAvailable}/4 feed NASA FIRMS aktif • diperbarui ${new Date(meta.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
          </span>
        </div>

        {archiveRange && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900">
            <span className="material-symbols-outlined text-amber-600 text-base shrink-0">info</span>
            <p>
              Grafik trend memakai arsip Jan 2023 – Des 2024. Statistik &amp; klaster di bawah tetap dari data live 24 jam
              terakhir, karena arsip hanya berisi total harian per grid (tanpa skor prioritas).
            </p>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatTile
            icon="priority_high"
            iconTone="red"
            label="Area Prioritas Tertinggi"
            value={topArea ? areaRegionLabel(topArea).title : "—"}
            caption={
              topArea
                ? `${topArea.detections ?? 0} deteksi · ${TIER_STYLE[topArea.priorityTier].label}`
                : "Belum ada area dengan deteksi"
            }
          />
          <StatTile
            icon="local_fire_department"
            iconTone="amber"
            label={`Total Deteksi (${periodLabel})`}
            value={totalDetections.toLocaleString()}
            caption={meta ? `${sourcesAvailable}/4 feed NASA FIRMS aktif` : "Memuat sumber data…"}
          />
          <StatTile
            icon="grid_view"
            iconTone="blue"
            label="Rata-rata Deteksi / Grid Area"
            value={avgPerGrid !== null ? avgPerGrid.toFixed(1) : "—"}
            caption={`dari ${areas.length} grid 0.25° (~27km) terdeteksi`}
          />
        </div>

        {/* Grafik Trend + Insight */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
          <Card className="p-6 flex flex-col gap-4 lg:col-span-3 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900">Grafik Trend</h2>
            </div>
            <p className="text-xs text-gray-400 -mt-2">
              Total hotspot per bulan dari arsip NASA FIRMS untuk wilayah terpilih
              {archiveRange ? " (Jan 2023 – Des 2024)" : " (seluruh arsip)"}.
            </p>
            {historicalLoading ? (
              <div className="flex-1 min-h-[200px] rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-500">
                Memuat data historis…
              </div>
            ) : historicalError ? (
              <div className="flex-1 min-h-[200px] rounded-lg border border-dashed border-red-200 bg-red-50 flex items-center justify-center text-sm text-red-700 text-center px-6">
                {historicalError}
              </div>
            ) : historicalHasData ? (
              <div className="flex-1 min-h-[200px] min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
                <div className="h-[170px] flex items-end gap-[3px]">
                  {trendBars.map((bar, index) => (
                    <div key={bar.key} className="flex-1 min-w-0 h-full flex flex-col justify-end gap-1" title={bar.title}>
                      <div
                        className={`w-full rounded-t ${bar.modisOnly ? "bg-slate-300" : bar.partial ? "bg-emerald-200" : "bg-emerald-500"}`}
                        style={{ height: `${Math.max((bar.value / historicalMax) * 100, 2)}%` }}
                      />
                      <span className="h-3 text-[9px] leading-3 text-gray-400 text-center overflow-hidden">
                        {/* Label every other bar so labels never overlap at narrow widths. */}
                        {index % 2 === 0 || index === trendBars.length - 1 ? bar.label : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-gray-500">
                  {trendIsYearly ? `Total per tahun (${trendBars.length} tahun)` : `Total per bulan (${trendBars.length} bulan)`} ·
                  wilayah: {activeRegion.label}
                  {trendBars.some((bar) => bar.partial) && " · batang pucat = tahun dengan data tidak lengkap"}
                  {trendBars.some((bar) => bar.modisOnly) &&
                    " · batang abu-abu = sebelum 2012 (hanya MODIS; VIIRS mulai 20 Jan 2012, jadi lonjakan 2012 adalah perubahan sensor, bukan kebakaran)"}
                </p>
              </div>
            ) : (
              <div className="flex-1 min-h-[200px] rounded-lg border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2 text-center px-6 py-8">
                <span className="material-symbols-outlined text-3xl text-gray-300">bar_chart</span>
                <p className="text-sm font-semibold text-gray-500 max-w-xs">
                  Belum ada data historis untuk wilayah ini.
                </p>
                <p className="text-xs text-gray-400 max-w-sm">
                  Nilai kosong berarti database historis tidak memiliki baris yang cocok, bukan nol deteksi.
                </p>
              </div>
            )}
          </Card>

          <div className="lg:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 flex gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-lg">insights</span>
            </div>
            <div className="flex-1 space-y-4 min-w-0">
              <h2 className="text-base font-bold text-emerald-950">Insight Aktivitas &amp; Rekomendasi</h2>
              <p className="text-xs text-emerald-900 leading-relaxed">
                {loading
                  ? "Memuat data NASA FIRMS…"
                  : totalDetections > 0
                    ? `Dalam ${periodLabel.toLowerCase()}, terdeteksi ${totalDetections.toLocaleString()} hotspot tersebar di ${areas.length} grid area 0.25°${activeRegion.provinsi ? ` di ${activeRegion.label}` : ""}. ${highTierCount} area berada pada klasifikasi risiko tinggi dan memerlukan perhatian segera.`
                    : `Tidak ada hotspot terdeteksi dalam ${periodLabel.toLowerCase()}.`}
              </p>
              <ul className="space-y-3">
                <li className="flex gap-3 items-start text-[13px] text-emerald-900">
                  <span className="material-symbols-outlined text-emerald-600 text-base shrink-0">check_circle</span>
                  <span>Prioritaskan verifikasi lapangan untuk area berklasifikasi risiko tinggi lebih dulu.</span>
                </li>
                <li className="flex gap-3 items-start text-[13px] text-emerald-900">
                  <span className="material-symbols-outlined text-emerald-600 text-base shrink-0">verified</span>
                  <span>Area dengan FRP puncak jauh di atas rata-ratanya berpotensi memerlukan pemantauan lebih intensif.</span>
                </li>
                <li className="flex gap-3 items-start text-[13px] text-emerald-900">
                  <span className="material-symbols-outlined text-emerald-600 text-base shrink-0">arrow_forward</span>
                  <span>Area yang hanya tercakup satu sensor (MODIS saja atau VIIRS saja) sebaiknya dikonfirmasi ulang sebelum tindak lanjut.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Identified Spatial Fire Clusters */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">Identified Spatial Fire Clusters</h2>
                <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                  {areas.length} AREA AKTIF
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 max-w-xl">
                Setiap baris mewakili satu sel grid 0.25° (~27km) dari agregasi python fire_pipeline, bukan hasil
                klasterisasi spasial DBSCAN.
              </p>
            </div>
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setClusterFilter("all")}
                className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors ${
                  clusterFilter === "all" ? "bg-blue-50 text-gray-900 border border-blue-200" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                Semua Area
              </button>
              <button
                type="button"
                onClick={() => setClusterFilter("highFrp")}
                className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors ${
                  clusterFilter === "highFrp" ? "bg-blue-50 text-gray-900 border border-blue-200" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                FRP Puncak &gt; 50MW
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[880px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="py-3 pr-3 font-bold text-gray-500 text-[10px] tracking-wide uppercase">Cluster ID &amp; Lokasi</th>
                  <th className="py-3 pr-3 font-bold text-gray-500 text-[10px] tracking-wide uppercase">Hotspots</th>
                  <th className="py-3 pr-3 font-bold text-gray-500 text-[10px] tracking-wide uppercase">Avg / Peak FRP</th>
                  <th className="py-3 pr-3 font-bold text-gray-500 text-[10px] tracking-wide uppercase">Risk Classification</th>
                  <th className="py-3 pr-3 font-bold text-gray-500 text-[10px] tracking-wide uppercase">Cakupan Sensor</th>
                  <th className="py-3 pl-3 font-bold text-gray-500 text-[10px] tracking-wide uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shownAreas.map((area, index) => (
                  <ClusterRow key={area.areaId} area={area} rank={index + 1} />
                ))}
                {!loading && !error && shownAreas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-gray-500">
                      Tidak ada area dengan deteksi pada filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-100 text-[10px] text-gray-400 font-semibold">
            <span>
              MENAMPILKAN {shownAreas.length} DARI {filteredAreas.length} AREA AKTIF · REFRESH OTOMATIS SETIAP 5 MENIT
            </span>
          </div>
        </Card>
      </div>
    </WorkstationLayout>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsPageContent />
    </Suspense>
  );
}
