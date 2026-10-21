"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocationState } from "../lib/useLocation";
import type { CommunityReport, HotspotApiResponse, HotspotMarker } from "@/types";
import MapLoadingText from "@/components/map/MapLoadingText";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const FireMap = dynamic(() => import("@/components/map/FireMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-50">
      <span className="text-xs font-medium text-emerald-800 animate-pulse flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
        <MapLoadingText />
      </span>
    </div>
  ),
});

const DEFAULT_PRESET_LOCATION = { lat: -3.125, lon: 114.15 };

/**
 * Community-friendly full map — same live /api/hotspots + /api/reports data and
 * the same FireMap component used on the operator /map page, but rendered inside
 * the cream Community chrome (bottom nav, no sidebar/filters) so citizens never
 * land in the operator shell. This page is what "Lihat semua" / "Pantau Sekitar"
 * on the Community homepage should point to, not /map.
 */
export default function CommunityMapPage() {
  const { tr } = useTranslation();
  const { fix } = useLocationState();
  const [markers, setMarkers] = useState<HotspotMarker[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);

  const activeLat = fix ? fix.lat : DEFAULT_PRESET_LOCATION.lat;
  const activeLon = fix ? fix.lon : DEFAULT_PRESET_LOCATION.lon;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotspots?nearLat=${activeLat}&nearLon=${activeLon}&nearKm=100&limit=5000`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat titik panas");
        return (await res.json()) as HotspotApiResponse;
      })
      .then((body) => {
        if (cancelled) return;
        setMarkers(body.markers);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeLat, activeLon]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat laporan");
        return await res.json();
      })
      .then((body) => {
        if (cancelled) return;
        if (body?.reports) setReports(body.reports);
      })
      .catch(() => {
        /* best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-[#123027]">{tr("Peta Pemantauan", "Monitoring Map")}</h1>
          <p className="text-xs text-[var(--community-ink-muted)] mt-0.5">
            {loading
              ? tr("Memuat deteksi satelit & laporan warga…", "Loading satellite detections & citizen reports…")
              : tr(
                  `${markers.length} deteksi satelit · ${reports.length} laporan warga`,
                  `${markers.length} satellite detections · ${reports.length} citizen reports`
                )}
            {!fix && ` · ${tr("contoh: sekitar Pulang Pisau (lokasi belum diatur)", "example: around Pulang Pisau (location not set)")}`}
          </p>
        </div>
        <Link
          href="/community/report"
          className="shrink-0 flex items-center gap-1.5 rounded-full bg-[#ba1a1a] hover:bg-[#a01616] text-white text-xs font-bold px-3.5 py-2 transition active:scale-95"
        >
          <span className="material-symbols-outlined text-[16px]">photo_camera</span>
          {tr("Lapor", "Report")}
        </Link>
      </div>

      <div className="rounded-2xl border border-[var(--community-border)] overflow-hidden h-[70vh] min-h-[420px] shadow-xs">
        <FireMap
          markers={markers}
          center={[activeLat, activeLon]}
          zoom={9}
          className="h-full w-full"
          showSymbolLegend
          reports={reports.map((r) => ({
            id: r.id,
            lat: r.lat,
            lng: r.lon,
            status: r.status,
            description: r.description,
            createdAt: r.createdAt,
          }))}
          userLocation={fix ? { lat: fix.lat, lng: fix.lon, label: tr("Lokasimu", "Your location"), radiusKm: 10 } : undefined}
          actionHref={(marker) => `/community/alert/${marker.id}`}
          actionLabel={tr("Lihat detail", "View details")}
        />
      </div>

      <p className="text-[11px] text-[var(--community-ink-muted)] leading-relaxed px-1">
        {tr(
          "🔥 pasangan MODIS+VIIRS yang cocok · ★ hanya MODIS · ⬡ hanya VIIRS · 👤 laporan warga. Deteksi satelit menandai anomali suhu, bukan konfirmasi kebakaran aktif.",
          "🔥 matched MODIS+VIIRS pair · ★ MODIS only · ⬡ VIIRS only · 👤 citizen report. Satellite detections mark temperature anomalies, not confirmed active fires."
        )}
      </p>
    </div>
  );
}
