"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LocationPicker from "./components/LocationPicker";
import RadarMap from "./components/RadarMap";
import { NearbyReportList, type NearbyReportItem } from "./components/NearbyLists";
import { formatDistanceKm, haversineKm } from "./lib/geo";
import { useLocationState } from "./lib/useLocation";
import type { CommunityReport, HotspotApiResponse, HotspotMarker } from "@/types";

const MAX_NEARBY = 5;
const RADIUS_KM = 10;

// Default demo coordinates: Desa Bahaur, Pulang Pisau, Kalimantan Tengah (Matching Figma Screen 01)
const DEFAULT_PRESET_LOCATION = {
  name: "Desa Bahaur, Pulang Pisau",
  province: "Kalimantan Tengah",
  radiusKm: RADIUS_KM,
  lat: -3.125,
  lon: 114.15,
};

/** Relative-time label from a hotspot's own acquiredAt timestamp — never a hardcoded clock time. */
function formatRelativeTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "baru saja";
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  return `${days} hari lalu`;
}

export default function CommunityBerandaPage() {
  const location = useLocationState();
  const { fix } = location;

  const [markers, setMarkers] = useState<HotspotMarker[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [hotspotLoading, setHotspotLoading] = useState(true);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  // Active coordinates: uses user's GPS/manual pick if set, else defaults to Desa Bahaur
  const activeLat = fix ? fix.lat : DEFAULT_PRESET_LOCATION.lat;
  const activeLon = fix ? fix.lon : DEFAULT_PRESET_LOCATION.lon;
  const locationName = fix
    ? fix.source === "gps"
      ? "Lokasi GPS Anda"
      : `Koordinat ${fix.lat.toFixed(3)}, ${fix.lon.toFixed(3)}`
    : DEFAULT_PRESET_LOCATION.name;
  const locationSourceLabel = fix
    ? fix.source === "gps"
      ? `GPS · akurasi ±${Math.round(fix.accuracyMeters ?? 15)} m`
      : fix.source === "manual-coords"
        ? "Koordinat dimasukkan manual"
        : "Area dipilih manual"
    : "Lokasi contoh (belum diatur)";
  const locationSub = `${locationSourceLabel} · Radius pantau ${RADIUS_KM} km`;

  // Fetch real hotspots from API
  useEffect(() => {
    let cancelled = false;
    fetch("/api/hotspots", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat titik panas");
        return (await res.json()) as HotspotApiResponse;
      })
      .then((body) => {
        if (cancelled) return;
        setMarkers(body.markers);
        setHotspotLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setHotspotLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch real community reports from API
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat laporan");
        return await res.json();
      })
      .then((body) => {
        if (cancelled) return;
        if (body?.reports) {
          setReports(body.reports);
        }
      })
      .catch(() => {
        /* best-effort */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Calculate nearby hotspots (within monitoring radius), from real /api/hotspots markers
  const nearbyHotspots = useMemo(() => {
    if (markers.length === 0) return [];
    return markers
      .map((marker) => ({
        marker,
        distanceKm: haversineKm({ lat: activeLat, lon: activeLon }, { lat: marker.lat, lon: marker.lng }),
      }))
      .filter((m) => m.distanceKm <= RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_NEARBY);
  }, [activeLat, activeLon, markers]);

  // Calculate nearby community reports, from real /api/reports
  const nearbyReports: NearbyReportItem[] = useMemo(() => {
    if (reports.length === 0) return [];
    return reports
      .map((report) => ({
        report,
        distanceKm: haversineKm({ lat: activeLat, lon: activeLon }, { lat: report.lat, lon: report.lon }),
      }))
      .filter((r) => r.distanceKm <= RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);
  }, [activeLat, activeLon, reports]);

  const nearestHotspot = nearbyHotspots[0];
  const nearestId = nearestHotspot?.marker.id;
  const nearestDist = nearestHotspot ? nearestHotspot.distanceKm : undefined;
  const nearestRelativeTime = nearestHotspot ? formatRelativeTime(nearestHotspot.marker.acquiredAt) : null;

  const hasVerifiedNearbyReport = nearbyReports.some((r) => r.report.status === "verified");

  /**
   * Simple, deterministic status label from real computed data only — not a
   * calibrated risk score. Tiers: Awas = verified citizen report within 5km;
   * Siaga = any satellite detection within 5km; Waspada = detection present
   * but only 5-10km away; Aman = nothing detected in the 10km radius at all.
   * This is a plain distance/count rule, documented here so it's never read
   * as more precise than it is.
   */
  const situationStatus = hotspotLoading
    ? null
    : hasVerifiedNearbyReport && nearestDist !== undefined && nearestDist <= 5
      ? { label: "Awas", tone: "awas" as const }
      : nearestDist !== undefined && nearestDist <= 5
        ? { label: "Siaga", tone: "siaga" as const }
        : nearbyHotspots.length > 0
          ? { label: "Waspada", tone: "waspada" as const }
          : { label: "Aman", tone: "aman" as const };

  const STATUS_STYLE: Record<string, { badge: string; dot: string }> = {
    aman: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    waspada: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
    siaga: { badge: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
    awas: { badge: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-600" },
  };

  const STATUS_LABEL: Record<"aman" | "waspada" | "siaga" | "awas", string> = {
    aman: "Aman",
    waspada: "Waspada",
    siaga: "Siaga",
    awas: "Awas",
  };

  const handleShare = async () => {
    const count = nearbyHotspots.length;
    const statusLabel = situationStatus ? `Status: ${situationStatus.label}. ` : "";
    const text =
      count > 0
        ? `${statusLabel}${count} deteksi satelit titik panas dalam radius ${RADIUS_KM} km dari ${locationName}. Lihat detailnya di AGNIBHŪMI.`
        : `${statusLabel}Tidak ada deteksi satelit titik panas dalam radius ${RADIUS_KM} km dari ${locationName} saat ini. Pantau terus di AGNIBHŪMI.`;

    const shareData = {
      title: "AGNIBHŪMI — Pemantauan Karhutla",
      text,
      url: typeof window !== "undefined" ? window.location.href : "",
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        /* user cancelled share */
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2500);
    }
  };

  return (
    <div className="space-y-5">
      {/* A) Location Bar with Ubah Trigger */}
      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3.5 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[var(--community-accent)]">
            <span className="material-symbols-outlined text-[20px]">location_on</span>
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-[#123027] truncate leading-tight">{locationName}</h1>
            <p className="text-[11px] text-[var(--community-ink-muted)] truncate mt-0.5">{locationSub}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowLocationModal(!showLocationModal)}
          className="shrink-0 text-xs font-bold text-[var(--community-accent)] bg-emerald-50/80 hover:bg-emerald-100/80 px-3 py-1.5 rounded-full border border-emerald-200 transition active:scale-95"
        >
          {showLocationModal ? "Tutup" : "Ubah"}
        </button>
      </div>

      {/* Expandable Location Picker */}
      {showLocationModal && (
        <div className="animate-fadeIn">
          <LocationPicker location={location} />
        </div>
      )}

      {/* B) Status hero card — dark-green, real computed status/count/distance, no fabricated AQI/wind */}
      <div className="relative rounded-3xl bg-gradient-to-br from-[#0c2a1f] via-[#103728] to-[#0a231a] text-white p-5 md:p-6 shadow-md shadow-emerald-950/20 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-[11px] font-semibold text-emerald-200 border border-white/10">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Status wilayahmu
          </span>
          <span className="text-[11px] text-emerald-200/80 font-medium">
            {hotspotLoading ? "Memperbarui…" : nearestRelativeTime ? `Diperbarui ${nearestRelativeTime}` : "Belum ada data"}
          </span>
        </div>

        {hotspotLoading ? (
          <div className="mt-4 h-9 w-32 rounded-lg bg-white/10 animate-pulse" />
        ) : situationStatus ? (
          <div className="mt-4 flex items-center gap-2.5">
            <span className="relative flex h-3.5 w-3.5 items-center justify-center">
              {(situationStatus.tone === "siaga" || situationStatus.tone === "awas") && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${STATUS_STYLE[situationStatus.tone].dot} opacity-75`} />
              )}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${STATUS_STYLE[situationStatus.tone].dot}`} />
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              {situationStatus.label}
            </h2>
          </div>
        ) : null}

        <p className="mt-2 text-xs md:text-[13px] text-emerald-100/90 leading-relaxed font-normal">
          {hotspotLoading
            ? "Memuat data deteksi satelit terbaru di sekitar lokasimu…"
            : nearbyHotspots.length === 0
              ? `Tidak ada deteksi satelit tercatat dalam radius ${RADIUS_KM} km dari lokasimu saat ini. Ini bukan kepastian bebas kebakaran.`
              : `${nearbyHotspots.length} deteksi satelit terdeteksi dalam radius ${RADIUS_KM} km dari lokasimu. Terdekat ${nearestDist !== undefined ? formatDistanceKm(nearestDist) : "—"}${nearestRelativeTime ? `, terdeteksi ${nearestRelativeTime}` : ""}.`}
        </p>

        {/* 4-step status bar — real tier from situationStatus, enlarged */}
        <div className="mt-5 space-y-2.5">
          <div className="grid grid-cols-4 gap-2 h-4 rounded-full overflow-hidden bg-white/10 p-0.5">
            {(["aman", "waspada", "siaga", "awas"] as const).map((tier) => {
              const isActive = situationStatus?.tone === tier;
              const base =
                tier === "aman"
                  ? "bg-emerald-600/50"
                  : tier === "waspada"
                    ? "bg-amber-500/50"
                    : tier === "siaga"
                      ? "bg-[#f97316]/50"
                      : "bg-rose-700/50";
              const active =
                tier === "aman"
                  ? "bg-emerald-500"
                  : tier === "waspada"
                    ? "bg-amber-500"
                    : tier === "siaga"
                      ? "bg-[#f97316]"
                      : "bg-rose-600";
              return (
                <div
                  key={tier}
                  className={`rounded-full ${isActive ? `${active} ring-2 ring-white/60 shadow-sm` : base} ${isActive && (tier === "siaga" || tier === "awas") ? "animate-pulse" : ""}`}
                  title={STATUS_LABEL[tier]}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-4 text-center text-[11px] font-semibold text-emerald-200/80">
            {(["aman", "waspada", "siaga", "awas"] as const).map((tier) => (
              <span
                key={tier}
                className={situationStatus?.tone === tier ? "text-white font-extrabold text-[12px]" : ""}
              >
                {STATUS_LABEL[tier]}
              </span>
            ))}
          </div>
        </div>

        <p className="mt-4 text-[11px] text-emerald-200/70 leading-relaxed">
          Status dihitung dari jarak &amp; jumlah deteksi satelit terdekat (
          {hasVerifiedNearbyReport ? "termasuk laporan warga terverifikasi" : "belum ada laporan warga terverifikasi di sekitar"}
          ), bukan skor risiko resmi. Deteksi satelit menandai anomali suhu, bukan konfirmasi kebakaran aktif.
        </p>

        <div className="mt-5 flex items-center gap-2.5">
          <Link
            href={nearestId ? `/community/alert/${nearestId}` : "/community/map"}
            className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-emerald-50 text-[#123027] font-bold text-xs md:text-sm py-3 px-4 rounded-xl shadow-xs transition-transform active:scale-[0.98]"
          >
            <span>{nearestId ? "Lihat detail peringatan" : "Buka peta lengkap"}</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
          <button
            type="button"
            onClick={handleShare}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 hover:bg-white/20 text-white transition active:scale-95"
            title="Bagikan status"
          >
            <span className="material-symbols-outlined text-[20px]">{shareSuccess ? "check" : "share"}</span>
          </button>
        </div>
      </div>

      {/* C) Four primary actions, equal visual weight */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link
          href="/community/map"
          className="rounded-2xl border border-[var(--community-border)] bg-white p-4 flex flex-col gap-2 hover:border-emerald-300 transition shadow-xs"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <span className="material-symbols-outlined text-[20px]">map</span>
          </span>
          <span className="text-xs font-bold text-[#123027]">Pantau Sekitar</span>
        </Link>
        <Link
          href="/community/report"
          className="rounded-2xl border border-[var(--community-border)] bg-white p-4 flex flex-col gap-2 hover:border-emerald-300 transition shadow-xs"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <span className="material-symbols-outlined text-[20px]">photo_camera</span>
          </span>
          <span className="text-xs font-bold text-[#123027]">Lapor Kejadian</span>
        </Link>
        <Link
          href="/community/edukasi"
          className="rounded-2xl border border-[var(--community-border)] bg-white p-4 flex flex-col gap-2 hover:border-emerald-300 transition shadow-xs"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <span className="material-symbols-outlined text-[20px]">shield</span>
          </span>
          <span className="text-xs font-bold text-[#123027]">Belajar Bersiap</span>
        </Link>
        <div
          className="rounded-2xl border border-dashed border-[var(--community-border)] bg-gray-50/60 p-4 flex flex-col gap-2 cursor-default"
          title="Data kualitas udara belum terhubung ke aplikasi ini"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
            <span className="material-symbols-outlined text-[20px]">air</span>
          </span>
          <span className="text-xs font-bold text-gray-400">
            Cek Kualitas Udara <span className="block text-[10px] font-semibold">Segera hadir</span>
          </span>
        </div>
      </div>

      {/* Responsive Grid on Desktop / Single Stacked Column on Mobile */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6">
        {/* Left Column (Desktop 7 cols / Mobile full) */}
        <div className="md:col-span-7 space-y-5">
          {/* D) Secondary section: real nearby hotspots, top 3 only */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#123027]">Titik api terdekat</h2>
              <Link href="/community/map" className="text-xs font-semibold text-[var(--community-accent)] hover:underline">
                Lihat semua
              </Link>
            </div>

            {hotspotLoading ? (
              <div className="space-y-2">
                <div className="h-16 rounded-2xl bg-gray-50 animate-pulse" />
                <div className="h-16 rounded-2xl bg-gray-50 animate-pulse" />
              </div>
            ) : nearbyHotspots.length === 0 ? (
              <p className="text-sm text-[var(--community-ink-muted)] rounded-xl border border-dashed border-[var(--community-border)] p-4">
                Tidak ada deteksi satelit di sekitar lokasi Anda saat ini.
              </p>
            ) : (
              <div className="space-y-2">
                {nearbyHotspots.slice(0, 3).map(({ marker, distanceKm }) => (
                  <Link
                    key={marker.id}
                    href={`/community/alert/${marker.id}`}
                    className="group block rounded-2xl border border-[var(--community-border)] bg-white p-3.5 hover:border-emerald-300 transition shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 group-hover:scale-105 transition-transform">
                          <span className="material-symbols-outlined text-[20px]">local_fire_department</span>
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#123027] truncate">
                            {formatDistanceKm(distanceKm)}
                          </div>
                          <div className="text-[11px] text-[var(--community-ink-muted)] mt-0.5 truncate">
                            {marker.sensor ?? marker.satellite ?? "Sensor tidak tercatat"}
                            {formatRelativeTime(marker.acquiredAt)
                              ? ` · ${formatRelativeTime(marker.acquiredAt)}`
                              : ""}
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                        Deteksi satelit
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column (Desktop 5 cols / Mobile full) */}
        <div className="md:col-span-5 space-y-5">
          {/* E) RadarMap preview with link to full map */}
          <RadarMap
            markers={markers}
            locationLabel={locationName}
            userCoords={{ lat: activeLat, lon: activeLon }}
            reports={reports.map((r) => ({
              id: r.id,
              lat: r.lat,
              lng: r.lon,
              status: r.status,
              description: r.description,
              createdAt: r.createdAt,
            }))}
          />

          {/* F) Report CTA — single prominent action, not duplicated with grid button above */}
          <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ba1a1a] text-white shadow-xs">
                <span className="material-symbols-outlined text-[22px]">photo_camera</span>
              </span>
              <div>
                <h3 className="text-sm font-bold text-red-950">Melihat titik api atau asap?</h3>
                <p className="text-xs text-red-800/80 mt-0.5 leading-relaxed">
                  Laporan Anda membantu petugas memverifikasi kejadian lebih cepat.
                </p>
              </div>
            </div>
            <Link
              href="/community/report"
              className="block w-full text-center rounded-xl bg-[#ba1a1a] hover:bg-[#a01616] py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-[0.99]"
            >
              Lapor Kebakaran Sekarang
            </Link>
          </div>

          {/* G) Share — reflects only real computed count */}
          <button
            type="button"
            onClick={handleShare}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--community-border)] bg-white py-2.5 text-xs font-bold text-[#123027] hover:border-emerald-300 transition active:scale-[0.99]"
          >
            <span className="material-symbols-outlined text-[18px]">
              {shareSuccess ? "check" : "share"}
            </span>
            {shareSuccess ? "Tautan disalin" : "Bagikan situasi ini"}
          </button>

          {/* Laporan Warga Terdekat */}
          {nearbyReports.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#123027]">Laporan Warga Terdekat</h2>
                <Link href="/community/saya" className="text-xs text-[var(--community-accent)] font-semibold hover:underline">
                  Lihat semua
                </Link>
              </div>
              <NearbyReportList items={nearbyReports} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
