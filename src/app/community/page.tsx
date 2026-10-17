"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LocationPicker from "./components/LocationPicker";
import RadarMap from "./components/RadarMap";
import { NearbyReportList, type NearbyReportItem } from "./components/NearbyLists";
import { haversineKm, formatDistanceKm } from "./lib/geo";
import { useLocationState } from "./lib/useLocation";
import type { CommunityReport, HotspotApiResponse, HotspotMarker } from "@/types";

const MAX_NEARBY = 5;

// Default demo coordinates: Desa Bahaur, Pulang Pisau, Kalimantan Tengah (Matching Figma Screen 01)
const DEFAULT_PRESET_LOCATION = {
  name: "Desa Bahaur, Pulang Pisau",
  province: "Kalimantan Tengah",
  radiusKm: 10,
  lat: -3.125,
  lon: 114.15,
};

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
  const locationSub = fix
    ? fix.source === "gps"
      ? `Akurasi ±${Math.round(fix.accuracyMeters ?? 15)} m · Radius pantau 10 km`
      : "Lokasi Pilihan · Radius pantau 10 km"
    : `${DEFAULT_PRESET_LOCATION.province} · Radius pantau 10 km`;

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

  // Calculate nearby hotspots
  const nearbyHotspots = useMemo(() => {
    if (markers.length === 0) return [];
    return markers
      .map((marker) => ({
        marker,
        distanceKm: haversineKm({ lat: activeLat, lon: activeLon }, { lat: marker.lat, lon: marker.lng }),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_NEARBY);
  }, [activeLat, activeLon, markers]);

  // Calculate nearby community reports
  const nearbyReports: NearbyReportItem[] = useMemo(() => {
    if (reports.length === 0) return [];
    return reports
      .map((report) => ({
        report,
        distanceKm: haversineKm({ lat: activeLat, lon: activeLon }, { lat: report.lat, lon: report.lon }),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);
  }, [activeLat, activeLon, reports]);

  const nearestHotspot = nearbyHotspots[0];
  const nearestId = nearestHotspot?.marker.id ?? "demo-bahaur-01";
  const nearestDist = nearestHotspot ? nearestHotspot.distanceKm : 2.4;

  const handleShare = async () => {
    const shareData = {
      title: "Peringatan Karhutla AGNIBHŪMI",
      text: "Status Siaga: 3 titik api terdeteksi dalam radius 10 km dari Desa Bahaur, Pulang Pisau. Periksa detailnya di AGNIBHŪMI.",
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
      {/* Location Bar with Ubah Trigger */}
      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3.5 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[var(--community-accent)]">
            <span className="material-symbols-outlined text-[20px]">location_on</span>
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-[#123027] truncate leading-tight">
              {locationName}
            </h1>
            <p className="text-[11px] text-[var(--community-ink-muted)] truncate mt-0.5">
              {locationSub}
            </p>
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

      {/* Responsive Grid on Desktop / Single Stacked Column on Mobile */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6">
        
        {/* Left Column (Desktop 7 cols / Mobile full) */}
        <div className="md:col-span-7 space-y-5">
          
          {/* Status Wilayah Card (Figma 01: Deep Forest Green Siaga Card) */}
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0c2a1f] via-[#103728] to-[#0a231a] text-white p-5 md:p-6 shadow-md shadow-emerald-950/20 overflow-hidden">
            {/* Top row */}
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-[11px] font-semibold text-emerald-200 border border-white/10">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Status wilayahmu
              </span>
              <span className="text-[11px] text-emerald-200/80 font-medium">
                Diperbarui 07.14 WIB
              </span>
            </div>

            {/* Headline with amber/orange dot */}
            <div className="mt-4 flex items-center gap-2.5">
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#f97316]" />
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                Siaga
              </h2>
            </div>

            {/* Description */}
            <p className="mt-2 text-xs md:text-[13px] text-emerald-100/90 leading-relaxed font-normal">
              3 titik api terdeteksi dalam radius 10 km dari lokasimu dalam 6 jam terakhir. Terdekat 2,4 km ke arah timur laut.
            </p>

            {/* 4-Step Risk Gauge Bar */}
            <div className="mt-5 space-y-2">
              <div className="grid grid-cols-4 gap-1.5 h-2.5 rounded-full overflow-hidden bg-white/10 p-0.5">
                <div className="rounded-full bg-emerald-600/50" title="Aman" />
                <div className="rounded-full bg-amber-500/50" title="Waspada" />
                <div className="rounded-full bg-[#f97316] ring-2 ring-white/50 shadow-sm animate-pulse" title="Siaga (Aktif)" />
                <div className="rounded-full bg-rose-700/40" title="Awas" />
              </div>
              <div className="grid grid-cols-4 text-center text-[10px] font-semibold text-emerald-200/80">
                <span>Aman</span>
                <span>Waspada</span>
                <span className="text-white font-extrabold text-[11px] text-[#f97316]">Siaga</span>
                <span>Awas</span>
              </div>
            </div>

            {/* Action buttons inside card */}
            <div className="mt-6 flex items-center gap-2.5">
              <Link
                href={`/community/alert/${nearestId}`}
                className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-emerald-50 text-[#123027] font-bold text-xs md:text-sm py-3 px-4 rounded-xl shadow-xs transition-transform active:scale-[0.98]"
              >
                <span>Lihat detail peringatan</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
              <button
                type="button"
                onClick={handleShare}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 hover:bg-white/20 text-white transition active:scale-95"
                title="Bagikan peringatan"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {shareSuccess ? "check" : "share"}
                </span>
              </button>
            </div>
          </div>

          {/* 2 Metric Cards (Kualitas Udara & Arah Angin) */}
          <div className="grid grid-cols-2 gap-3.5">
            {/* Card 1: Kualitas Udara */}
            <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <span className="material-symbols-outlined text-[18px]">air</span>
                </span>
                <span className="text-xs font-semibold text-[var(--community-ink-muted)]">
                  Kualitas udara
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-rose-600 leading-none">168</span>
                <span className="text-xs font-bold text-rose-700">Tidak sehat</span>
              </div>
              <p className="text-[11px] text-[var(--community-ink-muted)]">
                ISPU PM2.5 · gunakan masker
              </p>
            </div>

            {/* Card 2: Arah Angin */}
            <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <span className="material-symbols-outlined text-[18px]">explore</span>
                </span>
                <span className="text-xs font-semibold text-[var(--community-ink-muted)]">
                  Arah angin
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-teal-950 leading-none">12 km/j</span>
                <span className="text-xs font-bold text-teal-800">ke BD</span>
              </div>
              <p className="text-[11px] text-[var(--community-ink-muted)]">
                Asap bisa mengarah ke desa
              </p>
            </div>
          </div>

          {/* Section: Titik api terdekat */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#123027]">Titik api terdekat</h2>
              <span className="text-[11px] font-semibold text-[var(--community-ink-muted)] bg-gray-100 px-2.5 py-0.5 rounded-full">
                6 jam terakhir
              </span>
            </div>

            <div className="space-y-2">
              {/* Item 1 */}
              <Link
                href={`/community/alert/${nearestId}`}
                className="group block rounded-2xl border border-[var(--community-border)] bg-white p-3.5 hover:border-emerald-300 transition shadow-xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 group-hover:scale-105 transition-transform">
                      <span className="material-symbols-outlined text-[20px]">local_fire_department</span>
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#123027] truncate">
                        2,4 km · Timur Laut
                      </div>
                      <div className="text-[11px] text-[var(--community-ink-muted)] mt-0.5 truncate">
                        VIIRS + 2 laporan warga · 07.12 WIB
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                    Tervalidasi
                  </span>
                </div>
              </Link>

              {/* Item 2 */}
              <Link
                href={`/community/alert/${markers[1]?.id ?? nearestId}`}
                className="group block rounded-2xl border border-[var(--community-border)] bg-white p-3.5 hover:border-emerald-300 transition shadow-xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 group-hover:scale-105 transition-transform">
                      <span className="material-symbols-outlined text-[20px]">local_fire_department</span>
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#123027] truncate">
                        5,8 km · Selatan
                      </div>
                      <div className="text-[11px] text-[var(--community-ink-muted)] mt-0.5 truncate">
                        MODIS · 05.40 WIB
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                    Deteksi satelit
                  </span>
                </div>
              </Link>

              {/* Item 3 */}
              <Link
                href={`/community/alert/${markers[2]?.id ?? nearestId}`}
                className="group block rounded-2xl border border-[var(--community-border)] bg-white p-3.5 hover:border-emerald-300 transition shadow-xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 group-hover:scale-105 transition-transform">
                      <span className="material-symbols-outlined text-[20px]">cloud</span>
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#123027] truncate">
                        8,1 km · Barat
                      </div>
                      <div className="text-[11px] text-[var(--community-ink-muted)] mt-0.5 truncate">
                        Laporan warga · Asap · 06.55 WIB
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                    Perlu ditinjau
                  </span>
                </div>
              </Link>
            </div>
          </section>

          {/* Banner: Panduan Siaga Kebakaran */}
          <Link
            href="/community/edukasi"
            className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--community-border)] bg-white p-4 hover:border-emerald-400 transition-all shadow-xs group"
          >
            <div className="flex items-center gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-900 text-white group-hover:scale-105 transition-transform shadow-xs">
                <span className="material-symbols-outlined text-[22px]">shield</span>
              </span>
              <div>
                <h3 className="text-xs md:text-sm font-bold text-[#123027]">
                  Panduan siaga kebakaran
                </h3>
                <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">
                  Apa yang perlu disiapkan keluargamu
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined text-[20px] text-[var(--community-ink-muted)] group-hover:translate-x-1 transition-transform">
              chevron_right
            </span>
          </Link>

        </div>

        {/* Right Column (Desktop 5 cols / Mobile full) */}
        <div className="md:col-span-5 space-y-5">
          
          {/* Section: Kebakaran di sekitarmu (Radar Map) */}
          <RadarMap
            markers={markers}
            locationLabel={locationName}
            nearestDistanceKm={nearestDist}
          />

          {/* Call to Action Box for Reporting */}
          <div className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-orange-50/40 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ba1a1a] text-white shadow-xs">
                <span className="material-symbols-outlined text-[22px]">photo_camera</span>
              </span>
              <div>
                <h3 className="text-sm font-bold text-red-950">Melihat titik api atau asap?</h3>
                <p className="text-xs text-red-800/80 mt-0.5 leading-relaxed">
                  Bantu tim Manggala Agni dan warga desa memvalidasi kebakaran lebih cepat.
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

          {/* Section: Laporan Warga Terdekat */}
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
