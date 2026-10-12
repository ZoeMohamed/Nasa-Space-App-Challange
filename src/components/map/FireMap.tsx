"use client";

import { useEffect, useRef, useState } from "react";
import type { HotspotMarker } from "@/types";

interface FireMapProps {
  markers: HotspotMarker[];
  center?: [number, number];
  zoom?: number;
  className?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  HIGH: "#dc2626", // red-600
  MEDIUM: "#fb923c", // orange-400
  LOW: "#facc15", // yellow-400
};

export default function FireMap({
  markers,
  center = [-1.5, 108],
  zoom = 6,
  className = "h-[420px] w-full",
}: FireMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const centerLat = center[0];
  const centerLng = center[1];

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;

    import("leaflet").then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [centerLat, centerLng],
        zoom,
        zoomControl: true,
        attributionControl: false,
        preferCanvas: true,
      });

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Esri",
          opacity: 0.9,
        }
      ).addTo(map);

      L.control
        .attribution({ prefix: "FireWatch | © Esri | NASA FIRMS" })
        .addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);

      mapRef.current = map;
      setReady(true);
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
      }
    };
  }, [centerLat, centerLng, zoom]);

  useEffect(() => {
    if (!ready || !markerLayerRef.current) return;

    let isMounted = true;

    import("leaflet").then((L) => {
      if (!isMounted || !markerLayerRef.current) return;

      const layer = markerLayerRef.current;
      layer.clearLayers();

      for (const marker of markers) {
        const color = SEVERITY_COLOR[marker.severity] ?? "#9ca3af";
        const radius = marker.severity === "HIGH" ? 7 : marker.severity === "MEDIUM" ? 5 : 4;
        const point = L.circleMarker([marker.lat, marker.lng], {
          radius,
          color: "#fff",
          weight: 1,
          fillColor: color,
          fillOpacity: 0.85,
        }).addTo(layer);

        const label = escapeHtml(marker.label);
        const satellite = escapeHtml(marker.satellite ?? "Unknown");
        const confidence = escapeHtml(marker.confidenceLabel ?? "High");
        const source = escapeHtml(marker.source ?? marker.sensor ?? "NASA FIRMS");
        const priority = escapeHtml(marker.priorityTier ?? "Unknown");
        const matchStatus = escapeHtml((marker.matchStatus ?? "UNMATCHED").replaceAll("_", " "));
        const observedAt = marker.acquiredAt
          ? new Date(marker.acquiredAt).toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "UTC",
            }) + " UTC"
          : "Unknown";

        point.bindPopup(
          `<div style="font-family:Inter,sans-serif;width:240px">
            <div style="border-bottom:1px solid #f3f4f6;padding:12px;display:flex;align-items:center;gap:6px">
              <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>
              <strong style="font-size:12px;color:#111827">${label}</strong>
            </div>
            <div style="padding:12px;display:grid;grid-template-columns:1fr auto;gap:8px;font-size:11px">
              <span style="color:#6b7280">Power</span><strong>${marker.frp.toFixed(1)} MW</strong>
              <span style="color:#6b7280">Confidence</span><strong>${confidence}</strong>
              <span style="color:#6b7280">Satellite</span><strong>${satellite}</strong>
              <span style="color:#6b7280">Source</span><strong>${source}</strong>
              <span style="color:#6b7280">Python priority</span><strong>${priority}${marker.priorityScore === undefined ? "" : ` (${marker.priorityScore.toFixed(2)})`}</strong>
              <span style="color:#6b7280">Sensor match</span><strong>${matchStatus}</strong>
              <span style="color:#6b7280">Observed</span><strong>${escapeHtml(observedAt)}</strong>
              <span style="color:#6b7280">Coordinates</span><strong>${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}</strong>
            </div>
          </div>`,
          { maxWidth: 280, className: "firesight-popup" }
        );

        point.bindTooltip(label, {
          direction: "top",
          className: "firesight-tooltip",
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [markers, ready]);

  return (
    <div className={`relative ${className}`}>
      {!ready && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-blue-50 border border-gray-200">
          <div className="font-medium text-sm text-gray-500 animate-pulse">
            LOADING MAP ENGINE…
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full z-[100]"
      />

      <div className="absolute bottom-4 left-4 z-[1000] bg-white border border-gray-200 p-3 rounded-lg shadow-md text-[11px] font-medium space-y-2 pointer-events-none">
        <div className="font-bold text-gray-900 border-b border-gray-100 pb-1 mb-2">
          Severity Legend
        </div>
        <div className="flex items-center gap-2 text-gray-700">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600" /> High (&gt;70MW)
        </div>
        <div className="flex items-center gap-2 text-gray-700">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-400" /> Medium (25–70MW)
        </div>
        <div className="flex items-center gap-2 text-gray-700">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Low (&lt;25MW)
        </div>
      </div>
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character
  );
}
