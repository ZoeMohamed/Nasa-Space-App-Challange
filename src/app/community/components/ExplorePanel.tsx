"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock,
  Flame,
  LocateFixed,
  MapPin,
  MapPinned,
  PanelRightClose,
  Satellite,
  ShieldCheck,
  Wind,
} from "lucide-react";
import LocationPicker from "./LocationPicker";
import { FRP_COLOR } from "./CitizenMap";
import { compassLabel, formatDistanceKm } from "../lib/geo";
import { aqiCategoryLabel, statusLabel, STATUS_RADIUS_KM, STATUS_UPWIND_KM, type AreaStatusLevel } from "../lib/areaStatus";
import type { LocationState } from "../lib/useLocation";
import type { Surroundings } from "../lib/useSurroundings";
import { areaRegionLabel, formatAdminFull, formatAdminShort } from "@/lib/adminRegion";
import { useRegion } from "@/lib/useRegion";
import type { AreaSummary, HotspotMarker } from "@/types";
import { useTranslation, pick, type Language } from "@/lib/i18n/LanguageContext";

export type ExploreTab = "hotspot" | "nearby";

const WIB = "Asia/Jakarta";
const AREAS_COLLAPSED = 3;

function formatDateWib(iso: string | undefined, language: Language): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: WIB }).format(date);
}

function formatTimeWib(iso: string | undefined, language: Language): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const time = new Intl.DateTimeFormat(language === "en" ? "en-GB" : "id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: WIB })
    .format(date)
    .replace(".", ":");
  return `${time} WIB`;
}

function formatShortStamp(iso: string | undefined, language: Language): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = new Intl.DateTimeFormat(language === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short", timeZone: WIB }).format(date);
  return `${day}, ${formatTimeWib(iso, language)?.replace(" WIB", "")}`;
}

function formatRelative(iso: string | undefined, language: Language): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return pick(language, "baru saja", "just now");
  if (minutes < 60) return pick(language, `${minutes} menit lalu`, `${minutes} min ago`);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return pick(language, `${hours} jam lalu`, `${hours} h ago`);
  return pick(language, `${Math.round(hours / 24)} hari lalu`, `${Math.round(hours / 24)} d ago`);
}

/** FIRMS satellite codes → platform names (MODIS: Terra/Aqua; VIIRS: S-NPP, NOAA-20, NOAA-21). */
function satelliteName(code: string | undefined): string | null {
  if (!code) return null;
  const key = code.trim().toUpperCase();
  const names: Record<string, string> = {
    T: "Terra",
    TERRA: "Terra",
    A: "Aqua",
    AQUA: "Aqua",
    N: "S-NPP",
    NPP: "S-NPP",
    "SUOMI-NPP": "S-NPP",
    N20: "NOAA-20",
    "1": "NOAA-20",
    "NOAA-20": "NOAA-20",
    N21: "NOAA-21",
    "2": "NOAA-21",
    "NOAA-21": "NOAA-21",
  };
  return names[key] ?? code;
}

const SEVERITY_TEXT: Record<HotspotMarker["severity"], readonly [string, string]> = {
  HIGH: ["TINGGI", "HIGH"],
  MEDIUM: ["SEDANG", "MEDIUM"],
  LOW: ["RENDAH", "LOW"],
};

const STATUS_DOT: Record<AreaStatusLevel, string> = {
  aman: "bg-emerald-500",
  waspada: "bg-amber-400",
  siaga: "bg-orange-500",
  awas: "bg-red-600",
};

const card = "rounded-xl border border-slate-200 bg-white";
const eyebrow = "text-[11px] font-bold uppercase tracking-wide text-slate-800";

interface ExplorePanelProps {
  tab: ExploreTab;
  onTabChange: (tab: ExploreTab) => void;
  onCollapse: () => void;
  selected: HotspotMarker | null;
  onClearSelected: () => void;
  areas: AreaSummary[];
  markers: HotspotMarker[];
  hotspotsLoading: boolean;
  hotspotsError: string | null;
  onPickArea: (area: AreaSummary) => void;
  location: LocationState;
  surroundings: Surroundings;
  onFocusNearest: (marker: HotspotMarker) => void;
}

export default function ExplorePanel(props: ExplorePanelProps) {
  const { tr } = useTranslation();
  const { tab, onTabChange, onCollapse } = props;

  const tabClass = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${
      active ? "bg-white text-[#9a3412] shadow-sm" : "text-slate-700 hover:text-slate-900"
    }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/30">
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <MapPinned className="h-5 w-5 text-[#c2410c]" />
            {tr("Jelajahi Peta", "Explore Map")}
          </h2>
          <button
            type="button"
            onClick={onCollapse}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
            aria-label={tr("Sembunyikan panel", "Hide panel")}
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "hotspot"} onClick={() => onTabChange("hotspot")} className={tabClass(tab === "hotspot")}>
            <Flame className="h-3.5 w-3.5 text-[#c2410c]" />
            Hotspot
          </button>
          <button type="button" role="tab" aria-selected={tab === "nearby"} onClick={() => onTabChange("nearby")} className={tabClass(tab === "nearby")}>
            <MapPin className="h-3.5 w-3.5 text-emerald-700" />
            {tr("Sekitarku", "Near me")}
          </button>
        </div>
      </div>

      <div className="custom-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4">
        {tab === "hotspot" ? (
          props.selected ? (
            <HotspotDetail marker={props.selected} onBack={props.onClearSelected} />
          ) : (
            <PriorityAreas {...props} />
          )
        ) : (
          <NearbyTab {...props} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hotspot tab: priority areas                                         */
/* ------------------------------------------------------------------ */

function areaReason(area: AreaSummary, language: Language): string {
  const modis = area.modisDetections ?? 0;
  const viirs = area.viirsDetections ?? 0;
  if ((area.consecutiveActiveDays ?? 0) >= 2)
    return pick(language, `Deteksi berulang ${area.consecutiveActiveDays} hari berturut-turut`, `Repeated detections ${area.consecutiveActiveDays} days in a row`);
  if (modis > 0 && viirs > 0) return pick(language, "Deteksi dari kedua sensor (MODIS + VIIRS)", "Detected by both sensors (MODIS + VIIRS)");
  return pick(language, `Deteksi dari ${modis > 0 ? "MODIS" : "VIIRS"}`, `Detected by ${modis > 0 ? "MODIS" : "VIIRS"}`);
}

function PriorityAreas({ areas, markers, hotspotsLoading, hotspotsError, onPickArea }: ExplorePanelProps) {
  const { tr, language } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  const ranked = areas
    .filter((a) => a.priorityRank !== null)
    .sort((a, b) => (a.priorityRank ?? 0) - (b.priorityRank ?? 0));
  const shown = showAll ? ranked.slice(0, 20) : ranked.slice(0, AREAS_COLLAPSED);

  const latestByArea = new Map<string, string>();
  for (const m of markers) {
    if (!m.areaId || !m.acquiredAt) continue;
    const prev = latestByArea.get(m.areaId);
    if (!prev || m.acquiredAt > prev) latestByArea.set(m.areaId, m.acquiredAt);
  }

  return (
    <div>
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <AlertTriangle className="h-5 w-5 text-[#c2410c]" />
        {tr("Area yang memerlukan perhatian", "Areas needing attention")}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        {tr(
          "Diprioritaskan berdasarkan konsensus multi-satelit dan tingkat keparahan FRP, 24 jam terakhir.",
          "Prioritised by multi-satellite agreement and FRP severity, last 24 hours."
        )}
      </p>

      {hotspotsLoading && <p className="mt-4 text-xs text-slate-500">{tr("Memuat data satelit…", "Loading satellite data…")}</p>}
      {!hotspotsLoading && hotspotsError && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">{hotspotsError}</p>
      )}
      {!hotspotsLoading && !hotspotsError && ranked.length === 0 && (
        <p className="mt-4 text-xs text-slate-500">{tr("Tidak ada titik panas dalam 24 jam terakhir.", "No hotspots in the last 24 hours.")}</p>
      )}

      <ul className="mt-4 space-y-2.5">
        {shown.map((area) => {
          const { title } = areaRegionLabel(area, language);
          const tier = area.priorityTier;
          const last = latestByArea.get(area.areaId);
          return (
            <li key={area.areaId}>
              <button
                type="button"
                onClick={() => onPickArea(area)}
                className={`${card} w-full p-3 text-left transition hover:border-slate-300 hover:shadow-sm`}
              >
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#c2410c]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{title}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                          tier === "high"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : tier === "medium"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {tier === "high" ? tr("Risiko tinggi", "High risk") : tier === "medium" ? tr("Sedang", "Medium") : tr("Rendah", "Low")}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-700">{areaReason(area, language)}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-600">
                      <span className="font-bold text-[#c2410c]">
                        {area.detections ?? 0} {tr("deteksi", "detections")}
                      </span>
                      <span>•</span>
                      <span>
                        {area.activeDays ?? 1} {tr("hari aktif", "active days")}
                      </span>
                      {last && (
                        <>
                          <span>•</span>
                          <span>
                            {tr("Terakhir", "Last")}: {formatShortStamp(last, language)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {ranked.length > AREAS_COLLAPSED && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline"
        >
          {showAll ? tr("Tampilkan lebih sedikit", "Show less") : tr("Lihat semua", "View all")}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hotspot tab: single detection                                       */
/* ------------------------------------------------------------------ */

function HotspotDetail({ marker, onBack }: { marker: HotspotMarker; onBack: () => void }) {
  const { tr, language } = useTranslation();
  const place = marker.admin ? marker.admin.kabupatenKota : null;
  const province = marker.admin?.provinsi ?? null;
  const sat = satelliteName(marker.satellite);
  const dayNight = marker.dayNight === "D" ? tr("Siang hari", "Daytime") : marker.dayNight === "N" ? tr("Malam hari", "Night-time") : null;
  const frpBar = Math.max(4, Math.min(100, (marker.frp / 100) * 100));
  const confidenceText = marker.confidenceLabel ?? (marker.confidence != null ? `${Math.round(marker.confidence)}%` : null);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-3.5 w-3.5" />
        {tr("Kembali ke daftar area", "Back to area list")}
      </button>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className={`${eyebrow} flex items-center gap-1.5`}>
            <MapPin className="h-3.5 w-3.5 text-red-600" />
            {tr("Lokasi", "Location")}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{place ?? province ?? tr("Di luar batas wilayah", "Outside boundaries")}</p>
          {place && province && <p className="text-[11px] text-slate-600">{province}</p>}
          <p className="text-[10px] text-slate-500">
            {marker.lat.toFixed(4)}°, {marker.lng.toFixed(4)}°
          </p>
        </div>
        <div>
          <p className={`${eyebrow} flex items-center gap-1.5`}>
            <Clock className="h-3.5 w-3.5 text-emerald-700" />
            {tr("Deteksi", "Detected")}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{formatDateWib(marker.acquiredAt, language) ?? "—"}</p>
          <p className="text-[10px] text-slate-500">{formatTimeWib(marker.acquiredAt, language) ?? ""}</p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <p className={eyebrow}>{tr("Intensitas panas", "Heat intensity")}</p>
          <p className="text-[11px] font-bold" style={{ color: marker.severity === "MEDIUM" ? "#b45309" : FRP_COLOR[marker.severity] }}>
            {pick(language, SEVERITY_TEXT[marker.severity][0], SEVERITY_TEXT[marker.severity][1])}
          </p>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2 text-xs text-slate-700">
          <span>
            {tr("Daya radiasi (FRP)", "Radiative power (FRP)")}: <strong className="text-base font-semibold text-slate-900">{marker.frp.toFixed(1)} MW</strong>
          </span>
          <span>
            {tr("Suhu", "Temp.")}: <strong className="font-semibold text-slate-900">{marker.brightnessK != null ? `${marker.brightnessK.toFixed(1)} K` : "—"}</strong>
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-red-600" style={{ width: `${frpBar}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-slate-500">{tr("Skala 0–100 MW", "Scale 0–100 MW")}</p>
      </div>

      <div className="mt-5">
        <p className={eyebrow}>{tr("Sumber deteksi", "Detection source")}</p>
        <p className="mt-1 text-xs font-medium text-slate-800">
          {[marker.sensor, sat].filter(Boolean).join(" • ")}
        </p>
        <p className="text-[11px] text-slate-600">
          {[confidenceText && `${tr("Keyakinan", "Confidence")}: ${confidenceText}`, dayNight].filter(Boolean).join(" • ")}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
          <Satellite className="h-3.5 w-3.5 text-slate-500" />
          {marker.matchStatus === "MATCHED"
            ? tr("Harmonisasi: cocok dengan deteksi sensor lain", "Harmonized: matches the other sensor's detection")
            : tr("Hanya terlihat oleh satu sensor", "Seen by one sensor only")}
        </p>
      </div>

      <div className="mt-5">
        <p className="text-sm font-semibold text-slate-900">{tr("Cara membaca titik ini", "How to read this point")}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          {tr(
            `FRP ${marker.frp.toFixed(1)} MW menunjukkan daya radiasi panas yang terdeteksi, bukan luas lahan terbakar.${
              marker.brightnessK != null ? ` Suhu ${marker.brightnessK.toFixed(1)} K adalah pembacaan satelit, bukan suhu udara.` : ""
            }`,
            `FRP ${marker.frp.toFixed(1)} MW is the detected radiative heat power, not the burned area.${
              marker.brightnessK != null ? ` ${marker.brightnessK.toFixed(1)} K is the satellite's brightness reading, not air temperature.` : ""
            }`
          )}
        </p>
        {confidenceText && (
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            {tr(
              `Keyakinan ${confidenceText} adalah kualitas deteksi pada data sumber, bukan peluang kebakaran atau tingkat bahaya.`,
              `Confidence ${confidenceText} is the detection quality in the source data, not the chance of a fire or its danger.`
            )}
          </p>
        )}
        <p className="mt-3 text-xs font-semibold leading-relaxed text-emerald-800">
          {tr(
            "Tindak lanjut: cocokkan lokasi dan waktu, lalu verifikasi kondisi lapangan sesuai prosedur. Titik panas belum membuktikan adanya kebakaran.",
            "Next step: match location and time, then verify on the ground per procedure. A hotspot does not prove a fire."
          )}
        </p>
        <Link
          href={`/community/alert/${encodeURIComponent(marker.id)}`}
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline"
        >
          {tr("Detail lengkap titik ini", "Full details for this point")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sekitarku tab                                                       */
/* ------------------------------------------------------------------ */

function aqiTone(aqi: number) {
  if (aqi <= 50) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (aqi <= 100) return "border-amber-200 bg-amber-50 text-amber-700";
  if (aqi <= 150) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function aqiAdvice(aqi: number, language: Language) {
  if (aqi <= 50) return pick(language, "Udara baik. Aktivitas di luar ruangan aman.", "Air is good. Outdoor activity is fine.");
  if (aqi <= 100)
    return pick(language, "Kelompok sensitif sebaiknya membatasi aktivitas berat di luar ruangan.", "Sensitive groups should limit heavy outdoor activity.");
  if (aqi <= 150)
    return pick(
      language,
      "Anak, lansia, ibu hamil, dan penderita penyakit paru sebaiknya mengurangi aktivitas di luar ruangan.",
      "Children, older adults, pregnant women and people with lung disease should cut down outdoor activity."
    );
  if (aqi <= 200)
    return pick(
      language,
      "Kurangi aktivitas di luar ruangan. Anak, lansia, dan ibu hamil sebaiknya memakai masker N95.",
      "Reduce outdoor activity. Children, older adults and pregnant women should wear an N95 mask."
    );
  return pick(
    language,
    "Hindari aktivitas di luar ruangan. Tutup jendela dan pakai masker N95 jika harus keluar.",
    "Avoid outdoor activity. Keep windows closed and wear an N95 mask if you must go out."
  );
}

function stripReportPrefix(description: string): string {
  return description.replace(/^\[[^\]]*\]\s*/, "").trim();
}

function NearbyTab({ location, surroundings, onFocusNearest }: ExplorePanelProps) {
  const { tr, language } = useTranslation();
  const { fix, ready, geoStatus, requestGeolocation } = location;
  const [pickerOpen, setPickerOpen] = useState(false);
  const region = useRegion(fix?.lat, fix?.lon);
  const s = surroundings;

  const placeName = fix
    ? (fix.label ??
      (region ? `Kec. ${region.kecamatan}, ${region.kabupatenKota}` : null) ??
      (fix.source === "gps" ? tr("Lokasi GPS Anda", "Your GPS location") : `${fix.lat.toFixed(3)}, ${fix.lon.toFixed(3)}`))
    : null;
  const sourceText = fix
    ? fix.source === "gps"
      ? `GPS • ${tr("akurasi", "accuracy")} ± ${Math.round(fix.accuracyMeters ?? 15)} m`
      : tr("Dipilih manual", "Picked manually")
    : null;

  if (!ready) return <p className="text-xs text-slate-500">{tr("Memuat lokasi…", "Loading location…")}</p>;

  if (!fix || pickerOpen) {
    return (
      <div className="space-y-3">
        {!fix && (
          <div className={`${card} p-4`}>
            <p className="text-sm font-semibold text-slate-900">{tr("Atur lokasimu", "Set your location")}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {tr(
                "Status wilayah, titik panas terdekat, angin, dan kualitas udara dihitung untuk lokasimu sendiri.",
                "Area status, nearest hotspots, wind and air quality are computed for your own location."
              )}
            </p>
            <button
              type="button"
              onClick={requestGeolocation}
              disabled={geoStatus === "loading"}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 py-2.5 text-xs font-bold text-white hover:bg-emerald-900 disabled:opacity-60"
            >
              <LocateFixed className="h-4 w-4" />
              {geoStatus === "loading" ? tr("Mencari lokasi…", "Finding location…") : tr("Gunakan lokasi saya (GPS)", "Use my location (GPS)")}
            </button>
          </div>
        )}
        <LocationPicker location={location} onDone={() => setPickerOpen(false)} />
        {fix && (
          <button type="button" onClick={() => setPickerOpen(false)} className="text-xs font-semibold text-slate-600 hover:underline">
            {tr("Batal", "Cancel")}
          </button>
        )}
      </div>
    );
  }

  const status = s.status;
  const aqi = s.weather?.airQuality?.usAqi ?? null;
  const pm25 = s.weather?.airQuality?.pm2_5 ?? null;
  const aqiCategory = s.weather?.airQuality?.usAqiCategory ?? null;
  const upwindPlace = s.nearestUpwind ? formatAdminShort(s.nearestUpwind.marker.admin) : null;

  return (
    <div className="space-y-3">
      <div className={`${card} flex items-center gap-3 p-3`}>
        <MapPin className="h-5 w-5 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{placeName}</p>
          <p className="text-[11px] text-slate-600">{sourceText}</p>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="shrink-0 rounded-full border border-slate-300 px-3 py-1 text-[10px] font-bold uppercase text-slate-800 hover:bg-slate-50"
        >
          {tr("Ubah", "Change")}
        </button>
      </div>

      <div className={`${card} p-3`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-900">{tr("Status wilayahmu", "Your area status")}</p>
          <Link href="/community/edukasi/status-aman-awas" className="text-xs font-semibold text-slate-900 underline">
            {tr("Cara menghitung", "How it's computed")}
          </Link>
        </div>
        {s.loading || !status ? (
          <p className="mt-3 text-xs text-slate-500">{tr("Menghitung status…", "Computing status…")}</p>
        ) : (
          <>
            <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <span className={`h-4 w-4 rounded-full ${STATUS_DOT[status.level]}`} />
              {statusLabel(status.level, language)}
            </p>
            {status.reasons.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-800">
                {status.reasons.map((reason) => (
                  <li key={reason.text}>{reason.text}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-700">
                {tr(
                  `Tidak ada titik panas, asap searah angin, atau laporan terverifikasi dalam ${STATUS_RADIUS_KM} km.`,
                  `No hotspots, upwind smoke or verified reports within ${STATUS_RADIUS_KM} km.`
                )}
              </p>
            )}
          </>
        )}
        {s.hotspotsUnavailable && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-900">
            {tr(
              "Data satelit sedang tidak tersedia, jadi status ini hanya memakai kualitas udara dan laporan warga.",
              "Satellite data is unavailable, so this status only uses air quality and citizen reports."
            )}
          </p>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
          {tr(
            "Ringkasan otomatis dari data satelit dan kualitas udara, bukan status siaga resmi pemerintah. Ikuti arahan BPBD setempat.",
            "Automatic summary from satellite and air-quality data, not an official government alert. Follow your local BPBD."
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={!s.nearest}
          onClick={() => s.nearest && onFocusNearest(s.nearest.marker)}
          className={`${card} p-3 text-left enabled:hover:border-slate-300`}
        >
          <p className="text-[10px] text-slate-700">{tr("Titik panas terdekat", "Nearest hotspot")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {s.loading ? "…" : s.nearest ? formatDistanceKm(s.nearest.distanceKm) : "—"}
          </p>
          <p className="mt-1 text-[10px] text-slate-600">
            {s.nearest
              ? [compassLabel(s.nearest.bearing, language), formatRelative(s.nearest.marker.acquiredAt, language)].filter(Boolean).join(" • ")
              : s.hotspotsUnavailable
                ? tr("Data satelit tidak tersedia", "Satellite data unavailable")
                : tr("Tidak ada dalam 50 km", "None within 50 km")}
          </p>
        </button>
        <div className={`${card} p-3`}>
          <p className="text-[10px] text-slate-700">{tr(`Dalam radius ${STATUS_RADIUS_KM} km`, `Within ${STATUS_RADIUS_KM} km`)}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {s.loading ? "…" : s.hotspotsUnavailable ? "—" : `${s.inStatusRadius.length} ${tr("titik", "pts")}`}
          </p>
          <p className="mt-1 text-[10px] text-slate-600">{tr("24 jam terakhir", "Last 24 hours")}</p>
        </div>
      </div>

      <div className={`${card} flex gap-2.5 p-3`}>
        <Wind className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <div className="text-xs">
          {s.weatherLoading ? (
            <p className="text-slate-500">{tr("Memuat data angin…", "Loading wind…")}</p>
          ) : s.windFromDeg === null || s.windSpeedKmh === null ? (
            <p className="text-slate-600">{tr("Data angin belum tersedia.", "Wind data not available.")}</p>
          ) : (
            <>
              <p className="font-semibold text-emerald-900">
                {s.windUsable
                  ? tr(
                      `Angin dari ${compassLabel(s.windFromDeg, "id").toLowerCase()} • ${Math.round(s.windSpeedKmh)} km/jam`,
                      `Wind from the ${compassLabel(s.windFromDeg, "en").toLowerCase()} • ${Math.round(s.windSpeedKmh)} km/h`
                    )
                  : tr(`Angin tenang • ${Math.round(s.windSpeedKmh)} km/jam`, `Calm wind • ${Math.round(s.windSpeedKmh)} km/h`)}
              </p>
              <p className="mt-0.5 leading-relaxed text-slate-600">
                {s.nearestUpwind && s.nearestUpwind.distanceKm <= STATUS_UPWIND_KM
                  ? tr(
                      `Asap dari titik panas ${formatDistanceKm(s.nearestUpwind.distanceKm)} di ${upwindPlace ?? "arah angin"} bisa terbawa ke lokasimu.`,
                      `Smoke from a hotspot ${formatDistanceKm(s.nearestUpwind.distanceKm)} away${upwindPlace ? ` in ${upwindPlace}` : ""} may drift to you.`
                    )
                  : s.hotspotsUnavailable
                    ? tr("Arah asap belum bisa dicek karena data satelit tidak tersedia.", "Smoke direction can't be checked: satellite data unavailable.")
                    : tr(
                      `Tidak ada titik panas searah angin dalam ${STATUS_UPWIND_KM} km.`,
                      `No upwind hotspot within ${STATUS_UPWIND_KM} km.`
                    )}
              </p>
            </>
          )}
        </div>
      </div>

      <div className={`${card} p-3`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-900">{tr("Kualitas udara", "Air quality")}</p>
          {aqi !== null && aqiCategory && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${aqiTone(aqi)}`}>
              {aqiCategoryLabel(aqiCategory, language)}
            </span>
          )}
        </div>
        {aqi === null ? (
          <p className="mt-2 text-xs text-slate-500">
            {s.weatherLoading ? tr("Memuat…", "Loading…") : tr("Data kualitas udara belum tersedia.", "Air-quality data not available.")}
          </p>
        ) : (
          <>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-slate-900">{Math.round(aqi)}</span>
              <span className="text-[10px] text-slate-700">
                US AQI{pm25 !== null ? ` · PM2.5 ${Math.round(pm25)} µg/m³` : ""}
              </span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-800">{aqiAdvice(aqi, language)}</p>
            <Link href="/community/edukasi/asap" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline">
              {tr("Panduan melindungi keluarga dari asap", "Protecting your family from smoke")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        )}
      </div>

      <div>
        <p className="mb-2 mt-1 text-xs font-semibold text-slate-900">{tr("Laporan warga terverifikasi", "Verified citizen reports")}</p>
        {s.verifiedReports.length === 0 ? (
          <p className={`${card} p-3 text-xs text-slate-600`}>
            {tr(
              `Belum ada laporan terverifikasi petugas dalam ${STATUS_RADIUS_KM} km.`,
              `No officer-verified reports within ${STATUS_RADIUS_KM} km.`
            )}
          </p>
        ) : (
          <ul className="space-y-2">
            {s.verifiedReports.slice(0, 3).map(({ report, distanceKm }) => (
              <li key={report.id} className={`${card} p-3`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-900">{stripReportPrefix(report.description) || tr("Laporan warga", "Citizen report")}</p>
                  <span className="flex shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                    <ShieldCheck className="h-3 w-3" />
                    {tr("Terverifikasi", "Verified")}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">
                  {tr(`Sekitar ${formatDistanceKm(distanceKm)} dari lokasimu`, `About ${formatDistanceKm(distanceKm)} from you`)} •{" "}
                  {tr("dicek petugas", "checked by officer")} {formatTimeWib(report.reviewedAt ?? report.createdAt, language) ?? ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href="/community/report"
        className="mt-1 flex w-full items-center justify-center rounded-full bg-[#b91c1c] py-3 text-sm font-semibold text-white shadow-md shadow-red-900/30 transition hover:bg-[#a01818] active:scale-[0.99]"
      >
        {tr("Lapor Kebakaran", "Report a Fire")}
      </Link>
      {formatAdminFull(region) && fix.label && <p className="text-[10px] text-slate-500">{formatAdminFull(region)}</p>}
    </div>
  );
}
