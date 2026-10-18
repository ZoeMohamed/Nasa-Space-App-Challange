"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import StatTile from "@/components/ui/StatTile";
import { getRegionOption, getRangeOption, isDemoRange, isWithinBounds } from "@/lib/filters";
import type { AreaSummary, CommunityReport, HotspotApiResponse, HotspotMarker } from "@/types";

const FireMap = dynamic(() => import("@/components/map/FireMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100">
      <span className="font-medium text-sm text-gray-500 animate-pulse">Memuat peta…</span>
    </div>
  ),
});

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_AREAS_SHOWN = 20;

type DetailTab = "overview" | "detections" | "actionplan";
type DetectionFilter = "all" | "matched" | "viirs" | "modis";

const MATCH_STATUS_LABEL: Record<string, string> = {
  MATCHED: "Matched (MODIS + VIIRS)",
  MODIS_ONLY: "MODIS saja",
  VIIRS_ONLY: "VIIRS saja",
  UNMATCHED: "Belum tervalidasi silang",
};

const MATCH_STATUS_TONE: Record<string, "info" | "neutral"> = {
  MATCHED: "info",
  MODIS_ONLY: "neutral",
  VIIRS_ONLY: "neutral",
  UNMATCHED: "neutral",
};

function formatAcquiredAt(value: string | undefined) {
  if (!value) return "Waktu tidak tercatat";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tercatat";
  return (
    date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
  );
}

const TIER_STYLE: Record<AreaSummary["priorityTier"], { bar: string; badgeBg: string; badgeText: string; badgeBorder: string; label: string; panelBg: string; panelBorder: string }> = {
  high: {
    bar: "bg-[#f04438]",
    badgeBg: "bg-red-100",
    badgeText: "text-[#f04438]",
    badgeBorder: "border-red-200",
    label: "Prioritas Tinggi",
    panelBg: "bg-red-50",
    panelBorder: "border-red-100",
  },
  medium: {
    bar: "bg-orange-500",
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-700",
    badgeBorder: "border-orange-200",
    label: "Prioritas Sedang",
    panelBg: "bg-orange-50",
    panelBorder: "border-orange-100",
  },
  low: {
    bar: "bg-gray-400",
    badgeBg: "bg-gray-100",
    badgeText: "text-gray-600",
    badgeBorder: "border-gray-200",
    label: "Prioritas Rendah",
    panelBg: "bg-gray-50",
    panelBorder: "border-gray-100",
  },
};

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

function trendLabel(growth: number | null) {
  if (growth === null || Number.isNaN(growth)) {
    return { text: "Data belum cukup", icon: "remove", className: "text-gray-400" };
  }
  if (growth > 0.1) return { text: "Meningkat", icon: "trending_up", className: "text-[#f04438]" };
  if (growth < -0.1) return { text: "Menurun", icon: "trending_down", className: "text-emerald-600" };
  return { text: "Stabil", icon: "trending_flat", className: "text-gray-500" };
}

function AreaCard({ area, onOpenDetail }: { area: AreaSummary; onOpenDetail: (areaId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const style = TIER_STYLE[area.priorityTier] ?? TIER_STYLE.low;
  const trend = trendLabel(area.growth);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-1.5 h-full ${style.bar}`}></div>
      <div className="flex flex-col lg:flex-row justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className={`px-2.5 py-0.5 ${style.badgeBg} ${style.badgeText} text-xs font-bold rounded border ${style.badgeBorder} uppercase`}>
              {style.label}
            </span>
            {area.consecutiveActiveDays !== null && area.consecutiveActiveDays > 0 && (
              <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">timer</span>
                Aktif {area.consecutiveActiveDays} hari berturut-turut
              </span>
            )}
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">
            Grid {area.gridLat.toFixed(2)}, {area.gridLon.toFixed(2)}
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Belum ada data batas wilayah administratif — koordinat grid 0.25° ditampilkan apa adanya.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">Jumlah Deteksi</div>
              <div className="font-bold text-gray-900">{area.detections ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Total FRP</div>
              <div className="font-bold text-gray-900">{area.frpSum !== null ? `${area.frpSum.toFixed(0)} MW` : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Tren</div>
              <div className={`font-bold flex items-center gap-1 ${trend.className}`}>
                <span className="material-symbols-outlined text-[14px]">{trend.icon}</span> {trend.text}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Cakupan Sensor</div>
              <div className="font-bold text-gray-900">
                MODIS {area.modisDetections ?? 0} · VIIRS {area.viirsDetections ?? 0}
              </div>
            </div>
          </div>
        </div>

        <div className={`${style.panelBg} rounded-lg p-4 border ${style.panelBorder} w-full lg:w-72 flex flex-col justify-between shrink-0`}>
          <div>
            <h4 className={`text-xs font-bold ${style.badgeText} mb-1 uppercase`}>Kriteria Prioritas</h4>
            <p className="text-xs text-gray-700 mb-2 font-mono">{area.attentionCriteria}</p>
            <p className="text-xs text-gray-600 mb-4">
              Perlu verifikasi lapangan sebelum tindak lanjut. Ini bukan konfirmasi kebakaran.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="w-full bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-gray-50 transition-colors"
            >
              {expanded ? "Sembunyikan detail" : "Lihat detail"}
            </button>
            <button
              type="button"
              onClick={() => onOpenDetail(area.areaId)}
              className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-gray-800 transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">map</span>
              Buka Analisis Area
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <dl className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <dt className="text-gray-500">Area ID</dt>
            <dd className="font-medium text-gray-900">{area.areaId}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Rank prioritas</dt>
            <dd className="font-medium text-gray-900">#{area.priorityRank ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Attention score</dt>
            <dd className="font-medium text-gray-900">{area.attentionScore !== null ? area.attentionScore.toFixed(2) : "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Priority score</dt>
            <dd className="font-medium text-gray-900">{area.priorityScore !== null ? area.priorityScore.toFixed(2) : "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Deteksi pertama</dt>
            <dd className="font-medium text-gray-900">{area.firstDate}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Deteksi puncak</dt>
            <dd className="font-medium text-gray-900">{area.peakDate}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Deteksi terakhir</dt>
            <dd className="font-medium text-gray-900">{area.lastDate}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Hari aktif (total)</dt>
            <dd className="font-medium text-gray-900">{area.activeDays ?? "—"}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

const DETAIL_TABS: { id: DetailTab; label: (count: number) => string }[] = [
  { id: "overview", label: () => "Overview" },
  { id: "detections", label: (count) => `Detections (${count})` },
  { id: "actionplan", label: () => "Action Plan" },
];

function AreaDetailPanel({
  area,
  markers,
  reports,
  onClose,
}: {
  area: AreaSummary;
  markers: HotspotMarker[];
  reports: CommunityReport[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [detectionFilter, setDetectionFilter] = useState<DetectionFilter>("all");
  const style = TIER_STYLE[area.priorityTier] ?? TIER_STYLE.low;
  const trend = trendLabel(area.growth);

  const areaMarkers = useMemo(
    () => markers.filter((marker) => marker.areaId === area.areaId),
    [markers, area.areaId]
  );

  // Reports have no areaId of their own, so match them into this 0.25°
  // grid cell the same way the backend grids satellite detections
  // (see aggregate_grid in fire_pipeline/features.py, cell_size=0.25).
  const areaReports = useMemo(
    () =>
      reports.filter(
        (r) => Math.abs(r.lat - area.gridLat) <= 0.125 && Math.abs(r.lon - area.gridLon) <= 0.125
      ),
    [reports, area.gridLat, area.gridLon]
  );

  const sortedMarkers = useMemo(
    () =>
      [...areaMarkers].sort((a, b) => (b.acquiredAt ?? "").localeCompare(a.acquiredAt ?? "")),
    [areaMarkers]
  );

  const latestMarker = sortedMarkers[0];

  const matchCounts = useMemo(
    () => ({
      all: areaMarkers.length,
      matched: areaMarkers.filter((marker) => marker.matchStatus === "MATCHED").length,
      viirs: areaMarkers.filter((marker) => marker.matchStatus === "VIIRS_ONLY").length,
      modis: areaMarkers.filter((marker) => marker.matchStatus === "MODIS_ONLY").length,
    }),
    [areaMarkers]
  );

  const filteredMarkers = useMemo(() => {
    if (detectionFilter === "all") return sortedMarkers;
    if (detectionFilter === "matched") return sortedMarkers.filter((marker) => marker.matchStatus === "MATCHED");
    if (detectionFilter === "viirs") return sortedMarkers.filter((marker) => marker.matchStatus === "VIIRS_ONLY");
    return sortedMarkers.filter((marker) => marker.matchStatus === "MODIS_ONLY");
  }, [sortedMarkers, detectionFilter]);

  const matchedCount = matchCounts.matched;
  const sensorAgreementPct =
    areaMarkers.length > 0 ? Math.round((matchedCount / areaMarkers.length) * 100) : null;

  return (
    <Card className="overflow-hidden">
      <div className={`flex items-center justify-between gap-3 p-4 border-b border-gray-100 ${style.panelBg}`}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge tone={area.priorityTier}>{style.label}</Badge>
            <span className="text-xs text-gray-500 font-mono">{area.areaId}</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900">
            Grid {area.gridLat.toFixed(2)}, {area.gridLon.toFixed(2)}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 h-9 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
          Tutup
        </button>
      </div>

      <div className="flex items-center gap-1 px-4 pt-3 border-b border-gray-100">
        {DETAIL_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
              tab === item.id
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {item.label(areaMarkers.length)}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="relative rounded-lg overflow-hidden border border-gray-200 h-[340px]">
              <FireMap
                markers={areaMarkers}
                center={[area.gridLat, area.gridLon]}
                zoom={10}
                className="h-full w-full"
                autoFitOnLoad
                reports={areaReports.map((r) => ({
                  id: r.id,
                  lat: r.lat,
                  lng: r.lon,
                  status: r.status,
                  description: r.description,
                  createdAt: r.createdAt,
                }))}
              />
              {areaMarkers.length === 0 && areaReports.length === 0 && (
                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1050] rounded-lg bg-white/95 px-3 py-2 text-[11px] text-gray-600 shadow">
                  Tidak ada deteksi satelit atau laporan warga tercatat untuk sel grid ini saat ini — peta
                  menampilkan lokasinya saja, bukan kesalahan.
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                icon="local_fire_department"
                iconTone="red"
                label="Total Deteksi"
                value={area.detections ?? "—"}
                trend={{ direction: trend.icon === "trending_up" ? "up" : trend.icon === "trending_down" ? "down" : "flat", label: trend.text }}
                caption="Titik panas terkonfirmasi"
              />
              <StatTile
                icon="timer"
                iconTone="amber"
                label="Periode Aktif"
                value={area.activeDays !== null ? `${area.activeDays} Hari` : "—"}
                caption={
                  area.consecutiveActiveDays && area.consecutiveActiveDays > 0
                    ? `Aktif ${area.consecutiveActiveDays} hari berturut-turut`
                    : "Belum ada rangkaian hari aktif"
                }
              />
              <StatTile
                icon="satellite_alt"
                iconTone="blue"
                label="Deteksi Terakhir"
                value={area.lastDate ?? "—"}
                caption={
                  latestMarker
                    ? `${latestMarker.satellite ?? latestMarker.sensor ?? "Sensor tidak tercatat"}`
                    : "Belum ada deteksi"
                }
              />
              <StatTile
                icon="device_thermostat"
                iconTone="gray"
                label="Rerata FRP"
                value={area.frpMean !== null ? `${area.frpMean.toFixed(1)} MW` : "—"}
                caption={area.frpMax !== null ? `Puncak ${area.frpMax.toFixed(1)} MW` : "Energi radiasi termal"}
              />
            </div>
            <p className="lg:col-span-2 text-xs text-gray-500 border-t border-gray-100 pt-3">
              Peta dan statistik di atas hanya mencakup deteksi yang sudah dikaitkan ke grid area ini. Data arah
              angin, indeks kelembapan, tipe lahan, dan status akses jalur darat belum tersedia pada backend —
              tidak ditampilkan agar tidak mengarang nilai.
            </p>
          </div>
        )}

        {tab === "detections" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-gray-500">history</span>
                Detection Timeline
              </h3>
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs font-semibold">
                {([
                  ["all", `Semua (${matchCounts.all})`],
                  ["matched", `Matched (${matchCounts.matched})`],
                  ["viirs", `VIIRS (${matchCounts.viirs})`],
                  ["modis", `MODIS (${matchCounts.modis})`],
                ] as [DetectionFilter, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDetectionFilter(key)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      detectionFilter === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredMarkers.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-10">
                Tidak ada deteksi pada filter ini.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {filteredMarkers.map((marker) => (
                  <li key={marker.id} className="p-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-700">{formatAcquiredAt(marker.acquiredAt)}</span>
                        <Badge tone={MATCH_STATUS_TONE[marker.matchStatus ?? "UNMATCHED"]}>
                          {MATCH_STATUS_LABEL[marker.matchStatus ?? "UNMATCHED"]}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        ID: {marker.id} • Koordinat: {marker.lat.toFixed(4)}, {marker.lng.toFixed(4)}
                      </p>
                    </div>
                    <div className="flex items-center gap-5 shrink-0 text-right">
                      <div>
                        <div className="text-[10px] uppercase text-gray-400">Thermal Power</div>
                        <div className="text-sm font-bold text-gray-900">{marker.frp.toFixed(1)} MW</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-gray-400">Confidence</div>
                        <div className="text-sm font-bold text-gray-900">{marker.confidenceLabel ?? "—"}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-400 mt-3">
              Menampilkan {filteredMarkers.length} dari {areaMarkers.length} deteksi tercatat untuk area ini.
            </p>
          </div>
        )}

        {tab === "actionplan" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[18px] text-gray-500">report</span>
                Rencana Tindak Lanjut &amp; Analisis Klaster
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Kriteria: <span className="font-mono">{area.attentionCriteria}</span>
              </p>
              <p className="text-sm text-gray-700 mb-2">
                Wilayah ini dikategorikan sebagai{" "}
                <Badge tone={area.priorityTier}>{style.label}</Badge> berdasarkan
                konvergensi deteksi sensor berikut. Ini bukan konfirmasi kebakaran.
              </p>
            </div>

            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[16px] text-[#f04438]">local_fire_department</span>
                  <span className="text-sm font-semibold text-gray-900">Deteksi Berulang</span>
                </div>
                <p className="text-xs text-gray-600">
                  Hotspot terdeteksi pada {area.activeDays ?? "—"} hari aktif
                  {area.consecutiveActiveDays && area.consecutiveActiveDays > 0
                    ? ` (${area.consecutiveActiveDays} hari berturut-turut)`
                    : ""}
                  , dari {area.firstDate} hingga {area.lastDate}.
                </p>
              </div>
              <div className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                  <span className="text-sm font-semibold text-gray-900">Sensor Agreement</span>
                </div>
                <p className="text-xs text-gray-600">
                  {areaMarkers.length > 0
                    ? `Konfirmasi lintas sensor MODIS dan VIIRS pada ${matchedCount} dari ${areaMarkers.length} deteksi (${sensorAgreementPct}%).`
                    : "Belum ada deteksi untuk dibandingkan antar sensor."}
                </p>
              </div>
              <p className="text-xs text-gray-400">
                Indeks bahan bakar kering (FFMC) belum tersedia pada backend — tidak ditampilkan.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold text-gray-700 uppercase mb-2">Rekomendasi Langkah Berikutnya</h4>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-emerald-600 mt-0.5">task_alt</span>
                  Rekomendasikan verifikasi lapangan sebelum tindak lanjut.
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-blue-600 mt-0.5">satellite_alt</span>
                  Pantau kelanjutan deteksi sensor MODIS/VIIRS untuk konfirmasi tambahan.
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-gray-500 mt-0.5">forward_to_inbox</span>
                  Teruskan temuan ke otoritas lapangan (BPBD/Manggala Agni) untuk keputusan tindak lanjut selanjutnya.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function PriorityAreasPageContent() {
  const searchParams = useSearchParams();
  const activeRegion = getRegionOption(searchParams.get("region"));
  const activeRange = getRangeOption(searchParams.get("range"));
  const demoRange = isDemoRange(searchParams.get("range"));

  const [allAreas, setAllAreas] = useState<AreaSummary[]>([]);
  const [allMarkers, setAllMarkers] = useState<HotspotMarker[]>([]);
  const [meta, setMeta] = useState<HotspotApiResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [reports, setReports] = useState<CommunityReport[]>([]);

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

  // Region filter — client-side bbox check against the already-fetched live areas/markers.
  // Bounding boxes are approximate (see src/lib/filters.ts), "Seluruh Indonesia" is a no-op.
  const areas = useMemo(
    () => allAreas.filter((area) => isWithinBounds(area.gridLat, area.gridLon, activeRegion.bounds)),
    [allAreas, activeRegion]
  );
  const markers = useMemo(
    () => allMarkers.filter((marker) => isWithinBounds(marker.lat, marker.lng, activeRegion.bounds)),
    [allMarkers, activeRegion]
  );

  useEffect(() => {
    const controller = new AbortController();

    const load = () => {
      requestHotspots(controller.signal)
        .then((body) => {
          setAllAreas(body.areas);
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

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const body = await requestHotspots();
      setAllAreas(body.areas);
      setAllMarkers(body.markers);
      setMeta(body.meta);
    } catch (requestError) {
      setError(requestErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  const sorted = [...areas]
    .sort((a, b) => (a.priorityRank ?? Number.MAX_SAFE_INTEGER) - (b.priorityRank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, MAX_AREAS_SHOWN);

  const selectedArea = selectedAreaId ? areas.find((area) => area.areaId === selectedAreaId) ?? null : null;

  return (
    <WorkstationLayout activeTab="Priority Areas">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
              <span>Areas of Attention & Priority</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Priority Areas</h1>
            <p className="text-sm text-gray-500 max-w-2xl">
              Area yang disarankan untuk verifikasi lapangan lebih dulu, diurutkan dari skor prioritas tertinggi. Kriteria & bobot ditampilkan apa adanya — ini bukan prediksi atau konfirmasi kebakaran.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="h-9 px-4 bg-white border border-gray-200 rounded-lg text-sm font-medium text-blue-600 shadow-sm hover:bg-gray-50 disabled:text-gray-400"
          >
            Refresh
          </button>
        </div>

        <div className="min-h-6 flex items-center gap-2 text-xs" aria-live="polite">
          <span
            className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : loading ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`}
          />
          <span className={error ? "text-red-600" : "text-gray-500"}>
            {error
              ? error
              : loading
                ? "NASA live → Python processing…"
                : meta
                  ? `${meta.processing.areasAnalyzed.toLocaleString()} area dianalisis • diperbarui ${new Date(meta.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
          </span>
          <span className="text-gray-400">• Wilayah: {activeRegion.label}</span>
        </div>

        {/* Priority ranking is always derived from the live 24h NASA FIRMS window — there's no
            historical priority store, so a non-24h range selection doesn't change this list.
            Honest note instead of fabricating a historical ranking. */}
        {demoRange && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900">
            <span className="material-symbols-outlined text-amber-600 text-base shrink-0">info</span>
            <p>
              Rentang waktu &quot;{activeRange.label}&quot; dipilih, tetapi Priority Areas selalu menampilkan data
              langsung 24 jam terakhir — belum ada riwayat prioritas historis untuk rentang ini.
            </p>
          </div>
        )}

        {selectedArea && (
          <AreaDetailPanel
            area={selectedArea}
            markers={markers}
            reports={reports}
            onClose={() => setSelectedAreaId(null)}
          />
        )}

        <div className="space-y-4">
          {!loading && !error && sorted.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-10 text-center text-sm text-gray-500">
              Tidak ada area dengan deteksi pada periode ini.
            </div>
          )}
          {sorted.map((area) => (
            <AreaCard key={area.areaId} area={area} onOpenDetail={setSelectedAreaId} />
          ))}
        </div>
      </div>
    </WorkstationLayout>
  );
}

export default function PriorityAreasPage() {
  return (
    <Suspense fallback={null}>
      <PriorityAreasPageContent />
    </Suspense>
  );
}
