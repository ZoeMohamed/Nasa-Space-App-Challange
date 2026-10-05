"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import { HOTSPOT_MARKERS } from "@/lib/data";

// Dynamic import - Leaflet cannot run on server
const FireMap = dynamic(() => import("@/components/map/FireMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-[#EDE8D5]">
      <span className="font-mono text-xs text-on-surface-variant animate-pulse">
        LOADING SATELLITE MAP…
      </span>
    </div>
  ),
});

const LAYERS = ["MODIS", "VIIRS", "HARMONIZED"] as const;

export default function MapExplorerPage() {
  const router = useRouter();
  const [activeLayer, setActiveLayer] = useState<string>("HARMONIZED");

  return (
    <WorkstationLayout activeTab="MAP">
      <div className="flex-1 flex flex-col overflow-hidden bg-surface-container-lowest">
        {/* Screen Header */}
        <div className="border-b border-outline-variant px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div>
            <div className="font-mono text-[10px] text-outline font-semibold">
              SPATIAL SATELLITE INTELLIGENCE // EPSG:4326
            </div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-bold text-on-surface">MAP EXPLORER</h1>
              <span className="text-xs text-on-surface-variant hidden md:inline">
                | Harmonized MODIS &amp; VIIRS fire activity spatial distribution
              </span>
            </div>
          </div>
          <div className="bg-surface-container border border-outline-variant px-2 py-1 rounded font-mono text-[10px] text-on-surface-variant flex items-center gap-1.5">
            <span className="material-symbols-outlined text-secondary text-sm">satellite_alt</span>
            <span>WGS84 PROJECTION | RECURSIVE CLUSTERING v1.0</span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-[#F8F7F2] border-b border-outline-variant px-4 py-1.5 flex items-center justify-between gap-2 overflow-x-auto text-xs font-mono shrink-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <button className="h-6 px-2 bg-white border border-[#BFC1B7] rounded shadow-xs">DATE: LAST 24H</button>
            <button className="h-6 px-2 bg-white border border-[#BFC1B7] rounded shadow-xs">REGION: ALL</button>
            <button className="h-6 px-2 bg-white border border-[#BFC1B7] rounded shadow-xs">CONFIDENCE: &gt;80%</button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-[#EAE8DD] p-0.5 rounded border border-outline-variant text-[11px]">
              {LAYERS.map((layer) => (
                <button
                  key={layer}
                  onClick={() => setActiveLayer(layer)}
                  className={`px-2 py-0.5 rounded-xs transition-colors ${
                    activeLayer === layer
                      ? "bg-white text-secondary-container font-bold shadow-xs"
                      : "text-on-surface-variant"
                  }`}
                >
                  {layer}
                </button>
              ))}
            </div>
            <button
              onClick={() => router.push("/activities")}
              className="h-6 px-2 bg-white border border-[#BFC1B7] rounded hover:bg-surface-container"
            >
              TABLE VIEW
            </button>
          </div>
        </div>

        {/* Leaflet Map */}
        <div className="relative flex-1 overflow-hidden border-b border-outline-variant">
          <FireMap
            markers={HOTSPOT_MARKERS}
            center={[-1.5, 108]}
            zoom={6}
            className="h-full w-full"
          />
        </div>

        {/* Bottom Telemetry Bar */}
        <div className="bg-[#F8F7F2] border-t border-outline-variant px-4 py-1.5 flex items-center justify-between font-mono text-[10px] text-on-surface-variant overflow-x-auto shrink-0">
          <div className="flex items-center gap-4">
            <span className="font-bold text-on-surface">1,248 DETECTIONS</span>
            <span>•</span>
            <span>37 ACTIVE CLUSTERS</span>
            <span>•</span>
            <span className="text-[#ac3400] font-bold">5 ANOMALIES</span>
          </div>
          <div className="flex items-center gap-2">
            <span>ORBIT: SUOMI-NPP / NOAA-20</span>
            <span>•</span>
            <span className="text-secondary font-bold">CALIBRATED v1.4</span>
          </div>
        </div>
      </div>
    </WorkstationLayout>
  );
}
