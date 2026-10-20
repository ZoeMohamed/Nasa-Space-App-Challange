"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { getRegionOption, getRangeOption, historicalQuery, isArchiveRange, liveWindowFor, matchesRegion, type RegionOption, withFilters } from "@/lib/filters";
import { windowLoadingNote } from "@/lib/hotspots";
import { useLiveHotspots } from "@/lib/useLiveHotspots";
import type { AreaSummary, CommunityReport, HotspotMarker } from "@/types";
import { areaRegionLabel, formatAdminFull } from "@/lib/adminRegion";

const FireMap = dynamic(() => import("@/components/map/FireMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100">
      <span className="font-medium text-sm text-gray-500 animate-pulse">
        Loading Map Explorer…
      </span>
    </div>
  ),
});

const LAYERS = ["MODIS", "VIIRS", "HARMONIZED"] as const;
const MAX_ATTENTION_AREAS = 3;
type Layer = (typeof LAYERS)[number];
type ExploreTab = "hotspot" | "data" | "filter";

// Same color scheme as the TIER_STYLE badges in src/app/priority-areas/page.tsx — reused here via
// the shared Badge primitive so "high"/"medium"/"low" always look identical across the app.
const TIER_LABEL: Record<AreaSummary["priorityTier"], string> = {
  high: "HIGH RISK",
  medium: "MEDIUM",
  low: "LOW",
};

const SEVERITY_BADGE_TONE: Record<HotspotMarker["severity"], BadgeTone> = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

async function requestArchiveMap(startDate: string, endDate: string, region: RegionOption, signal?: AbortSignal) {
  const query = historicalQuery(region, { start_date: startDate, end_date: endDate });
  const response = await fetch(`/api/historical/map?${query}`, { signal, cache: "no-store" });
  const body = (await response.json()) as { markers?: HotspotMarker[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Unable to load historical NASA FIRMS map data.");
  return body.markers ?? [];
}

function requestErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load NASA FIRMS data.";
}

/**
 * Short, human reason an area made the attention list — derived from the real per-area fields
 * the Python pipeline already computes (consecutiveActiveDays / growth / sensor coverage), not
 * fabricated copy. Falls back to the pipeline's literal scoring formula (attentionCriteria) when
 * none of those specific signals stand out.
 */
function areaReason(area: AreaSummary) {
  if (area.consecutiveActiveDays !== null && area.consecutiveActiveDays >= 2) {
    return `Deteksi berulang ${area.consecutiveActiveDays} hari berturut-turut`;
  }
  if (area.growth !== null && area.growth > 0.1) {
    return "Peningkatan aktivitas dibanding periode sebelumnya";
  }
  if ((area.modisDetections ?? 0) > 0 && (area.viirsDetections ?? 0) > 0) {
    return "Deteksi dari kedua sensor (MODIS + VIIRS)";
  }
  return `Skor atensi tertinggi — kriteria: ${area.attentionCriteria}`;
}

function AttentionAreaRow({ area }: { area: AreaSummary }) {
  const tone: BadgeTone = area.priorityTier;
  const activeDays = area.consecutiveActiveDays ?? area.activeDays;

  return (
    <div className="bg-[var(--color-bg-subtle,#f8fafc)] border border-[var(--color-border)] rounded-lg p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs font-bold text-[var(--color-text-main)]" title={areaRegionLabel(area).caption}>
          {areaRegionLabel(area).title}
        </span>
        <Badge tone={tone} className="shrink-0">
          {TIER_LABEL[area.priorityTier]}
        </Badge>
      </div>
      <p className="text-xs text-[var(--color-text-muted)] mb-2">{areaReason(area)}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-[var(--color-text-muted)]">
        <span>{area.detections ?? "—"} deteksi</span>
        <span>•</span>
        <span>{activeDays !== null ? `${activeDays} hari aktif` : "—"}</span>
        <span>•</span>
        <span>Terakhir: {area.lastDate}</span>
      </div>
    </div>
  );
}

function formatAcquiredAt(acquiredAt: string | undefined) {
  if (!acquiredAt) return { date: "Tidak diketahui", time: "" };
  const parsed = new Date(acquiredAt);
  if (Number.isNaN(parsed.getTime())) return { date: acquiredAt, time: "" };
  return {
    date: parsed.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    time: `${parsed.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`,
  };
}

function HotspotDetailPanel({ marker, onClose }: { marker: HotspotMarker; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const acquired = formatAcquiredAt(marker.acquiredAt);
  const frpPercent = Math.max(6, Math.min(100, (marker.frp / 100) * 100));
  const confidenceText =
    marker.confidenceLabel ?? (marker.confidence !== undefined ? `${marker.confidence.toFixed(0)}%` : null);

  return (
    <Card className="absolute top-4 right-4 z-[1200] w-[min(340px,calc(100vw-2rem))] max-h-[calc(100%-2rem)] overflow-y-auto p-4 shadow-xl backdrop-blur-md bg-white/95 border border-[var(--color-border)] rounded-2xl transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <span className="material-symbols-outlined text-[18px]">local_fire_department</span>
          </span>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-[var(--color-text-main)] truncate">
              {marker.matchStatus === "MATCHED" ? "Harmonized (MODIS + VIIRS)" : `Deteksi ${marker.sensor ?? "Satelit"}`}
            </h2>
            <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">{marker.label}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Ciutkan panel" : "Perluas rincian"}
            aria-label={expanded ? "Ciutkan panel" : "Perluas rincian"}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
          >
            <span className="material-symbols-outlined text-[17px]">{expanded ? "expand_less" : "expand_more"}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail hotspot"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>

      {/* Collapsed view summary */}
      <div className="py-2.5 border-b border-[var(--color-border)] flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
          <span className="material-symbols-outlined text-[14px]">schedule</span>
          <span>{acquired.date} · {acquired.time}</span>
        </div>
        <Badge tone={SEVERITY_BADGE_TONE[marker.severity]}>{marker.severity}</Badge>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-3 pt-3 animate-fadeIn text-xs">
          <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-gray-50 border border-gray-100 text-[11px]">
            <div className="col-span-2">
              <span className="text-gray-400 block text-[10px]">Wilayah</span>
              <span className="text-gray-700 font-semibold">{formatAdminFull(marker.admin) ?? "Tidak tercatat"}</span>
            </div>
            <div>
              <span className="text-gray-400 block text-[10px]">Koordinat</span>
              <span className="font-mono text-gray-700 font-semibold">{marker.lat.toFixed(4)}°, {marker.lng.toFixed(4)}°</span>
            </div>
            <div>
              <span className="text-gray-400 block text-[10px]">Sensor / Satelit</span>
              <span className="font-semibold text-gray-800">{marker.sensor ?? marker.source ?? "NASA FIRMS"} {marker.satellite ? `(${marker.satellite})` : ""}</span>
            </div>
            <div>
              <span className="text-gray-400 block text-[10px]">Keyakinan</span>
              <span className="font-semibold text-gray-800">{confidenceText ?? "Tidak dilaporkan"}</span>
            </div>
            <div>
              <span className="text-gray-400 block text-[10px]">Status Validasi</span>
              <span className="font-semibold text-emerald-800">{marker.matchStatus ? marker.matchStatus.replaceAll("_", " ") : "Belum dicocokkan"}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--color-text-muted)]">Daya Radiasi (FRP):</span>
              <span className="font-bold text-[var(--color-text-main)]">{marker.frp.toFixed(1)} MW</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-600"
                style={{ width: `${frpPercent}%` }}
              />
            </div>
          </div>

          <div className="space-y-1.5 text-[11px] text-[var(--color-text-muted)] leading-relaxed pt-1">
            <p className="bg-amber-50 text-amber-900 border border-amber-200/60 p-2 rounded-lg">
              FRP {marker.frp.toFixed(1)} MW menunjukkan daya radiasi panas yang terdeteksi satelit, bukan luas lahan terbakar. Titik panas belum membuktikan adanya kebakaran aktif di lapangan.
            </p>
          </div>
        </div>
      )}

      {/* Toggle button footer */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-center text-[11px] font-bold text-emerald-700 hover:text-emerald-900 pt-2 flex items-center justify-center gap-1"
      >
        <span>{expanded ? "Ciutkan rincian" : "Lihat rincian lengkap"}</span>
        <span className="material-symbols-outlined text-[15px]">{expanded ? "expand_less" : "expand_more"}</span>
      </button>
    </Card>
  );
}

function SensorDonut({ modis, viirs }: { modis: number; viirs: number }) {
  const total = modis + viirs;
  const radius = 15.9155; // circumference = 100, so dash lengths read as percentages
  const modisPct = total > 0 ? (modis / total) * 100 : 0;
  return (
    <svg viewBox="0 0 42 42" className="h-20 w-20 shrink-0 -rotate-90" role="img" aria-label={`MODIS ${modis}, VIIRS ${viirs}`}>
      <circle cx="21" cy="21" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="6" />
      {total > 0 && (
        <>
          <circle cx="21" cy="21" r={radius} fill="none" stroke="#fbbf24" strokeWidth="6" strokeDasharray="100 0" />
          <circle cx="21" cy="21" r={radius} fill="none" stroke="#ef4444" strokeWidth="6" strokeDasharray={`${modisPct} ${100 - modisPct}`} />
        </>
      )}
    </svg>
  );
}

function MapExplorerPageContent() {
  const searchParams = useSearchParams();
  const activeRegion = getRegionOption(searchParams.get("region"));
  const activeRange = getRangeOption(searchParams.get("range"));
  const archiveRange = isArchiveRange(searchParams.get("range"));
  const liveWindow = liveWindowFor(searchParams.get("range"));

  const [activeLayer, setActiveLayer] = useState<Layer>("HARMONIZED");
  const [selectedMarker, setSelectedMarker] = useState<HotspotMarker | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [exploreTab, setExploreTab] = useState<ExploreTab>("hotspot");
  const [onlyMatched, setOnlyMatched] = useState(false);
  const [onlyHighFrp, setOnlyHighFrp] = useState(false);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [showReports, setShowReports] = useState(true);
  const [includeAllConfidence, setIncludeAllConfidence] = useState(false);

  // Citizen reports are fetched separately from /api/reports (not part of
  // /api/hotspots) and shown as person-pin markers alongside satellite
  // detections — same shared backend as Community View / /citizen-reports.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !body?.reports) return;
        setReports(body.reports);
      })
      .catch(() => {
        /* best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const live = useLiveHotspots(liveWindow, { includeAllConfidence, province: activeRegion.provinsi });

  // "2023–2024" comes from the offline daily archive: grid-cell totals, region-filtered server-side.
  const archiveKey = archiveRange ? `${activeRange.value}|${activeRegion.value}` : "";
  const [archive, setArchive] = useState<{ key: string; markers: HotspotMarker[]; error: string | null }>({
    key: "",
    markers: [],
    error: null,
  });
  useEffect(() => {
    if (!archiveRange || !activeRange.startDate || !activeRange.endDate) return;
    const controller = new AbortController();
    requestArchiveMap(activeRange.startDate, activeRange.endDate, activeRegion, controller.signal)
      .then((archiveMarkers) => setArchive({ key: archiveKey, markers: archiveMarkers, error: null }))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setArchive({ key: archiveKey, markers: [], error: requestErrorMessage(requestError) });
      });
    return () => controller.abort();
  }, [archiveRange, archiveKey, activeRange.startDate, activeRange.endDate, activeRegion]);

  const archiveCurrent = archive.key === archiveKey;
  const markers = useMemo<HotspotMarker[]>(
    () => (archiveRange ? (archiveCurrent ? archive.markers : []) : (live.data?.markers ?? [])),
    [archiveRange, archiveCurrent, archive.markers, live.data]
  );
  const areas = useMemo<AreaSummary[]>(() => (archiveRange ? [] : (live.data?.areas ?? [])), [archiveRange, live.data]);
  const meta = archiveRange ? null : (live.data?.meta ?? null);
  const loading = archiveRange ? !archiveCurrent : live.loading;
  const error = archiveRange ? (archiveCurrent ? archive.error : null) : live.error;
  const refreshHotspots = live.refresh;

  // Live markers are region-matched on their own province; archive cells were already filtered
  // server-side and carry no per-point admin data.
  const visibleMarkers = useMemo(() => {
    const byLayer = archiveRange || activeLayer === "HARMONIZED"
      ? markers
      : markers.filter((marker) => marker.sensor === activeLayer);
    return byLayer
      .filter((marker) => archiveRange || matchesRegion(marker.admin, activeRegion))
      .filter((marker) => !onlyMatched || marker.matchStatus === "MATCHED")
      .filter((marker) => !onlyHighFrp || marker.frp > 50);
  }, [activeLayer, archiveRange, markers, activeRegion, onlyMatched, onlyHighFrp]);

  const visibleAreas = useMemo(
    () => areas.filter((area) => matchesRegion(area.admin, activeRegion)),
    [areas, activeRegion]
  );

  const topAttentionAreas = useMemo(
    () =>
      [...visibleAreas]
        .sort((a, b) => (a.priorityRank ?? Number.MAX_SAFE_INTEGER) - (b.priorityRank ?? Number.MAX_SAFE_INTEGER))
        .slice(0, MAX_ATTENTION_AREAS),
    [visibleAreas]
  );
  // Exact counts over every detection from the daily summary (markers on the map are capped);
  // the archive range has no daily summary, so it falls back to the shown cells.
  const sensorCounts = useMemo(() => {
    const daily = live.data?.daily;
    if (!archiveRange && daily) {
      const rows = daily.filter((row) => !activeRegion.provinsi || row.provinsi === activeRegion.provinsi);
      return rows.reduce(
        (acc, row) => ({ modis: acc.modis + row.modis, viirs: acc.viirs + row.viirs, matched: acc.matched + row.matched }),
        { modis: 0, viirs: 0, matched: 0 }
      );
    }
    return {
      modis: visibleMarkers.filter((marker) => marker.sensor === "MODIS").length,
      viirs: visibleMarkers.filter((marker) => marker.sensor === "VIIRS").length,
      matched: visibleMarkers.filter((marker) => marker.matchStatus === "MATCHED").length,
    };
  }, [archiveRange, live.data, activeRegion.provinsi, visibleMarkers]);

  return (
    <WorkstationLayout activeTab="Map" fullBleed>
      <div className="relative h-full w-full overflow-hidden bg-[#d9e4df]">
        <FireMap
          markers={visibleMarkers}
          center={[-2.2, 118]}
          zoom={5}
          className="absolute inset-0 h-full w-full"
          showSeverityLegend={false}
          showDetailPanel={false}
          onMarkerSelect={setSelectedMarker}
          reports={
            showReports
              ? reports.map((r) => ({
                  id: r.id,
                  lat: r.lat,
                  lng: r.lon,
                  status: r.status,
                  description: r.description,
                  createdAt: r.createdAt,
                }))
              : []
          }
        />

        {!showControls && (
          <button
            type="button"
            onClick={() => setShowControls(true)}
            aria-label="Buka panel Explore Map"
            className="absolute left-4 top-4 z-[1200] inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/95 px-3 py-2 text-sm font-bold text-gray-800 shadow-lg backdrop-blur hover:bg-white"
          >
            <span className="material-symbols-outlined text-[18px] text-red-600">travel_explore</span>
            Explore Map
            <span className="material-symbols-outlined text-[18px] text-gray-500">last_page</span>
          </button>
        )}

        {showControls && (
          <Card className="absolute left-4 top-4 z-[1100] flex w-[min(360px,calc(100%-2rem))] max-h-[calc(100%-2rem)] flex-col p-4 shadow-xl backdrop-blur-sm bg-white/95">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
              <span className="material-symbols-outlined text-[20px] text-red-600">travel_explore</span>
              <h1 className="text-lg font-bold text-gray-900">Explore Map</h1>
              <button
                type="button"
                onClick={() => setShowControls(false)}
                aria-label="Ciutkan panel"
                title="Ciutkan panel"
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-[18px]">first_page</span>
              </button>
            </div>

            <div role="tablist" aria-label="Isi panel" className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-[#f1f2ff] p-1 text-xs font-bold">
              {([
                ["hotspot", "local_fire_department", "Hotspot"],
                ["data", "layers", "Data"],
                ["filter", "tune", "Filter"],
              ] as [ExploreTab, string, string][]).map(([tab, icon, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={exploreTab === tab}
                  onClick={() => setExploreTab(tab)}
                  className={`flex items-center justify-center gap-1 rounded-md px-2 py-2 transition-colors ${
                    exploreTab === tab ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              {exploreTab === "hotspot" && (
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-red-600">crisis_alert</span>
                    <h2 className="text-base font-bold text-gray-900">Areas Requiring Attention</h2>
                  </div>
                  <p className="mb-3 text-xs text-gray-500">Diurutkan dari skor prioritas tertinggi · {activeRegion.label} · {activeRange.label}</p>
                  <div className="mb-3 space-y-2">
                    {loading && topAttentionAreas.length === 0 && (
                      <div className="py-2 text-xs text-gray-500">
                        {windowLoadingNote(liveWindow) ?? "Memuat area prioritas…"}
                      </div>
                    )}
                    {!loading && archiveRange && (
                      <div className="py-2 text-xs text-gray-500">Arsip historis tidak punya skor prioritas — pilih rentang live (24 jam / 7 / 30 hari).</div>
                    )}
                    {!loading && !archiveRange && topAttentionAreas.length === 0 && (
                      <div className="py-2 text-xs text-gray-500">Tidak ada area dengan deteksi pada periode ini.</div>
                    )}
                    {topAttentionAreas.map((area) => <AttentionAreaRow key={area.areaId} area={area} />)}
                  </div>
                  <Link href={withFilters("/priority-areas", searchParams)} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800">
                    View all <span aria-hidden="true">→</span>
                  </Link>
                </div>
              )}

              {exploreTab === "data" && (
                <div className="space-y-4">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-red-600">layers</span>
                      <h2 className="text-base font-bold text-gray-900">Data</h2>
                    </div>
                    <p className="text-xs text-gray-500">Deteksi yang sedang terlihat di peta.</p>
                  </div>

                  <div className="flex items-center gap-5">
                    <SensorDonut modis={sensorCounts.modis} viirs={sensorCounts.viirs} />
                    <dl className="flex-1 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <dt className="flex items-center gap-2 text-gray-700"><span className="h-2 w-2 rounded-full bg-red-500" />MODIS</dt>
                        <dd className="font-bold text-gray-900">{sensorCounts.modis.toLocaleString()}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="flex items-center gap-2 text-gray-700"><span className="h-2 w-2 rounded-full bg-amber-400" />VIIRS</dt>
                        <dd className="font-bold text-gray-900">{sensorCounts.viirs.toLocaleString()}</dd>
                      </div>
                      <div className="flex items-center justify-between" title="Pasangan MODIS–VIIRS yang dicocokkan sebagai satu kejadian">
                        <dt className="flex items-center gap-2 text-gray-700"><span className="h-2 w-2 rounded-full bg-emerald-600" />Harmonized</dt>
                        <dd className="font-bold text-gray-900">{Math.round(sensorCounts.matched / 2).toLocaleString()}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="space-y-2 border-t border-gray-100 pt-3 text-[11px]" aria-live="polite">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${error ? "bg-red-500" : loading ? "animate-pulse bg-amber-400" : meta?.degraded ? "bg-amber-500" : "bg-emerald-500"}`} />
                      <span className={error ? "text-red-600" : "text-gray-500"}>
                        {error
                          ? error
                          : loading
                            ? (archiveRange ? "Memuat arsip historis…" : (windowLoadingNote(liveWindow) ?? "Memuat data NASA FIRMS…"))
                            : meta
                              ? `Diperbarui ${new Date(meta.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${meta.degraded ? " · sebagian feed gagal" : ""}`
                              : `${visibleMarkers.length.toLocaleString()} sel grid arsip`}
                      </span>
                      <button
                        type="button"
                        onClick={refreshHotspots}
                        disabled={loading || archiveRange}
                        className="ml-auto rounded-md border border-gray-200 px-2 py-1 font-semibold text-emerald-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Refresh
                      </button>
                    </div>
                    <p className="text-gray-400">
                      Sumber: NASA FIRMS · {activeRange.label} · {activeRegion.label} · {includeAllConfidence ? "semua tingkat confidence" : "confidence sedang + tinggi"}
                    </p>
                  </div>
                </div>
              )}

              {exploreTab === "filter" && (
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-red-600">tune</span>
                      <h2 className="text-base font-bold text-gray-900">Filter</h2>
                    </div>
                    <p className="text-xs text-gray-500">Atur apa yang tampil di peta.</p>
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-gray-700">Sensor</p>
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 text-xs font-semibold">
                      {LAYERS.map((layer) => (
                        <button
                          key={layer}
                          type="button"
                          aria-pressed={activeLayer === layer}
                          onClick={() => setActiveLayer(layer)}
                          className={`rounded-md px-2 py-1.5 transition-colors ${
                            activeLayer === layer ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          {layer === "HARMONIZED" ? "Semua" : layer}
                        </button>
                      ))}
                    </div>
                  </div>

                  {([
                    [showReports, setShowReports, "Laporan warga"],
                    [onlyMatched, setOnlyMatched, "Hanya yang cocok MODIS + VIIRS"],
                    [onlyHighFrp, setOnlyHighFrp, "FRP tinggi (> 50 MW)"],
                    [includeAllConfidence, setIncludeAllConfidence, "Sertakan confidence rendah"],
                  ] as [boolean, (value: boolean) => void, string][]).map(([checked, setChecked, label]) => (
                    <label key={label} className="flex items-center gap-2.5 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setChecked(event.target.checked)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      {label}
                    </label>
                  ))}
                  {includeAllConfidence && (
                    <p className="rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                      Lebih banyak titik, tapi lebih besar kemungkinan false positive. Titik confidence rendah ditandai berbeda di peta.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setActiveLayer("HARMONIZED");
                      setOnlyMatched(false);
                      setOnlyHighFrp(false);
                      setShowReports(true);
                      setIncludeAllConfidence(false);
                    }}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    Reset filter
                  </button>
                </div>
              )}
            </div>
          </Card>
        )}

        {(archiveRange || meta?.markers?.truncated) && (
          <div className="absolute bottom-4 left-1/2 z-[1050] flex max-w-[min(620px,calc(100%-2rem))] -translate-x-1/2 items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-xs text-amber-900 shadow-lg backdrop-blur">
            <span className="material-symbols-outlined shrink-0 text-[17px] text-amber-600">info</span>
            <span>
              {archiveRange
                ? `Rentang “${activeRange.label}” memakai agregat grid historis. Marker mewakili aktivitas sel 0,25°, bukan titik satelit individual.`
                : `Menampilkan ${meta?.markers?.shown.toLocaleString()} deteksi dengan FRP tertinggi dari ${meta?.markers?.total.toLocaleString()} deteksi ${activeRange.label.toLowerCase()} (seluruh Indonesia). Panel area tetap dihitung dari semua deteksi.`}
            </span>
          </div>
        )}

        {selectedMarker && <HotspotDetailPanel marker={selectedMarker} onClose={() => setSelectedMarker(null)} />}
      </div>
    </WorkstationLayout>
  );
}

export default function MapExplorerPage() {
  return (
    <Suspense fallback={null}>
      <MapExplorerPageContent />
    </Suspense>
  );
}
