"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import StatTile from "@/components/ui/StatTile";
import Link from "next/link";
import { getRegionOption, getRangeOption, isArchiveRange, liveWindowFor, matchesRegion, labelOf, withFilters } from "@/lib/filters";
import { windowLoadingNote } from "@/lib/hotspots";
import { useLiveHotspots } from "@/lib/useLiveHotspots";
import type { AreaSummary, CommunityReport, HotspotMarker } from "@/types";
import { areaRegionLabel, formatAdminFull } from "@/lib/adminRegion";
import MapLoadingText from "@/components/map/MapLoadingText";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const FireMap = dynamic(() => import("@/components/map/FireMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100">
      <span className="font-medium text-sm text-gray-500 animate-pulse"><MapLoadingText /></span>
    </div>
  ),
});

const MAX_AREAS_SHOWN = 20;

type DetailTab = "overview" | "detections" | "actionplan";
type DetectionFilter = "all" | "matched" | "viirs" | "modis";

const MATCH_STATUS_LABEL: Record<string, [string, string]> = {
  MATCHED: ["Cocok (MODIS + VIIRS)", "Matched (MODIS + VIIRS)"],
  MODIS_ONLY: ["MODIS saja", "MODIS only"],
  VIIRS_ONLY: ["VIIRS saja", "VIIRS only"],
  UNMATCHED: ["Belum dicocokkan", "Not cross-matched"],
};
type Tr = (id: string, en: string) => string;

const MATCH_STATUS_TONE: Record<string, "info" | "neutral"> = {
  MATCHED: "info",
  MODIS_ONLY: "neutral",
  VIIRS_ONLY: "neutral",
  UNMATCHED: "neutral",
};

function formatAcquiredAt(value: string | undefined, language: "id" | "en") {
  const missing = language === "en" ? "Time not recorded" : "Waktu tidak tercatat";
  if (!value) return missing;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return missing;
  return (
    date.toLocaleString(language === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
  );
}

const TIER_STYLE: Record<AreaSummary["priorityTier"], { bar: string; badgeBg: string; badgeText: string; badgeBorder: string; label: [string, string]; panelBg: string; panelBorder: string }> = {
  high: {
    bar: "bg-[#f04438]",
    badgeBg: "bg-red-100",
    badgeText: "text-[#f04438]",
    badgeBorder: "border-red-200",
    label: ["Prioritas Tinggi", "High Priority"],
    panelBg: "bg-red-50",
    panelBorder: "border-red-100",
  },
  medium: {
    bar: "bg-orange-500",
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-700",
    badgeBorder: "border-orange-200",
    label: ["Prioritas Sedang", "Medium Priority"],
    panelBg: "bg-orange-50",
    panelBorder: "border-orange-100",
  },
  low: {
    bar: "bg-gray-400",
    badgeBg: "bg-gray-100",
    badgeText: "text-gray-600",
    badgeBorder: "border-gray-200",
    label: ["Prioritas Rendah", "Low Priority"],
    panelBg: "bg-gray-50",
    panelBorder: "border-gray-100",
  },
};

function trendLabel(growth: number | null, tr: Tr) {
  if (growth === null || Number.isNaN(growth)) {
    return { text: tr("Data belum cukup", "Not enough data"), icon: "remove", className: "text-gray-400" };
  }
  if (growth > 0.1) return { text: tr("Meningkat", "Rising"), icon: "trending_up", className: "text-[#f04438]" };
  if (growth < -0.1) return { text: tr("Menurun", "Falling"), icon: "trending_down", className: "text-emerald-600" };
  return { text: tr("Stabil", "Stable"), icon: "trending_flat", className: "text-gray-500" };
}

/** Plain-language reasons, each read straight from this area's own pipeline fields. */
function priorityReasons(area: AreaSummary, tr: Tr, periodLabel: string): string[] {
  const reasons: string[] = [];
  if (area.detections) reasons.push(tr(`${area.detections} deteksi dalam ${periodLabel}`, `${area.detections} detections in the ${periodLabel}`));
  if (area.frpMax !== null && area.frpMax > 0)
    reasons.push(tr(`Intensitas panas tertinggi ${area.frpMax.toFixed(0)} MW`, `Peak heat intensity ${area.frpMax.toFixed(0)} MW`));
  if ((area.modisDetections ?? 0) > 0 && (area.viirsDetections ?? 0) > 0) reasons.push(tr("Terlihat oleh MODIS dan VIIRS", "Seen by both MODIS and VIIRS"));
  if (area.consecutiveActiveDays !== null && area.consecutiveActiveDays > 1)
    reasons.push(tr(`Aktif ${area.consecutiveActiveDays} hari berturut-turut`, `Active ${area.consecutiveActiveDays} days in a row`));
  if (area.growth !== null && area.growth > 0.1) reasons.push(tr("Aktivitas sedang meningkat", "Activity is rising"));
  return reasons.slice(0, 3);
}

function AreaCard({
  area,
  onOpenDetail,
  periodLabel,
}: {
  area: AreaSummary;
  onOpenDetail: (areaId: string) => void;
  periodLabel: string;
}) {
  const { tr, language } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const style = TIER_STYLE[area.priorityTier] ?? TIER_STYLE.low;
  const trend = trendLabel(area.growth, tr);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-1.5 h-full ${style.bar}`}></div>
      <div className="flex flex-col lg:flex-row justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className={`px-2.5 py-0.5 ${style.badgeBg} ${style.badgeText} text-xs font-bold rounded border ${style.badgeBorder} uppercase`}>
              {tr(...style.label)}
            </span>
            {area.consecutiveActiveDays !== null && area.consecutiveActiveDays > 0 && (
              <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">timer</span>
                {tr(`Aktif ${area.consecutiveActiveDays} hari berturut-turut`, `Active ${area.consecutiveActiveDays} days in a row`)}
              </span>
            )}
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">{areaRegionLabel(area, language).title}</h3>
          <p className="text-sm text-gray-600 mb-4">{areaRegionLabel(area, language).caption}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">{tr("Jumlah Deteksi", "Detections")}</div>
              <div className="font-bold text-gray-900">{area.detections ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Total FRP</div>
              <div className="font-bold text-gray-900">{area.frpSum !== null ? `${area.frpSum.toFixed(0)} MW` : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{tr("Tren", "Trend")}</div>
              <div className={`font-bold flex items-center gap-1 ${trend.className}`}>
                <span className="material-symbols-outlined text-[14px]">{trend.icon}</span> {trend.text}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{tr("Cakupan Sensor", "Sensor Coverage")}</div>
              <div className="font-bold text-gray-900">
                MODIS {area.modisDetections ?? 0} · VIIRS {area.viirsDetections ?? 0}
              </div>
            </div>
          </div>
        </div>

        <div className={`${style.panelBg} rounded-lg p-4 border ${style.panelBorder} w-full lg:w-72 flex flex-col justify-between shrink-0`}>
          <div>
            <h4 className={`text-xs font-bold ${style.badgeText} mb-1 uppercase`}>{tr("Skor Prioritas", "Priority Score")}</h4>
            <p className="mb-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">
                {area.priorityScore !== null ? Math.round(area.priorityScore * 100) : "—"}
              </span>
              <span className="text-xs text-gray-500">/ 100</span>
              {area.priorityRank !== null && (
                <span className="ml-auto text-xs font-semibold text-gray-600">{tr("Peringkat", "Rank")} #{area.priorityRank}</span>
              )}
            </p>
            {priorityReasons(area, tr, periodLabel).length > 0 && (
              <ul className="space-y-1 mb-3">
                {priorityReasons(area, tr, periodLabel).map((reason) => (
                  <li key={reason} className="flex items-start gap-1.5 text-xs text-gray-700">
                    <span className="material-symbols-outlined text-[14px] text-gray-500">check_small</span>
                    {reason}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-600 mb-4">{tr("Langkah berikutnya: verifikasi lapangan.", "Next step: field verification.")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="w-full bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-gray-50 transition-colors"
            >
              {expanded ? tr("Sembunyikan detail", "Hide details") : tr("Lihat detail", "View details")}
            </button>
            <button
              type="button"
              onClick={() => onOpenDetail(area.areaId)}
              className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-gray-800 transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">map</span>
              {tr("Buka Analisis Area", "Open Area Analysis")}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <dl className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <dt className="text-gray-500">{tr("ID Area", "Area ID")}</dt>
            <dd className="font-medium text-gray-900">{area.areaId}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{tr("Peringkat prioritas", "Priority rank")}</dt>
            <dd className="font-medium text-gray-900">#{area.priorityRank ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{tr("Skor atensi", "Attention score")}</dt>
            <dd className="font-medium text-gray-900">{area.attentionScore !== null ? area.attentionScore.toFixed(2) : "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{tr("Skor prioritas", "Priority score")}</dt>
            <dd className="font-medium text-gray-900">{area.priorityScore !== null ? area.priorityScore.toFixed(2) : "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{tr("Deteksi pertama", "First detection")}</dt>
            <dd className="font-medium text-gray-900">{area.firstDate}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{tr("Deteksi puncak", "Peak detection")}</dt>
            <dd className="font-medium text-gray-900">{area.peakDate}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{tr("Deteksi terakhir", "Last detection")}</dt>
            <dd className="font-medium text-gray-900">{area.lastDate}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{tr("Hari aktif (total)", "Active days (total)")}</dt>
            <dd className="font-medium text-gray-900">{area.activeDays ?? "—"}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

const DETAIL_TABS: { id: DetailTab; label: (count: number, tr: Tr) => string }[] = [
  { id: "overview", label: (_count, tr) => tr("Ringkasan", "Overview") },
  { id: "detections", label: (count, tr) => `${tr("Deteksi", "Detections")} (${count})` },
  { id: "actionplan", label: (_count, tr) => tr("Rencana Aksi", "Action Plan") },
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
  const { tr, language } = useTranslation();
  const [tab, setTab] = useState<DetailTab>("overview");
  const [detectionFilter, setDetectionFilter] = useState<DetectionFilter>("all");
  const style = TIER_STYLE[area.priorityTier] ?? TIER_STYLE.low;
  const trend = trendLabel(area.growth, tr);

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
            <Badge tone={area.priorityTier}>{tr(...style.label)}</Badge>
            <span className="text-xs text-gray-500 font-mono">{area.areaId}</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900">{areaRegionLabel(area, language).title}</h2>
          <p className="text-xs text-gray-500">{areaRegionLabel(area, language).caption}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 h-9 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
          {tr("Tutup", "Close")}
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
            {item.label(areaMarkers.length, tr)}
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
                  {tr(
                    "Tidak ada deteksi satelit atau laporan warga tercatat untuk sel grid ini saat ini — peta menampilkan lokasinya saja, bukan kesalahan.",
                    "No satellite detections or citizen reports recorded for this grid cell right now — the map shows its location only, not an error."
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                icon="local_fire_department"
                iconTone="red"
                label={tr("Total Deteksi", "Total Detections")}
                value={area.detections ?? "—"}
                trend={{ direction: trend.icon === "trending_up" ? "up" : trend.icon === "trending_down" ? "down" : "flat", label: trend.text }}
                caption={tr("Titik panas satelit, belum dikonfirmasi lapangan", "Satellite hotspots, not field-confirmed")}
              />
              <StatTile
                icon="timer"
                iconTone="amber"
                label={tr("Periode Aktif", "Active Period")}
                value={area.activeDays !== null ? tr(`${area.activeDays} Hari`, `${area.activeDays} Days`) : "—"}
                caption={
                  area.consecutiveActiveDays && area.consecutiveActiveDays > 0
                    ? tr(`Aktif ${area.consecutiveActiveDays} hari berturut-turut`, `Active ${area.consecutiveActiveDays} days in a row`)
                    : tr("Belum ada rangkaian hari aktif", "No run of active days yet")
                }
              />
              <StatTile
                icon="satellite_alt"
                iconTone="blue"
                label={tr("Deteksi Terakhir", "Last Detection")}
                value={area.lastDate ?? "—"}
                caption={
                  latestMarker
                    ? `${latestMarker.satellite ?? latestMarker.sensor ?? tr("Sensor tidak tercatat", "Sensor not recorded")}`
                    : tr("Belum ada deteksi", "No detections yet")
                }
              />
              <StatTile
                icon="device_thermostat"
                iconTone="gray"
                label={tr("Rerata FRP", "Mean FRP")}
                value={area.frpMean !== null ? `${area.frpMean.toFixed(1)} MW` : "—"}
                caption={area.frpMax !== null ? `${tr("Puncak", "Peak")} ${area.frpMax.toFixed(1)} MW` : tr("Energi radiasi termal", "Thermal radiative energy")}
              />
            </div>
            <p className="lg:col-span-2 text-xs text-gray-500 border-t border-gray-100 pt-3">
              {tr(
                "Peta dan statistik di atas hanya mencakup deteksi yang sudah dikaitkan ke grid area ini. Indeks kelembapan, tipe lahan, dan status akses jalur darat belum tersedia — tidak ditampilkan agar tidak mengarang nilai.",
                "The map and stats above only cover detections linked to this grid area. Moisture indices, land cover, and road access aren't available yet — they're left out rather than made up."
              )}
            </p>
          </div>
        )}

        {tab === "detections" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-gray-500">history</span>
                {tr("Linimasa Deteksi", "Detection Timeline")}
              </h3>
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs font-semibold">
                {([
                  ["all", `${tr("Semua", "All")} (${matchCounts.all})`],
                  ["matched", `${tr("Cocok", "Matched")} (${matchCounts.matched})`],
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
                {tr("Tidak ada deteksi pada filter ini.", "No detections for this filter.")}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {filteredMarkers.map((marker) => (
                  <li key={marker.id} className="p-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-700">{formatAcquiredAt(marker.acquiredAt, language)}</span>
                        <Badge tone={MATCH_STATUS_TONE[marker.matchStatus ?? "UNMATCHED"]}>
                          {tr(...MATCH_STATUS_LABEL[marker.matchStatus ?? "UNMATCHED"])}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {formatAdminFull(marker.admin) ?? tr("Wilayah tidak tercatat", "Area not recorded")} • {marker.lat.toFixed(4)}, {marker.lng.toFixed(4)}
                      </p>
                    </div>
                    <div className="flex items-center gap-5 shrink-0 text-right">
                      <div>
                        <div className="text-[10px] uppercase text-gray-400">{tr("Daya Termal", "Thermal Power")}</div>
                        <div className="text-sm font-bold text-gray-900">{marker.frp.toFixed(1)} MW</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-gray-400">{tr("Keyakinan", "Confidence")}</div>
                        <div className="text-sm font-bold text-gray-900">{marker.confidenceLabel ?? "—"}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-400 mt-3">
              {tr(
                `Menampilkan ${filteredMarkers.length} dari ${areaMarkers.length} deteksi tercatat untuk area ini.`,
                `Showing ${filteredMarkers.length} of ${areaMarkers.length} recorded detections for this area.`
              )}
            </p>
          </div>
        )}

        {tab === "actionplan" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[18px] text-gray-500">report</span>
                {tr("Rencana Tindak Lanjut & Analisis Klaster", "Follow-up Plan & Cluster Analysis")}
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                {tr("Kriteria", "Criteria")}: <span className="font-mono">{area.attentionCriteria}</span>
              </p>
              <p className="text-sm text-gray-700 mb-2">
                {tr("Wilayah ini dikategorikan sebagai", "This area is classed as")}{" "}
                <Badge tone={area.priorityTier}>{tr(...style.label)}</Badge>{" "}
                {tr(
                  "berdasarkan konvergensi deteksi sensor berikut. Ini bukan konfirmasi kebakaran.",
                  "based on the sensor detections below. This is not a fire confirmation."
                )}
              </p>
            </div>

            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[16px] text-[#f04438]">local_fire_department</span>
                  <span className="text-sm font-semibold text-gray-900">{tr("Deteksi Berulang", "Repeated Detections")}</span>
                </div>
                <p className="text-xs text-gray-600">
                  {tr(
                    `Titik panas terdeteksi pada ${area.activeDays ?? "—"} hari aktif${area.consecutiveActiveDays && area.consecutiveActiveDays > 0 ? ` (${area.consecutiveActiveDays} hari berturut-turut)` : ""}, dari ${area.firstDate} hingga ${area.lastDate}.`,
                    `Hotspots detected on ${area.activeDays ?? "—"} active days${area.consecutiveActiveDays && area.consecutiveActiveDays > 0 ? ` (${area.consecutiveActiveDays} in a row)` : ""}, from ${area.firstDate} to ${area.lastDate}.`
                  )}
                </p>
              </div>
              <div className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                  <span className="text-sm font-semibold text-gray-900">{tr("Kesesuaian Sensor", "Sensor Agreement")}</span>
                </div>
                <p className="text-xs text-gray-600">
                  {areaMarkers.length > 0
                    ? tr(
                        `Terdeteksi MODIS dan VIIRS sekaligus pada ${matchedCount} dari ${areaMarkers.length} deteksi (${sensorAgreementPct}%).`,
                        `Seen by both MODIS and VIIRS in ${matchedCount} of ${areaMarkers.length} detections (${sensorAgreementPct}%).`
                      )
                    : tr("Belum ada deteksi untuk dibandingkan antar sensor.", "No detections to compare across sensors yet.")}
                </p>
              </div>
              <p className="text-xs text-gray-400">
                {tr("Indeks bahan bakar kering (FFMC) belum tersedia — tidak ditampilkan.", "The fine-fuel moisture index (FFMC) isn't available yet — not shown.")}
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold text-gray-700 uppercase mb-2">{tr("Rekomendasi Langkah Berikutnya", "Recommended Next Steps")}</h4>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-emerald-600 mt-0.5">task_alt</span>
                  {tr("Rekomendasikan verifikasi lapangan sebelum tindak lanjut.", "Recommend field verification before acting.")}
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-blue-600 mt-0.5">satellite_alt</span>
                  {tr("Pantau kelanjutan deteksi sensor MODIS/VIIRS untuk konfirmasi tambahan.", "Keep watching MODIS/VIIRS detections for further evidence.")}
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-gray-500 mt-0.5">forward_to_inbox</span>
                  {tr(
                    "Teruskan temuan ke otoritas lapangan (BPBD/Manggala Agni) untuk keputusan tindak lanjut selanjutnya.",
                    "Pass findings to field authorities (BPBD/Manggala Agni) for the follow-up decision."
                  )}
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
  const { tr, language } = useTranslation();
  const searchParams = useSearchParams();
  const activeRegion = getRegionOption(searchParams.get("region"));
  const activeRange = getRangeOption(searchParams.get("range"));
  const archiveRange = isArchiveRange(searchParams.get("range"));
  const liveWindow = liveWindowFor(searchParams.get("range"));
  const periodLabel = archiveRange ? tr("24 Jam Terakhir", "Last 24 Hours") : labelOf(activeRange, language);

  const { data, error, loading, refresh } = useLiveHotspots(liveWindow, { province: activeRegion.provinsi });
  const meta = data?.meta ?? null;
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

  const areas = useMemo(
    () => (data?.areas ?? []).filter((area) => matchesRegion(area.admin, activeRegion)),
    [data, activeRegion]
  );
  const markers = useMemo(
    () => (data?.markers ?? []).filter((marker) => matchesRegion(marker.admin, activeRegion)),
    [data, activeRegion]
  );

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
              <span>{tr("Area Perhatian & Prioritas", "Areas of Attention & Priority")}</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{tr("Area Prioritas", "Priority Areas")}</h1>
            <p className="text-xs text-gray-500 max-w-2xl mt-1.5">
              {tr(
                "Urutan area yang sebaiknya dicek lebih dulu. Ini bukan ukuran risiko kebakaran.",
                "Areas worth checking first, in order. This is not a fire-risk measure."
              )}{" "}
              <Link href={`${withFilters("/data-model", searchParams)}#skor-prioritas`} className="font-semibold text-blue-600 hover:underline">
                {tr("Cara skornya dihitung", "How the score works")} →
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="h-9 px-4 bg-white border border-gray-200 rounded-lg text-sm font-medium text-blue-600 shadow-sm hover:bg-gray-50 disabled:text-gray-400"
          >
            {tr("Muat ulang", "Refresh")}
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
                ? (windowLoadingNote(liveWindow, language) ?? tr("Memproses data live NASA…", "NASA live → Python processing…"))
                : meta
                  ? `${areas.length.toLocaleString()} ${tr("area", "areas")} • ${tr("diperbarui", "updated")} ${new Date(meta.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
          </span>
          <span className="text-gray-400">
            • {tr("Wilayah", "Region")}: {labelOf(activeRegion, language)} • {tr("Periode", "Period")}: {periodLabel}
          </span>
        </div>

        {/* The offline archive is daily grid totals with no per-detection data, so no priority
            score can be computed for it — fall back to the live 24h window and say so. */}
        {archiveRange && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900">
            <span className="material-symbols-outlined text-amber-600 text-base shrink-0">info</span>
            <p>
              {tr(
                `Skor prioritas hanya bisa dihitung dari data live (24 jam, 7 hari, atau 30 hari). Arsip "${labelOf(activeRange, language)}" hanya berisi total harian per grid, jadi daftar ini menampilkan 24 jam terakhir.`,
                `Priority scores can only be computed from live data (24 h, 7 days, or 30 days). The "${labelOf(activeRange, language)}" archive only holds daily totals per grid cell, so this list shows the last 24 hours.`
              )}
            </p>
          </div>
        )}
        {meta?.markers?.truncated && (
          <p className="text-xs text-gray-500">
            {tr(
              `Skor area dihitung dari semua ${meta.markers.total.toLocaleString()} deteksi; peta di detail area menampilkan ${meta.markers.shown.toLocaleString()} deteksi dengan FRP tertinggi.`,
              `Area scores use all ${meta.markers.total.toLocaleString()} detections; the area-detail map shows the ${meta.markers.shown.toLocaleString()} highest-FRP ones.`
            )}
          </p>
        )}

        {selectedArea && (
          <AreaDetailPanel
            key={selectedArea.areaId}
            area={selectedArea}
            markers={markers}
            reports={reports}
            onClose={() => setSelectedAreaId(null)}
          />
        )}

        <div className="space-y-4">
          {!loading && !error && sorted.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-10 text-center text-sm text-gray-500">
              {tr("Tidak ada area dengan deteksi pada periode ini.", "No areas with detections in this period.")}
            </div>
          )}
          {sorted.map((area) => (
            <AreaCard key={area.areaId} area={area} onOpenDetail={setSelectedAreaId} periodLabel={periodLabel.toLowerCase()} />
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
