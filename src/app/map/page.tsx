"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { getRegionOption, getRangeOption, isDemoRange, isWithinBounds } from "@/lib/filters";
import type { AreaSummary, HotspotApiResponse, HotspotMarker } from "@/types";

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
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ATTENTION_AREAS = 3;
type Layer = (typeof LAYERS)[number];
type ExploreTab = "hotspot" | "data" | "filter";
type MapDataResponse = HotspotApiResponse | { markers: HotspotMarker[] };

function isLiveMapResponse(body: MapDataResponse): body is HotspotApiResponse {
  return "areas" in body && "meta" in body && body.meta.provider === "NASA FIRMS";
}

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

async function requestHotspots(signal?: AbortSignal) {
  const response = await fetch("/api/hotspots", { signal, cache: "no-store" });
  const body = (await response.json()) as HotspotApiResponse & { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to load NASA FIRMS data.");
  }

  return body;
}

type HistoricalMapWindow = { days: 7 | 30 } | { startDate: string; endDate: string };

async function requestHistoricalMap(window: HistoricalMapWindow, bounds: ReturnType<typeof getRegionOption>["bounds"], signal?: AbortSignal) {
  const params = new URLSearchParams("days" in window ? { days: String(window.days) } : { start_date: window.startDate, end_date: window.endDate });
  if (bounds) {
    params.set("min_lat", String(bounds.minLat));
    params.set("max_lat", String(bounds.maxLat));
    params.set("min_lon", String(bounds.minLon));
    params.set("max_lon", String(bounds.maxLon));
  }
  const response = await fetch(`/api/historical/map?${params.toString()}`, { signal, cache: "no-store" });
  const body = (await response.json()) as { markers?: HotspotMarker[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Unable to load historical NASA FIRMS map data.");
  return { markers: body.markers ?? [] };
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
        <span className="text-xs font-bold text-[var(--color-text-main)]">
          Grid {area.gridLat.toFixed(2)}, {area.gridLon.toFixed(2)}
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
  const acquired = formatAcquiredAt(marker.acquiredAt);
  const frpPercent = Math.max(6, Math.min(100, (marker.frp / 100) * 100));
  const confidenceText =
    marker.confidenceLabel ?? (marker.confidence !== undefined ? `${marker.confidence.toFixed(0)}%` : null);

  return (
    <Card className="absolute top-4 right-4 z-[1200] w-[320px] max-h-[calc(100%-2rem)] overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-red-600">local_fire_department</span>
          <h2 className="text-sm font-bold text-[var(--color-text-main)]">Deteksi Titik Panas (Hotspot)</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup detail hotspot"
          className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 py-3 border-b border-[var(--color-border)]">
        <div>
          <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide">
            <span className="material-symbols-outlined text-[12px]">location_on</span>
            Lokasi
          </div>
          <div className="text-xs font-bold text-[var(--color-text-main)] mt-1">{marker.label}</div>
          <div className="text-[10px] text-[var(--color-text-muted)]">
            {marker.lat.toFixed(4)}°, {marker.lng.toFixed(4)}°
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide">
            <span className="material-symbols-outlined text-[12px]">schedule</span>
            Deteksi
          </div>
          <div className="text-xs font-bold text-[var(--color-text-main)] mt-1">{acquired.date}</div>
          <div className="text-[10px] text-[var(--color-text-muted)]">{acquired.time}</div>
        </div>
      </div>

      <div className="py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide">
            Intensitas Panas
          </span>
          <Badge tone={SEVERITY_BADGE_TONE[marker.severity]}>{marker.severity}</Badge>
        </div>
        <div className="flex items-end justify-between mb-2">
          <div>
            <span className="text-[11px] text-[var(--color-text-muted)]">Daya radiasi (FRP): </span>
            <span className="text-base font-bold text-[var(--color-text-main)]">{marker.frp.toFixed(1)}</span>
            <span className="text-xs font-medium text-[var(--color-text-muted)]"> MW</span>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-600"
            style={{ width: `${frpPercent}%` }}
          />
        </div>
      </div>

      <div className="py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
          <span className="material-symbols-outlined text-[12px]">satellite_alt</span>
          Sumber Deteksi
        </div>
        <div className="text-xs font-semibold text-[var(--color-text-main)]">
          {marker.sensor ?? marker.source ?? "NASA FIRMS"} • {marker.satellite ?? "Satelit tidak diketahui"}
        </div>
        <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
          {confidenceText ? `Keyakinan: ${confidenceText}` : "Keyakinan tidak dilaporkan"}
          {marker.matchStatus && ` • Status: ${marker.matchStatus.replaceAll("_", " ")}`}
        </div>
        {marker.priorityTier && (
          <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
            Prioritas pipeline: {marker.priorityTier}
            {marker.priorityScore !== undefined ? ` (${marker.priorityScore.toFixed(2)})` : ""}
          </div>
        )}
      </div>

      <div className="pt-3 space-y-2">
        <p className="text-[13px] font-semibold text-[var(--color-text-main)]">Cara membaca titik ini</p>
        <p className="text-xs leading-[18px] text-[var(--color-text-muted)]">
          FRP {marker.frp.toFixed(1)} MW menunjukkan daya radiasi panas yang terdeteksi satelit, bukan luas lahan
          terbakar.
        </p>
        {confidenceText && (
          <p className="text-xs leading-[18px] text-[var(--color-text-muted)]">
            Keyakinan {confidenceText} adalah kualitas deteksi pada data sumber, bukan peluang kebakaran atau
            tingkat bahaya.
          </p>
        )}
        <p className="text-xs leading-[18px] font-semibold text-emerald-800">
          Tindak lanjut: cocokkan lokasi dan waktu, lalu verifikasi kondisi lapangan sesuai prosedur. Titik panas
          belum membuktikan adanya kebakaran.
        </p>
      </div>
    </Card>
  );
}

function MapExplorerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeRegion = getRegionOption(searchParams.get("region"));
  const activeRange = getRangeOption(searchParams.get("range"));
  const demoRange = isDemoRange(searchParams.get("range"));

  const [activeLayer, setActiveLayer] = useState<Layer>("HARMONIZED");
  const [markers, setMarkers] = useState<HotspotMarker[]>([]);
  const [areas, setAreas] = useState<AreaSummary[]>([]);
  const [meta, setMeta] = useState<HotspotApiResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<HotspotMarker | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [showAttentionPanel, setShowAttentionPanel] = useState(true);
  const [exploreTab, setExploreTab] = useState<ExploreTab>("hotspot");
  const [onlyMatched, setOnlyMatched] = useState(false);
  const [onlyHighFrp, setOnlyHighFrp] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const load = () => {
      const request = activeRange.value === "24h"
        ? requestHotspots(controller.signal)
        : requestHistoricalMap(
          activeRange.value === "7d" ? { days: 7 } : activeRange.value === "30d" ? { days: 30 } : { startDate: "2023-01-01", endDate: "2024-12-31" },
          activeRegion.bounds,
          controller.signal
        );
      request
        .then((body) => {
          setMarkers(body.markers);
          if (isLiveMapResponse(body)) {
            setAreas(body.areas);
            setMeta(body.meta);
          } else {
            setAreas([]);
            setMeta(null);
          }
          setError(null);
          setSelectedMarker((prev) => (prev ? (body.markers.find((m) => m.id === prev.id) ?? prev) : null));
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
  }, [activeRange.value, activeRegion.bounds]);

  async function refreshHotspots() {
    setLoading(true);
    setError(null);

    try {
      const body = activeRange.value === "24h"
        ? await requestHotspots()
        : await requestHistoricalMap(
          activeRange.value === "7d" ? { days: 7 } : activeRange.value === "30d" ? { days: 30 } : { startDate: "2023-01-01", endDate: "2024-12-31" },
          activeRegion.bounds
        );
      setMarkers(body.markers);
      if (isLiveMapResponse(body)) {
        setAreas(body.areas);
        setMeta(body.meta);
      } else {
        setAreas([]);
        setMeta(null);
      }
      setSelectedMarker((prev) => (prev ? (body.markers.find((m) => m.id === prev.id) ?? prev) : null));
    } catch (requestError) {
      setError(requestErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  // Region + sensor-layer filter — both are real client-side filters over already-fetched live
  // data (region bbox from src/lib/filters.ts is approximate, "Seluruh Indonesia" is a no-op).
  const visibleMarkers = useMemo(() => {
    const byLayer = activeRange.value !== "24h" || activeLayer === "HARMONIZED"
      ? markers
      : markers.filter((marker) => marker.sensor === activeLayer);
    return byLayer
      .filter((marker) => isWithinBounds(marker.lat, marker.lng, activeRegion.bounds))
      .filter((marker) => !onlyMatched || marker.matchStatus === "MATCHED")
      .filter((marker) => !onlyHighFrp || marker.frp > 50);
  }, [activeLayer, activeRange.value, markers, activeRegion, onlyMatched, onlyHighFrp]);

  const visibleAreas = useMemo(
    () => areas.filter((area) => isWithinBounds(area.gridLat, area.gridLon, activeRegion.bounds)),
    [areas, activeRegion]
  );

  const topAttentionAreas = useMemo(
    () =>
      [...visibleAreas]
        .sort((a, b) => (a.priorityRank ?? Number.MAX_SAFE_INTEGER) - (b.priorityRank ?? Number.MAX_SAFE_INTEGER))
        .slice(0, MAX_ATTENTION_AREAS),
    [visibleAreas]
  );
  const sensorCounts = useMemo(
    () => ({
      modis: visibleMarkers.filter((marker) => marker.sensor === "MODIS").length,
      viirs: visibleMarkers.filter((marker) => marker.sensor === "VIIRS").length,
      matched: visibleMarkers.filter((marker) => marker.matchStatus === "MATCHED").length,
    }),
    [visibleMarkers]
  );

  return (
    <WorkstationLayout activeTab="Map" fullBleed>
      <div className="relative h-full w-full overflow-hidden bg-[#d9e4df]">
        <FireMap
          markers={visibleMarkers}
          center={[-2.2, 118]}
          zoom={5}
          className="absolute inset-0 h-full w-full"
          showSeverityLegend={false}
          onMarkerSelect={setSelectedMarker}
        />

        {!showControls && (
          <button
            type="button"
            onClick={() => setShowControls(true)}
            aria-label="Tampilkan kontrol peta"
            className="absolute left-4 top-4 z-[1200] inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/70 bg-white/90 text-gray-700 shadow-lg backdrop-blur hover:bg-white"
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </button>
        )}

        {showControls && (
          <Card className="absolute left-4 top-4 z-[1100] w-[min(430px,calc(100%-2rem))] p-4 shadow-xl backdrop-blur-sm bg-white/95">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 pb-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  <span className="material-symbols-outlined text-[16px]">explore</span>
                  Spatial satellite intelligence
                </div>
                <h1 className="mt-1 text-xl font-bold text-gray-900">Map Explorer</h1>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  Live NASA FIRMS observations cleaned and prioritized by the Python fire pipeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowControls(false)}
                aria-label="Sembunyikan kontrol peta"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 text-xs font-semibold">
                {LAYERS.map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    onClick={() => setActiveLayer(layer)}
                    className={`rounded-md px-2.5 py-1.5 transition-colors ${
                      activeLayer === layer ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    {layer}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowAttentionPanel((value) => !value)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <span className="material-symbols-outlined text-[16px]">{showAttentionPanel ? "visibility_off" : "visibility"}</span>
                {showAttentionPanel ? "Sembunyikan panel" : "Tampilkan panel"}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-gray-600">
              <span className="rounded-md bg-gray-100 px-2.5 py-1.5">{activeRange.label}</span>
              <span className="rounded-md bg-gray-100 px-2.5 py-1.5">{activeRegion.label}</span>
              <span className="rounded-md bg-gray-100 px-2.5 py-1.5">Confidence: High</span>
              <button
                type="button"
                onClick={() => void refreshHotspots()}
                disabled={loading}
                className="rounded-md bg-emerald-700 px-2.5 py-1.5 font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => router.push("/activities")}
                className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 font-semibold text-blue-700 hover:bg-blue-50"
              >
                Table view
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 text-[11px]" aria-live="polite">
              <span className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : loading ? "animate-pulse bg-amber-400" : "bg-emerald-500"}`} />
              <span className={error ? "text-red-600" : "text-gray-500"}>
                {error
                  ? error
                  : loading
                    ? "NASA live → Python processing…"
                    : `${visibleMarkers.length.toLocaleString()} ${activeLayer === "HARMONIZED" ? "combined" : activeLayer} observations`}
              </span>
              {!loading && !error && <span className="text-gray-400">• {meta?.sources.filter((source) => source.available).length ?? 0}/4 feeds</span>}
            </div>
          </Card>
        )}

        {demoRange && (
          <div className="absolute bottom-4 left-1/2 z-[1050] flex max-w-[min(620px,calc(100%-2rem))] -translate-x-1/2 items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-xs text-amber-900 shadow-lg backdrop-blur">
            <span className="material-symbols-outlined shrink-0 text-[17px] text-amber-600">info</span>
            <span>Rentang “{activeRange.label}” memakai agregat grid historis. Marker mewakili aktivitas sel 0,25°, bukan titik satelit individual.</span>
          </div>
        )}

        {showAttentionPanel && (
          <Card className="absolute bottom-4 left-4 z-[1100] w-[min(360px,calc(100%-2rem))] max-h-[calc(100%-8rem)] overflow-y-auto p-4 shadow-xl backdrop-blur-sm bg-white/95">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-200">
              <span className="material-symbols-outlined text-[18px] text-red-600">explore</span>
              <h2 className="text-base font-bold text-gray-900">Explore Map</h2>
              <button
                type="button"
                onClick={() => setShowAttentionPanel(false)}
                aria-label="Sembunyikan panel explore map"
                className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <span className="material-symbols-outlined text-[17px]">close</span>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-[#f1f2ff] p-1 text-[11px] font-bold">
              {([
                ["hotspot", "local_fire_department", "Hotspot"],
                ["data", "layers", "data"],
                ["filter", "tune", "filter"],
              ] as [ExploreTab, string, string][]).map(([tab, icon, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setExploreTab(tab)}
                  className={`flex items-center justify-center gap-1 rounded-md px-2 py-2 capitalize transition-colors ${
                    exploreTab === tab ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            {exploreTab === "hotspot" && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[17px] text-red-600">crisis_alert</span>
                  <h3 className="text-sm font-bold text-gray-900">Areas Requiring Attention</h3>
                </div>
                <p className="text-xs text-gray-500 mb-3">Prioritized by multi-satellite consensus and FRP severity.</p>
                <div className="space-y-2 mb-3">
                  {loading && topAttentionAreas.length === 0 && <div className="text-xs text-gray-500 py-2">Memuat area prioritas…</div>}
                  {!loading && topAttentionAreas.length === 0 && <div className="text-xs text-gray-500 py-2">Tidak ada area dengan deteksi pada periode ini.</div>}
                  {topAttentionAreas.map((area) => <AttentionAreaRow key={area.areaId} area={area} />)}
                </div>
                <Link href="/priority-areas" className="text-xs font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1">
                  View all <span aria-hidden="true">→</span>
                </Link>
              </div>
            )}

            {exploreTab === "data" && (
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Data layer</h3>
                  <p className="mt-1 text-xs text-gray-500">Ringkasan observasi yang sedang terlihat di peta.</p>
                </div>
                {(["MODIS", "VIIRS", "Harmonized"] as const).map((label) => {
                  const value = label === "MODIS" ? sensorCounts.modis : label === "VIIRS" ? sensorCounts.viirs : sensorCounts.matched;
                  const max = Math.max(visibleMarkers.length, 1);
                  return (
                    <div key={label}>
                      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-gray-700">
                        <span>{label}</span><span>{value}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full rounded-full ${label === "MODIS" ? "bg-red-500" : label === "VIIRS" ? "bg-amber-400" : "bg-emerald-600"}`} style={{ width: `${(value / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
                <p className="border-t border-gray-100 pt-3 text-[11px] text-gray-400">Sumber: NASA FIRMS · Python fire pipeline · snapshot 24 jam.</p>
              </div>
            )}

            {exploreTab === "filter" && (
              <div className="mt-4 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Filtering Area</h3>
                  <p className="mt-1 text-xs text-gray-500">Filter ini langsung mengatur marker yang terlihat.</p>
                </div>
                <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-xs text-gray-700 hover:bg-gray-50">
                  <input type="checkbox" checked={onlyMatched} onChange={(event) => setOnlyMatched(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                  <span><strong className="font-semibold">Hanya matched</strong><br /><span className="text-gray-500">MODIS dan VIIRS memiliki pasangan terdekat.</span></span>
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-xs text-gray-700 hover:bg-gray-50">
                  <input type="checkbox" checked={onlyHighFrp} onChange={(event) => setOnlyHighFrp(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                  <span><strong className="font-semibold">FRP tinggi (&gt;50 MW)</strong><br /><span className="text-gray-500">Tampilkan anomali panas dengan intensitas lebih tinggi.</span></span>
                </label>
                <button type="button" onClick={() => { setOnlyMatched(false); setOnlyHighFrp(false); }} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                  Reset filter
                </button>
              </div>
            )}
          </Card>
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
