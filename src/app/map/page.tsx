"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import type { HotspotApiResponse, HotspotMarker } from "@/types";

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
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
type Layer = (typeof LAYERS)[number];

async function requestHotspots(signal?: AbortSignal) {
  const response = await fetch("/api/hotspots", { signal, cache: "no-store" });
  const body = (await response.json()) as HotspotApiResponse & { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to load NASA FIRMS data.");
  }

  return body;
}

function requestErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load NASA FIRMS data.";
}

export default function MapExplorerPage() {
  const router = useRouter();
  const [activeLayer, setActiveLayer] = useState<Layer>("HARMONIZED");
  const [markers, setMarkers] = useState<HotspotMarker[]>([]);
  const [meta, setMeta] = useState<HotspotApiResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = () => {
      requestHotspots(controller.signal)
        .then((body) => {
          setMarkers(body.markers);
          setMeta(body.meta);
          setError(null);
        })
        .catch((requestError: unknown) => {
          if (requestError instanceof DOMException && requestError.name === "AbortError") return;
          setError(requestErrorMessage(requestError));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    };

    load();
    const interval = window.setInterval(load, REFRESH_INTERVAL_MS);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  async function refreshHotspots() {
    setLoading(true);
    setError(null);

    try {
      const body = await requestHotspots();
      setMarkers(body.markers);
      setMeta(body.meta);
    } catch (requestError) {
      setError(requestErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  const visibleMarkers = useMemo(() => {
    if (activeLayer === "HARMONIZED") return markers;
    return markers.filter((marker) => marker.sensor === activeLayer);
  }, [activeLayer, markers]);

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
              Live NASA FIRMS observations cleaned and prioritized by the Python fire pipeline.
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
          <div className="flex items-center gap-3 flex-wrap">
            <span className="h-9 px-4 inline-flex items-center bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm">
              Last 24 Hours
            </span>
            <span className="h-9 px-4 inline-flex items-center bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm">
              Region: Indonesia
            </span>
            <span className="h-9 px-4 inline-flex items-center bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm">
              Confidence: High
            </span>
          </div>
          <button
            onClick={() => router.push("/activities")}
            className="h-9 px-4 bg-white border border-gray-200 rounded-lg text-sm font-medium text-blue-600 shadow-sm hover:bg-gray-50"
          >
            Table View
          </button>
        </div>

        <div className="min-h-6 flex items-center justify-between gap-3 text-xs" aria-live="polite">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                error ? "bg-red-500" : loading ? "bg-amber-400 animate-pulse" : "bg-emerald-500"
              }`}
            />
            <span className={error ? "text-red-600" : "text-gray-500"}>
              {error
                ? error
                : loading
                  ? "NASA live → Python processing…"
                  : `${visibleMarkers.length.toLocaleString()} processed ${activeLayer === "HARMONIZED" ? "combined" : activeLayer} observations`}
            </span>
            {!loading && !error && (
              <span className={meta?.degraded ? "text-amber-600" : "text-gray-400"}>
                • {meta?.sources.filter((source) => source.available).length ?? 0}/4 NASA FIRMS feeds live
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {meta && (
              <span className="hidden sm:inline text-gray-400">
                Python: {meta.processing.steps.join(" → ")} • {meta.processing.areasAnalyzed.toLocaleString()} areas • updated {new Date(meta.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              type="button"
              onClick={() => void refreshHotspots()}
              disabled={loading}
              className="font-semibold text-blue-600 hover:text-blue-700 disabled:text-gray-400"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden relative">
          <FireMap
            markers={visibleMarkers}
            center={[-2.2, 118]}
            zoom={5}
            className="h-full w-full"
          />
        </div>

      </div>
    </WorkstationLayout>
  );
}
