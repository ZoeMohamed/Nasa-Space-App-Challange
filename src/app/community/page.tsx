"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LocationPicker from "./components/LocationPicker";
import RadarMap from "./components/RadarMap";
import { NearbyReportList, type NearbyReportItem } from "./components/NearbyLists";
import { bearingDeg, compassLabel, formatDistanceKm, haversineKm, isUpwind } from "./lib/geo";
import {
  aqiCategoryLabel,
  statusLabel,
  STATUS_NEAR_KM,
  STATUS_RADIUS_KM,
  STATUS_UPWIND_KM,
  computeAreaStatus,
  type AreaStatusLevel,
} from "./lib/areaStatus";
import { useLocationState } from "./lib/useLocation";
import { useRegion } from "@/lib/useRegion";
import { formatAdminFull } from "@/lib/adminRegion";
import type { CommunityReport, HotspotApiResponse, HotspotMarker, WeatherResponse } from "@/types";
import { useTranslation, pick, type Language } from "@/lib/i18n/LanguageContext";

const RADIUS_OPTIONS = [10, 25, 50] as const;
type RadiusOption = (typeof RADIUS_OPTIONS)[number];
const MAX_NEARBY_SHOWN = 6;
const CALM_WIND_KMH = 2;

/** Relative-time label from a hotspot's own acquiredAt timestamp — never a hardcoded clock time. */
function formatRelativeTime(iso: string | undefined, language: Language): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return pick(language, "baru saja", "just now");
  if (minutes < 60) return pick(language, `${minutes} menit lalu`, `${minutes} min ago`);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return pick(language, `${hours} jam lalu`, `${hours} h ago`);
  const days = Math.round(hours / 24);
  return pick(language, `${days} hari lalu`, `${days} d ago`);
}

const STATUS_DOT: Record<AreaStatusLevel, string> = {
  aman: "bg-emerald-500",
  waspada: "bg-amber-500",
  siaga: "bg-[#f97316]",
  awas: "bg-rose-600",
};
const STATUS_BAR_IDLE: Record<AreaStatusLevel, string> = {
  aman: "bg-emerald-600/50",
  waspada: "bg-amber-500/50",
  siaga: "bg-[#f97316]/50",
  awas: "bg-rose-700/50",
};

export default function CommunityBerandaPage() {
  const { tr, language } = useTranslation();
  const STATUS_LABEL = { aman: statusLabel("aman", language), waspada: statusLabel("waspada", language), siaga: statusLabel("siaga", language), awas: statusLabel("awas", language) };
  const location = useLocationState();
  const { fix, ready } = location;

  const [markers, setMarkers] = useState<HotspotMarker[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [hotspotLoading, setHotspotLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [weather, setWeather] = useState<{ key: string; data: WeatherResponse | null } | null>(null);
  const [radiusKm, setRadiusKm] = useState<RadiusOption>(10);
  const [upwindOnly, setUpwindOnly] = useState(false);

  const fixRegion = useRegion(fix?.lat, fix?.lon);
  const locationName = fix
    ? (fix.label ??
      formatAdminFull(fixRegion) ??
      (fix.source === "gps"
        ? tr("Lokasi GPS Anda", "Your GPS location")
        : `${tr("Koordinat", "Coordinates")} ${fix.lat.toFixed(3)}, ${fix.lon.toFixed(3)}`))
    : null;
  const locationSourceLabel = fix
    ? fix.source === "gps"
      ? `GPS · ${tr("akurasi", "accuracy")} ±${Math.round(fix.accuracyMeters ?? 15)} m`
      : tr("Dipilih manual", "Picked manually")
    : null;

  // With a location: EVERY detection within the largest radius option, filtered server-side before
  // the API's marker cap, so status + nearest list are complete. Without one: the national view.
  const hotspotKey = fix ? `${fix.lat.toFixed(4)},${fix.lon.toFixed(4)}` : "national";
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const query = fix
      ? `nearLat=${fix.lat.toFixed(5)}&nearLon=${fix.lon.toFixed(5)}&nearKm=${RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1]}&limit=5000`
      : "";
    queueMicrotask(() => {
      if (!cancelled) setHotspotLoading(true);
    });
    fetch(`/api/hotspots${query ? `?${query}` : ""}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat titik panas");
        return (await res.json()) as HotspotApiResponse;
      })
      .then((body) => {
        if (!cancelled) setMarkers(body.markers);
      })
      .catch(() => {
        if (!cancelled) setMarkers([]);
      })
      .finally(() => {
        if (!cancelled) setHotspotLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotspotKey]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body?.reports) setReports(body.reports);
      })
      .catch(() => {
        /* best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Real current wind + air quality for the user's location only (Open-Meteo, see weather.py).
  const weatherKey = fix ? `${fix.lat.toFixed(3)},${fix.lon.toFixed(3)}` : "";
  useEffect(() => {
    if (!fix) return;
    let cancelled = false;
    const key = `${fix.lat.toFixed(3)},${fix.lon.toFixed(3)}`;
    fetch(`/api/weather?lat=${fix.lat}&lon=${fix.lon}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<WeatherResponse>) : null))
      .then((body) => {
        if (!cancelled) setWeather({ key, data: body });
      })
      .catch(() => {
        if (!cancelled) setWeather({ key, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [fix]);
  const currentWeather = weather?.key === weatherKey ? weather.data : null;
  const weatherLoading = Boolean(fix) && weather?.key !== weatherKey;
  const windFrom = currentWeather?.wind?.windDirectionDeg ?? null;
  const windSpeed = currentWeather?.wind?.windSpeedKmh ?? null;
  const windUsable = windFrom !== null && windSpeed !== null && windSpeed >= CALM_WIND_KMH;

  const user = fix ? { lat: fix.lat, lon: fix.lon } : null;

  const hotspotsWithGeo = useMemo(() => {
    if (!user) return [];
    return markers
      .map((marker) => {
        const point = { lat: marker.lat, lon: marker.lng };
        return {
          marker,
          distanceKm: haversineKm(user, point),
          bearing: bearingDeg(user, point),
          upwind: windUsable ? isUpwind(user, point, windFrom as number) : false,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, user?.lat, user?.lon, windUsable, windFrom]);

  // Status always uses the fixed 10 km rule (see areaStatus.ts), independent of the list's radius chips.
  const nearestHotspotKm = hotspotsWithGeo.length > 0 ? hotspotsWithGeo[0].distanceKm : null;
  const nearbyReports: NearbyReportItem[] = useMemo(() => {
    if (!user) return [];
    return reports
      .map((report) => ({ report, distanceKm: haversineKm(user, { lat: report.lat, lon: report.lon }) }))
      .filter((r) => r.distanceKm <= STATUS_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, user?.lat, user?.lon]);
  const nearestVerifiedKm = nearbyReports.find((r) => r.report.status === "verified")?.distanceKm ?? null;
  const nearestUpwindKm = hotspotsWithGeo.find((h) => h.upwind)?.distanceKm ?? null;
  const usAqi = currentWeather?.airQuality?.usAqi ?? null;
  // Wait for hotspots AND weather, so the status doesn't flip from "Aman" to "Awas" a second later.
  const statusResult =
    !user || hotspotLoading || weatherLoading
      ? null
      : computeAreaStatus(
          { nearestHotspotKm, nearestVerifiedReportKm: nearestVerifiedKm, nearestUpwindHotspotKm: nearestUpwindKm, usAqi },
          language
        );
  const status: AreaStatusLevel | null = statusResult?.level ?? null;
  const inStatusRadius = hotspotsWithGeo.filter((h) => h.distanceKm <= STATUS_RADIUS_KM);
  const nearest = hotspotsWithGeo[0];

  const listed = hotspotsWithGeo
    .filter((h) => h.distanceKm <= radiusKm)
    .filter((h) => !upwindOnly || h.upwind);
  const upwindInRadius = hotspotsWithGeo.filter((h) => h.distanceKm <= radiusKm && h.upwind).length;

  const handleShare = async () => {
    if (!locationName || !status) return;
    const text =
      inStatusRadius.length > 0
        ? tr(
            `Status: ${STATUS_LABEL[status]}. ${inStatusRadius.length} titik panas dalam ${STATUS_RADIUS_KM} km dari ${locationName}. Cek di AGNIBHŪMI.`,
            `Status: ${STATUS_LABEL[status]}. ${inStatusRadius.length} hotspots within ${STATUS_RADIUS_KM} km of ${locationName}. Check AGNIBHŪMI.`
          )
        : tr(
            `Status: ${STATUS_LABEL[status]}. Tidak ada titik panas dalam ${STATUS_RADIUS_KM} km dari ${locationName}.`,
            `Status: ${STATUS_LABEL[status]}. No hotspots within ${STATUS_RADIUS_KM} km of ${locationName}.`
          );
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: tr("AGNIBHŪMI · Pemantauan Karhutla", "AGNIBHŪMI · Forest & Land Fire Monitoring"), text, url });
      } catch {
        /* user cancelled */
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2500);
    }
  };

  return (
    <div className="space-y-5">
      {/* A) Location bar */}
      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3.5 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[var(--community-accent)]">
            <span className="material-symbols-outlined text-[20px]">{fix?.source === "gps" ? "my_location" : "location_on"}</span>
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-[#123027] truncate leading-tight">
              {!ready ? tr("Memuat lokasi…", "Loading location…") : (locationName ?? tr("Lokasi belum diatur", "Location not set"))}
            </h1>
            <p className="text-[11px] text-[var(--community-ink-muted)] truncate mt-0.5">
              {fix
                ? `${locationSourceLabel} · ${tr(`Status dihitung dalam radius ${STATUS_RADIUS_KM} km`, `Status uses a ${STATUS_RADIUS_KM} km radius`)}`
                : tr("Atur lokasi untuk melihat status wilayahmu", "Set your location to see your area's status")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          aria-expanded={pickerOpen}
          className="shrink-0 text-xs font-bold text-[var(--community-accent)] bg-emerald-50/80 hover:bg-emerald-100/80 px-3 py-1.5 rounded-full border border-emerald-200 transition active:scale-95"
        >
          {pickerOpen ? tr("Tutup", "Close") : fix ? tr("Ubah", "Change") : tr("Atur lokasi", "Set location")}
        </button>
      </div>

      {(pickerOpen || (ready && !fix)) && (
        <div className="animate-fadeIn">
          <LocationPicker location={location} onDone={() => setPickerOpen(false)} />
        </div>
      )}

      {/* B) Status hero — only for a real location the user chose; never for a placeholder place */}
      {fix && (
        <div className="relative rounded-3xl bg-gradient-to-br from-[#0c2a1f] via-[#103728] to-[#0a231a] text-white p-5 md:p-6 shadow-md shadow-emerald-950/20 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-[11px] font-semibold text-emerald-200 border border-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {tr("Status wilayahmu", "Your area's status")}
            </span>
            <span className="text-[11px] text-emerald-200/80 font-medium">
              {hotspotLoading ? tr("Memperbarui…", "Updating…") : tr("Data satelit 24 jam terakhir", "Satellite data, last 24 hours")}
            </span>
          </div>

          {status === null ? (
            <div className="mt-4 h-9 w-32 rounded-lg bg-white/10 animate-pulse" />
          ) : (
            <div className="mt-4 flex items-center gap-2.5">
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                {(status === "siaga" || status === "awas") && (
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${STATUS_DOT[status]} opacity-75`} />
                )}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${STATUS_DOT[status]}`} />
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">{STATUS_LABEL[status]}</h2>
            </div>
          )}

          {statusResult && statusResult.reasons.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {statusResult.reasons.map((reason) => (
                <li key={reason.text} className="flex items-start gap-2 text-sm font-semibold text-white">
                  <span className="material-symbols-outlined text-[18px] text-amber-300 shrink-0">warning</span>
                  {reason.text}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-xs md:text-[13px] text-emerald-100/90 leading-relaxed">
            {status === null
              ? tr("Memuat data satelit & kualitas udara di sekitar lokasimu…", "Loading satellite & air-quality data around you…")
              : inStatusRadius.length === 0
                ? tr(
                    `Tidak ada titik panas dalam ${STATUS_RADIUS_KM} km. ${nearest ? `Terdekat ${formatDistanceKm(nearest.distanceKm)} di ${compassLabel(nearest.bearing)}.` : ""}${status === "aman" ? " Tetap waspada." : ""}`,
                    `No hotspots within ${STATUS_RADIUS_KM} km. ${nearest ? `Nearest is ${formatDistanceKm(nearest.distanceKm)} to the ${compassLabel(nearest.bearing, "en")}.` : ""}${status === "aman" ? " Stay alert." : ""}`
                  )
                : tr(
                    `${inStatusRadius.length} titik panas dalam ${STATUS_RADIUS_KM} km. Terdekat ${formatDistanceKm(inStatusRadius[0].distanceKm)} di ${compassLabel(inStatusRadius[0].bearing)}${formatRelativeTime(inStatusRadius[0].marker.acquiredAt, "id") ? `, terdeteksi ${formatRelativeTime(inStatusRadius[0].marker.acquiredAt, "id")}` : ""}.`,
                    `${inStatusRadius.length} hotspots within ${STATUS_RADIUS_KM} km. Nearest is ${formatDistanceKm(inStatusRadius[0].distanceKm)} to the ${compassLabel(inStatusRadius[0].bearing, "en")}${formatRelativeTime(inStatusRadius[0].marker.acquiredAt, "en") ? `, detected ${formatRelativeTime(inStatusRadius[0].marker.acquiredAt, "en")}` : ""}.`
                  )}
          </p>

          <div className="mt-5 space-y-2.5">
            <div className="grid grid-cols-4 gap-2 h-4 rounded-full overflow-hidden bg-white/10 p-0.5">
              {(["aman", "waspada", "siaga", "awas"] as const).map((tier) => (
                <div
                  key={tier}
                  title={STATUS_LABEL[tier]}
                  className={`rounded-full ${status === tier ? `${STATUS_DOT[tier]} ring-2 ring-white/60` : STATUS_BAR_IDLE[tier]}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-4 text-center text-[11px] font-semibold text-emerald-200/80">
              {(["aman", "waspada", "siaga", "awas"] as const).map((tier) => (
                <span key={tier} className={status === tier ? "text-white font-extrabold text-[12px]" : ""}>
                  {STATUS_LABEL[tier]}
                </span>
              ))}
            </div>
          </div>

          <details className="mt-4 text-[11px] text-emerald-200/80 leading-relaxed">
            <summary className="cursor-pointer font-semibold text-emerald-100">
              {tr("Bagaimana status ini dihitung?", "How is this status calculated?")}
            </summary>
            <p className="mt-2">{tr("Status = tingkat tertinggi dari faktor berikut:", "Status = the highest level reached by any of these factors:")}</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              <li>
                {tr("Titik panas satelit (24 jam)", "Satellite hotspot (24 h)")}: ≤ {STATUS_NEAR_KM} km = {STATUS_LABEL.siaga},{" "}
                {STATUS_NEAR_KM}–{STATUS_RADIUS_KM} km = {STATUS_LABEL.waspada}
              </li>
              <li>
                {tr("Titik panas searah angin", "Upwind hotspot")} ≤ {STATUS_UPWIND_KM} km = {STATUS_LABEL.waspada}{" "}
                {tr("(asap bisa terbawa)", "(smoke may drift to you)")}
              </li>
              <li>
                {tr("Kualitas udara (US AQI)", "Air quality (US AQI)")}: 151–200 = {STATUS_LABEL.waspada}, 201–300 = {STATUS_LABEL.siaga}, &gt; 300 ={" "}
                {STATUS_LABEL.awas}
              </li>
              <li>
                {tr("Laporan warga terverifikasi petugas", "Officer-verified citizen report")} ≤ {STATUS_NEAR_KM} km = {STATUS_LABEL.awas}
              </li>
            </ul>
            <p className="mt-2">
              {tr(
                "Bukan status resmi BNPB/BMKG. Titik panas belum tentu api. Kualitas udara adalah perkiraan model, bukan alat ukur.",
                "Not an official BNPB/BMKG status. A hotspot is not always a fire. Air quality is a model estimate, not a sensor reading."
              )}
            </p>
          </details>

          <div className="mt-5 flex items-center gap-2.5">
            <Link
              href={inStatusRadius[0] ? `/community/alert/${inStatusRadius[0].marker.id}` : "/community/map"}
              className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-emerald-50 text-[#123027] font-bold text-xs md:text-sm py-3 px-4 rounded-xl transition active:scale-[0.98]"
            >
              <span>{inStatusRadius[0] ? tr("Lihat detail peringatan", "View alert details") : tr("Buka peta lengkap", "Open full map")}</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
            <button
              type="button"
              onClick={handleShare}
              disabled={!status}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 hover:bg-white/20 text-white transition active:scale-95 disabled:opacity-50"
              aria-label={shareSuccess ? tr("Tautan disalin", "Link copied") : tr("Bagikan status", "Share status")}
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{shareSuccess ? "check" : "share"}</span>
            </button>
          </div>
        </div>
      )}

      {/* C) Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/community/map", icon: "map", tint: "bg-emerald-50 text-emerald-700", label: tr("Pantau Sekitar", "Watch Nearby") },
          { href: "/community/report", icon: "photo_camera", tint: "bg-rose-50 text-rose-600", label: tr("Lapor Kejadian", "Report a Fire") },
          { href: "/community/edukasi", icon: "shield", tint: "bg-amber-50 text-amber-700", label: tr("Belajar Bersiap", "Learn to Prepare") },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="rounded-2xl border border-[var(--community-border)] bg-white p-4 flex flex-col gap-2 hover:border-emerald-300 transition shadow-xs"
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${action.tint}`}>
              <span className="material-symbols-outlined text-[20px]">{action.icon}</span>
            </span>
            <span className="text-xs font-bold text-[#123027]">{action.label}</span>
          </Link>
        ))}
        <Link
          href="/community/udara"
          className="rounded-2xl border border-[var(--community-border)] bg-white p-4 flex flex-col gap-2 hover:border-emerald-300 transition shadow-xs"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
            <span className="material-symbols-outlined text-[20px]">air</span>
          </span>
          <span className="text-xs font-bold text-[#123027]">
            {tr("Cek Kualitas Udara", "Check Air Quality")}
            <span className="block text-[10px] font-semibold text-[var(--community-ink-muted)] mt-0.5">
              {!fix
                ? tr("Atur lokasi dulu", "Set location first")
                : weatherLoading
                  ? tr("Memuat…", "Loading…")
                  : currentWeather?.airQuality?.usAqiCategory
                    ? `${aqiCategoryLabel(currentWeather.airQuality.usAqiCategory, language)} (AQI ${currentWeather.airQuality.usAqi})`
                    : tr("Data belum tersedia", "No data yet")}
            </span>
          </span>
        </Link>
      </div>

      {/* D) Map — full width and tall enough to actually read */}
      <RadarMap
        markers={markers}
        locationLabel={locationName ?? tr("Lokasimu", "Your location")}
        userCoords={user}
        radiusKm={STATUS_RADIUS_KM}
        reports={reports.map((r) => ({
          id: r.id,
          lat: r.lat,
          lng: r.lon,
          status: r.status,
          description: r.description,
          createdAt: r.createdAt,
        }))}
      />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6">
        {/* E) Nearest hotspots with radius + wind filter */}
        <section className="md:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#123027]">{tr("Titik api terdekat", "Nearest hotspots")}</h2>
            <Link href="/community/map" className="text-xs font-semibold text-[var(--community-accent)] hover:underline">
              {tr("Lihat di peta", "View on map")}
            </Link>
          </div>

          {!fix ? (
            <p className="text-sm text-[var(--community-ink-muted)] rounded-xl border border-dashed border-[var(--community-border)] p-4">
              {tr("Atur lokasi Anda dulu untuk melihat titik api terdekat.", "Set your location first to see the nearest hotspots.")}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Radius" className="flex rounded-xl bg-gray-100 p-1 text-xs font-bold">
                  {RADIUS_OPTIONS.map((km) => (
                    <button
                      key={km}
                      type="button"
                      aria-pressed={radiusKm === km}
                      onClick={() => setRadiusKm(km)}
                      className={`px-3 py-1.5 rounded-lg transition ${radiusKm === km ? "bg-white text-[#123027] shadow-xs" : "text-[var(--community-ink-muted)]"}`}
                    >
                      {km} km
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-pressed={upwindOnly}
                  disabled={!windUsable}
                  onClick={() => setUpwindOnly((value) => !value)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                    upwindOnly
                      ? "border-sky-600 bg-sky-600 text-white"
                      : "border-[var(--community-border)] bg-white text-[#123027] hover:border-sky-300"
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[16px]"
                    style={windFrom !== null ? { transform: `rotate(${windFrom + 180}deg)` } : undefined}
                    aria-hidden="true"
                  >
                    navigation
                  </span>
                  {tr("Searah angin ke lokasiku", "Upwind of me")}
                  {windUsable ? ` (${upwindInRadius})` : ""}
                </button>
              </div>
              <p className="text-[11px] text-[var(--community-ink-muted)] leading-relaxed">
                {weatherLoading
                  ? tr("Memuat data angin…", "Loading wind data…")
                  : windFrom === null || windSpeed === null
                    ? tr("Data angin belum tersedia, jadi filter arah angin tidak bisa dipakai.", "Wind data isn't available yet, so the wind filter can't be used.")
                    : windSpeed < CALM_WIND_KMH
                      ? tr(
                          `Angin hampir tenang (${windSpeed.toFixed(1)} km/jam). Arah asap tidak bisa diperkirakan.`,
                          `Wind is almost calm (${windSpeed.toFixed(1)} km/h). Smoke direction can't be estimated.`
                        )
                      : tr(
                          `Angin saat ini dari ${compassLabel(windFrom)} (${Math.round(windFrom)}°), ${windSpeed.toFixed(0)} km/jam. Api di sisi itu bisa membawa asap ke sini. Perkiraan kasar.`,
                          `Wind is currently from the ${compassLabel(windFrom, "en")} (${Math.round(windFrom)}°), ${windSpeed.toFixed(0)} km/h. Fires on that side may send smoke here. Rough estimate.`
                        )}
              </p>

              {hotspotLoading ? (
                <div className="space-y-2">
                  <div className="h-16 rounded-2xl bg-gray-50 animate-pulse" />
                  <div className="h-16 rounded-2xl bg-gray-50 animate-pulse" />
                </div>
              ) : listed.length === 0 ? (
                <p className="text-sm text-[var(--community-ink-muted)] rounded-xl border border-dashed border-[var(--community-border)] p-4">
                  {upwindOnly
                    ? tr(`Tidak ada titik api searah angin dalam radius ${radiusKm} km.`, `No upwind hotspots within ${radiusKm} km.`)
                    : tr(`Tidak ada deteksi satelit dalam radius ${radiusKm} km dari lokasi Anda.`, `No satellite detections within ${radiusKm} km of you.`)}
                </p>
              ) : (
                <div className="space-y-2">
                  {listed.slice(0, MAX_NEARBY_SHOWN).map(({ marker, distanceKm, bearing, upwind }) => (
                    <Link
                      key={marker.id}
                      href={`/community/alert/${marker.id}`}
                      className="group block rounded-2xl border border-[var(--community-border)] bg-white p-3.5 hover:border-emerald-300 transition shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                            <span className="material-symbols-outlined text-[20px]">local_fire_department</span>
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#123027] truncate">
                              {tr(
                                `${formatDistanceKm(distanceKm)} ke arah ${compassLabel(bearing)}`,
                                `${formatDistanceKm(distanceKm)} to the ${compassLabel(bearing, "en")}`
                              )}
                            </div>
                            <div className="text-[11px] text-[var(--community-ink-muted)] mt-0.5 truncate">
                              {marker.admin ? `${marker.admin.kecamatan}, ${marker.admin.kabupatenKota} · ` : ""}
                              {marker.sensor ?? tr("Satelit", "Satellite")}
                              {formatRelativeTime(marker.acquiredAt, language) ? ` · ${formatRelativeTime(marker.acquiredAt, language)}` : ""}
                            </div>
                          </div>
                        </div>
                        {upwind ? (
                          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                            <span className="material-symbols-outlined text-[13px]">air</span>
                            {tr("Searah angin", "Upwind")}
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                            {tr("Deteksi satelit", "Satellite detection")}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                  {listed.length > MAX_NEARBY_SHOWN && (
                    <p className="text-[11px] text-[var(--community-ink-muted)]">
                      {tr(
                        `+${listed.length - MAX_NEARBY_SHOWN} titik lainnya. Lihat semuanya di peta.`,
                        `+${listed.length - MAX_NEARBY_SHOWN} more. See them all on the map.`
                      )}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* F) Report CTA, share, nearby reports */}
        <div className="md:col-span-5 space-y-5">
          <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ba1a1a] text-white">
                <span className="material-symbols-outlined text-[22px]">photo_camera</span>
              </span>
              <div>
                <h3 className="text-sm font-bold text-red-950">{tr("Melihat titik api atau asap?", "See fire or smoke?")}</h3>
                <p className="text-xs text-red-800/80 mt-0.5 leading-relaxed">
                  {tr("Laporan Anda membantu petugas memverifikasi kejadian lebih cepat.", "Your report helps officers verify incidents faster.")}
                </p>
              </div>
            </div>
            <Link
              href="/community/report"
              className="block w-full text-center rounded-xl bg-[#ba1a1a] hover:bg-[#a01616] py-2.5 text-xs font-bold text-white transition active:scale-[0.99]"
            >
              {tr("Lapor Kebakaran Sekarang", "Report a Fire Now")}
            </Link>
          </div>

          {status && (
            <button
              type="button"
              onClick={handleShare}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--community-border)] bg-white py-2.5 text-xs font-bold text-[#123027] hover:border-emerald-300 transition active:scale-[0.99]"
            >
              <span className="material-symbols-outlined text-[18px]">{shareSuccess ? "check" : "share"}</span>
              {shareSuccess ? tr("Tautan disalin", "Link copied") : tr("Bagikan situasi ini", "Share this situation")}
            </button>
          )}

          {nearbyReports.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-[#123027]">{tr("Laporan warga terdekat", "Nearest citizen reports")}</h2>
              <NearbyReportList items={nearbyReports} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
