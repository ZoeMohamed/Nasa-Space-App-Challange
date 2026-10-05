"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;

    import("leaflet").then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      if ((containerRef.current as any)._leaflet_id) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current, {
        center,
        zoom,
        zoomControl: true,
        attributionControl: false,
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

      markers.forEach((m) => {
        const color = SEVERITY_COLOR[m.severity] ?? "#9ca3af";
        const radius = m.severity === "HIGH" ? 14 : m.severity === "MEDIUM" ? 10 : 6;

        L.circleMarker([m.lat, m.lng], {
          radius: radius + 8,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.15,
          className: "animate-ping",
        }).addTo(map);

        const inner = L.circleMarker([m.lat, m.lng], {
          radius,
          color: "#fff",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9,
        }).addTo(map);

        const popupHtml = `
          <div style="font-family:'Inter',sans-serif;width:240px;">
            <div style="border-bottom:1px solid #f3f4f6;padding:12px;display:flex;align-items:center;justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
                <span style="font-size:12px;font-weight:700;color:#111827;">${m.label}</span>
              </div>
            </div>
            <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
              <div style="display:flex;justify-content:space-between;font-size:11px;">
                <span style="color:#6b7280;">Power</span>
                <span style="font-weight:600;color:#111827;">${m.frp} MW</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11px;">
                <span style="color:#6b7280;">Confidence</span>
                <span style="font-weight:600;color:#111827;">${m.id === "FA-001" ? "94%" : m.id === "FA-002" ? "89%" : "78%"}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11px;">
                <span style="color:#6b7280;">Coordinates</span>
                <span style="font-weight:600;color:#111827;">${m.lat.toFixed(2)}, ${m.lng.toFixed(2)}</span>
              </div>
            </div>
            <div style="padding:12px;border-top:1px solid #f3f4f6;display:flex;gap:8px;">
              <a href="/activity/${m.id}" style="flex:1;background:#2563eb;color:#fff;text-align:center;padding:6px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">
                Inspect
              </a>
            </div>
          </div>`;

        inner.bindPopup(popupHtml, {
          maxWidth: 280,
          className: "firesight-popup",
        });

        inner.bindTooltip(
          `<span style="font-family:'Inter',sans-serif;font-size:11px;font-weight:600">${m.label}</span>`,
          { direction: "top", className: "firesight-tooltip" }
        );
      });

      mapRef.current = map;
      setReady(true);
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

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
