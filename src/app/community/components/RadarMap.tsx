"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { HotspotMarker } from "@/types";
import type { CommunityReportPin, UserLocationPin } from "@/components/map/FireMap";
import MapLoadingText from "@/components/map/MapLoadingText";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const FireMap = dynamic(() => import("@/components/map/FireMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full min-h-[280px] flex items-center justify-center bg-gray-50 rounded-2xl">
      <span className="text-xs font-medium text-emerald-800 animate-pulse flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
        <MapLoadingText />
      </span>
    </div>
  ),
});

interface RadarMapProps {
  markers: HotspotMarker[];
  locationLabel?: string;
  /** Omitted when the user hasn't set a location yet — the map then shows all of Indonesia. */
  userCoords?: { lat: number; lon: number } | null;
  reports?: CommunityReportPin[];
  radiusKm?: number;
  heightClass?: string;
}

const INDONESIA_CENTER: [number, number] = [-2.5, 118];

type MapLayerFilter = "ALL" | "MATCHED" | "VIIRS" | "MODIS";

export default function RadarMap({
  markers,
  locationLabel,
  userCoords = null,
  reports = [],
  radiusKm = 10,
  heightClass = "h-[420px] md:h-[520px]",
}: RadarMapProps) {
  const { tr } = useTranslation();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [activeLayer, setActiveLayer] = useState<MapLayerFilter>("ALL");

  // Prevent background scroll when in full-screen mode
  useEffect(() => {
    if (isFullScreen) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsFullScreen(false);
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [isFullScreen]);

  // Filter markers based on layer selection
  const filteredMarkers = useMemo(() => {
    if (activeLayer === "MATCHED") {
      return markers.filter((m) => m.matchStatus === "MATCHED");
    }
    if (activeLayer === "VIIRS") {
      return markers.filter((m) => m.sensor === "VIIRS" || m.matchStatus === "VIIRS_ONLY");
    }
    if (activeLayer === "MODIS") {
      return markers.filter((m) => m.sensor === "MODIS" || m.matchStatus === "MODIS_ONLY");
    }
    return markers;
  }, [markers, activeLayer]);

  const userLocationObj: UserLocationPin | undefined = useMemo(
    () =>
      userCoords
        ? { lat: userCoords.lat, lng: userCoords.lon, label: locationLabel, radiusKm }
        : undefined,
    [userCoords, locationLabel, radiusKm]
  );
  const center: [number, number] = userCoords ? [userCoords.lat, userCoords.lon] : INDONESIA_CENTER;

  return (
    <>
      {/* Standard In-Page Card (Figma Screen 01) */}
      <div className="rounded-3xl border border-[var(--community-border)] bg-white overflow-hidden shadow-xs">
        {/* Header */}
        <div className="p-4 pb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-bold text-[#123027] tracking-tight">{tr("Kebakaran di sekitarmu", "Fires around you")}</h2>
            <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">
              {tr("Peta nyata · MODIS / VIIRS + laporan warga", "Live map · MODIS / VIIRS + citizen reports")}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Buka peta lengkap (Full-Screen Map) Button */}
            <button
              type="button"
              onClick={() => setIsFullScreen(true)}
              className="text-xs font-bold text-[var(--community-accent)] hover:text-emerald-950 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 transition active:scale-95"
            >
              <span>{tr("Buka peta lengkap", "Open full map")}</span>
              <span className="material-symbols-outlined text-[16px]">open_in_full</span>
            </button>
          </div>
        </div>

        {/* Map Content Container — always the real map, never a decorative illustration */}
        <div className={`relative ${heightClass} w-full bg-[#f1f6f2] overflow-hidden select-none`}>
          <div className="h-full w-full">
            {/* FireMap reads `center` only on mount — remount when the user's location changes. */}
            <FireMap
              key={`${center[0]},${center[1]}`}
              markers={markers}
              userLocation={userLocationObj}
              reports={reports}
              center={center}
              zoom={userCoords ? 10 : 5}
              className="h-full w-full"
              showSeverityLegend={true}
              showSymbolLegend={true}
              allowFullScreenToggle={true}
              isFullScreen={false}
              onToggleFullScreen={() => setIsFullScreen(true)}
            />
          </div>
        </div>

        {/* Legend Bar */}
        <div className="p-3 border-t border-[var(--community-border)] bg-white flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--community-ink-muted)] font-medium">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600 ring-1 ring-white" />
            <span>{tr("Lokasimu", "Your location")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-600 ring-1 ring-white" />
            <span>{tr("Tervalidasi", "Verified")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-orange-500 bg-orange-100" />
            <span>{tr("Perlu ditinjau", "Needs review")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
            <span>{tr("Satelit", "Satellite")}</span>
          </div>
        </div>
      </div>

      {/* DEDICATED FULL-SCREEN MAP VIEW (Requirement 1) */}
      {isFullScreen && (
        <div className="fixed inset-0 z-[1500] bg-white flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] animate-fadeIn">
          {/* Full-screen Header Bar */}
          <header className="shrink-0 bg-white/95 backdrop-blur-md border-b border-gray-200 px-4 py-2.5 flex items-center justify-between gap-3 shadow-xs">
            {/* Back Button & Title */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsFullScreen(false)}
                className="flex items-center gap-1.5 text-xs font-bold text-[#123027] hover:text-emerald-800 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-xl transition active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                <span>{tr("Kembali", "Back")}</span>
              </button>
              <div className="min-w-0 hidden sm:block">
                <h1 className="text-sm font-extrabold text-[#123027] truncate">
                  {tr("Peta Pemantauan Karhutla", "Forest & Land Fire Monitoring Map")}
                </h1>
                <p className="text-[10px] text-gray-500 truncate">
                  {userCoords
                    ? `${locationLabel ?? tr("Lokasimu", "Your location")} · ${tr("Radius pantau", "Watch radius")} ${radiusKm} km`
                    : tr("Seluruh Indonesia", "All of Indonesia")}
                </p>
              </div>
            </div>

            {/* Layer Filter Pills */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-bold overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveLayer("ALL")}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeLayer === "ALL"
                    ? "bg-white text-emerald-900 shadow-xs"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {tr("Semua", "All")} ({markers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveLayer("MATCHED")}
                className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                  activeLayer === "MATCHED"
                    ? "bg-white text-emerald-900 shadow-xs"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <span>🔥</span>
                <span>{tr("Terharmonisasi", "Harmonized")}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveLayer("VIIRS")}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeLayer === "VIIRS"
                    ? "bg-white text-emerald-900 shadow-xs"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                VIIRS
              </button>
              <button
                type="button"
                onClick={() => setActiveLayer("MODIS")}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeLayer === "MODIS"
                    ? "bg-white text-emerald-900 shadow-xs"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                MODIS
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsFullScreen(false)}
              aria-label={tr("Tutup peta layar penuh", "Close full-screen map")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </header>

          {/* Fullscreen Map Canvas */}
          <main className="flex-1 relative w-full h-full overflow-hidden bg-[#d9e4df]">
            <FireMap
              markers={filteredMarkers}
              userLocation={userLocationObj}
              reports={reports}
              center={center}
              zoom={userCoords ? 11 : 5}
              className="h-full w-full"
              showSeverityLegend={true}
              showSymbolLegend={true}
              showDetailPanel={true}
              allowFullScreenToggle={false}
              actionHref={(m) => `/community/alert/${m.id}`}
              actionLabel={tr("Lihat Detail Peringatan", "View Alert Details")}
            />
          </main>
        </div>
      )}
    </>
  );
}
