"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { HotspotMarker } from "@/types";

const FireMap = dynamic(() => import("@/components/map/FireMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full min-h-[280px] flex items-center justify-center bg-gray-50 rounded-2xl">
      <span className="text-xs font-medium text-emerald-800 animate-pulse flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
        Memuat peta interaktif…
      </span>
    </div>
  ),
});

interface RadarMapProps {
  markers: HotspotMarker[];
  locationLabel?: string;
  nearestDistanceKm?: number;
}

export default function RadarMap({ markers, locationLabel = "Lokasimu", nearestDistanceKm = 2.4 }: RadarMapProps) {
  const [viewMode, setViewMode] = useState<"radar" | "interactive">("radar");

  return (
    <div className="rounded-3xl border border-[var(--community-border)] bg-white overflow-hidden shadow-xs">
      {/* Header */}
      <div className="p-4 pb-3 flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-[#123027] tracking-tight">Kebakaran di sekitarmu</h2>
          <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">
            Ilustrasi peta · MODIS / VIIRS + laporan warga
          </p>
        </div>
        <button
          type="button"
          onClick={() => setViewMode(viewMode === "radar" ? "interactive" : "radar")}
          className="text-xs font-bold text-[var(--community-accent)] hover:text-emerald-800 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition"
        >
          <span>{viewMode === "radar" ? "Buka peta interaktif" : "Lihat radar radius"}</span>
          <span className="material-symbols-outlined text-[15px]">
            {viewMode === "radar" ? "map" : "radar"}
          </span>
        </button>
      </div>

      {/* Map Content */}
      <div className="relative h-[290px] w-full bg-[#f1f6f2] overflow-hidden select-none">
        {viewMode === "interactive" ? (
          <div className="h-full w-full">
            <FireMap markers={markers} className="h-full w-full" showSeverityLegend={false} />
          </div>
        ) : (
          /* Figma-style stylized Radar Map View */
          <div className="relative h-full w-full flex items-center justify-center bg-gradient-to-b from-[#e8f1eb] via-[#e2eee5] to-[#d9e7dd]">
            {/* SVG Background Contours / Rivers / Peatland */}
            <svg className="absolute inset-0 h-full w-full opacity-40 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#b2cdbe" strokeWidth="0.5" strokeDasharray="2,2" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              {/* River path */}
              <path
                d="M -10 120 C 80 140, 150 90, 220 160 C 290 230, 340 180, 420 200"
                fill="none"
                stroke="#9fc0b0"
                strokeWidth="10"
                strokeLinecap="round"
                className="opacity-60"
              />
              <path
                d="M -10 120 C 80 140, 150 90, 220 160 C 290 230, 340 180, 420 200"
                fill="none"
                stroke="#c0dfd0"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>

            {/* Radar Radius Circles */}
            <div className="relative flex items-center justify-center">
              {/* 10 km Outer Circle */}
              <div className="w-[230px] h-[230px] rounded-full border-2 border-dashed border-emerald-600/40 bg-emerald-500/5 flex items-center justify-center relative animate-pulse">
                {/* 10 km badge tag */}
                <span className="absolute top-2 left-6 bg-white/90 backdrop-blur-xs text-[10px] font-bold text-emerald-800 px-2 py-0.5 rounded-full shadow-xs border border-emerald-200">
                  Radius 10 km
                </span>
                
                {/* 5 km Inner Circle */}
                <div className="w-[140px] h-[140px] rounded-full border border-emerald-600/30 bg-emerald-500/5 flex items-center justify-center relative">
                  
                  {/* Center: Lokasimu */}
                  <div className="relative z-10 flex flex-col items-center">
                    <span className="relative flex h-5 w-5 items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-600 ring-3 ring-white shadow-md" />
                    </span>
                    <span className="mt-1 text-[9px] font-bold bg-[#123027] text-white px-2 py-0.5 rounded-full shadow-xs whitespace-nowrap">
                      {locationLabel}
                    </span>
                  </div>

                  {/* Hotspot 1: 2.4 km (Timur Laut) with distance indicator */}
                  <div className="absolute top-4 right-3 z-10 flex flex-col items-center">
                    {/* Distance pill */}
                    <span className="mb-0.5 text-[9px] font-extrabold bg-[#ba1a1a] text-white px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-0.5">
                      <span>{nearestDistanceKm.toFixed(1)} km</span>
                    </span>
                    <span className="relative flex h-4 w-4 items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 ring-2 ring-white shadow-sm" />
                    </span>
                  </div>

                  {/* Connector line between Lokasimu and 2.4km */}
                  <svg className="absolute inset-0 h-full w-full pointer-events-none">
                    <line x1="70" y1="70" x2="115" y2="35" stroke="#ba1a1a" strokeWidth="1.5" strokeDasharray="3,3" />
                  </svg>
                </div>
              </div>

              {/* Hotspot 2: 5.8 km (Selatan) */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
                <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 ring-2 ring-white shadow-xs" />
                </span>
                <span className="text-[8px] font-semibold text-gray-700 bg-white/80 px-1 rounded">5,8 km</span>
              </div>

              {/* Hotspot 3: 8.1 km (Barat) */}
              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
                <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 border-2 border-orange-500 bg-white ring-1 ring-white shadow-xs" />
                </span>
                <span className="text-[8px] font-semibold text-gray-700 bg-white/80 px-1 rounded">8,1 km</span>
              </div>

              {/* Satellite Detection 4 */}
              <div className="absolute right-4 bottom-12 z-10 flex flex-col items-center">
                <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-400 ring-2 ring-white shadow-xs" />
                </span>
                <span className="text-[8px] font-semibold text-gray-700 bg-white/80 px-1 rounded">6,9 km</span>
              </div>

              {/* Area label: Pulang Pisau */}
              <div className="absolute bottom-2 left-4 text-[10px] font-bold text-emerald-900/60 uppercase tracking-widest">
                PULANG PISAU
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend Bar */}
      <div className="p-3 border-t border-[var(--community-border)] bg-white flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--community-ink-muted)] font-medium">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600 ring-1 ring-white" />
          <span>Lokasimu</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-600 ring-1 ring-white" />
          <span>Tervalidasi</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-orange-500 bg-orange-100" />
          <span>Perlu ditinjau</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
          <span>Satelit</span>
        </div>
      </div>
    </div>
  );
}
