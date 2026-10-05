"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import { HOTSPOT_MARKERS } from "@/lib/data";

const FireMap = dynamic(() => import("@/components/map/FireMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100">
      <span className="font-medium text-sm text-gray-500 animate-pulse">
        Loading Map Explorer…
      </span>
    </div>
  ),
});

const LAYERS = ["MODIS", "VIIRS", "HARMONIZED"] as const;

export default function MapExplorerPage() {
  const router = useRouter();
  const [activeLayer, setActiveLayer] = useState<string>("HARMONIZED");

  return (
    <WorkstationLayout activeTab="Map">
      <div className="max-w-[1400px] mx-auto h-[80vh] flex flex-col space-y-4">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
              <span>Spatial Satellite Intelligence</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">
              Map Explorer
            </h1>
            <p className="text-sm text-gray-500">
              Interactive map of harmonized fire activity spatial distribution.
            </p>
          </div>
          
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg text-sm font-medium">
            {LAYERS.map((layer) => (
              <button
                key={layer}
                onClick={() => setActiveLayer(layer)}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  activeLayer === layer
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {layer}
              </button>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <button className="h-9 px-4 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
              Last 24 Hours
            </button>
            <button className="h-9 px-4 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
              Region: All
            </button>
            <button className="h-9 px-4 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
              Confidence &gt; 80%
            </button>
          </div>
          <button
            onClick={() => router.push("/activities")}
            className="h-9 px-4 bg-white border border-gray-200 rounded-lg text-sm font-medium text-blue-600 shadow-sm hover:bg-gray-50"
          >
            Table View
          </button>
        </div>

        {/* Map Container */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden relative">
          <FireMap
            markers={HOTSPOT_MARKERS}
            center={[-1.5, 108]}
            zoom={6}
            className="h-full w-full"
          />
        </div>

      </div>
    </WorkstationLayout>
  );
}
