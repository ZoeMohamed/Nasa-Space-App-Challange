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
  HIGH: "#F54E00",
  MEDIUM: "#F0A000",
  LOW: "#6AA84F",
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
    // Leaflet must only run in browser
    if (typeof window === "undefined") return;

    let isMounted = true;

    import("leaflet").then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      // Prevent "Map container is already initialized" error in React Strict Mode
      // @ts-expect-error - Leaflet attaches this internal property to the DOM element
      if (containerRef.current._leaflet_id) return;

      // Fix default icon path issue with webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // Earthy tile layer matching original design
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Esri",
          opacity: 0.85,
        }
      ).addTo(map);

      // Attribution (custom, small)
      L.control
        .attribution({ prefix: "FIRESIGHT | © Esri | NASA FIRMS" })
        .addTo(map);

      // Custom pulsing circle markers
      markers.forEach((m) => {
        const color = SEVERITY_COLOR[m.severity] ?? "#857461";
        const radius = m.severity === "HIGH" ? 18 : m.severity === "MEDIUM" ? 12 : 8;

        // Outer pulsing circle
        L.circleMarker([m.lat, m.lng], {
          radius: radius + 8,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.15,
          className: "animate-ping",
        }).addTo(map);

        // Inner solid circle
        const inner = L.circleMarker([m.lat, m.lng], {
          radius,
          color: "#fff",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9,
        }).addTo(map);

        // Popup
        const popupHtml = `
          <div style="font-family:'JetBrains Mono',monospace;width:280px;">
            <div style="background:#f4f4e7;border-bottom:1px solid #d7c3ad;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
                <span style="font-size:10px;font-weight:700;color:#1a1c15;">FIRE ACTIVITY ${m.id}</span>
              </div>
              <span style="font-size:9px;background:${color}22;border:1px solid ${color};color:${color};padding:1px 6px;border-radius:3px;font-weight:700;">
                ${m.severity}
              </span>
            </div>
            <div style="padding:10px 12px;background:#fff;display:flex;flex-direction:column;gap:6px;">
              <div>
                <div style="font-size:9px;color:#857461;text-transform:uppercase;">SECTOR</div>
                <div style="font-size:12px;font-weight:700;color:#1a1c15;">${m.label}</div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10px;">
                <span style="background:#f4f4e7;padding:2px 6px;border-radius:3px;">FRP: ${m.frp} MW</span>
                <span style="color:#0d70e9;font-weight:700;">${m.id === "FA-001" ? "94%" : m.id === "FA-002" ? "89%" : "78%"} CONF</span>
              </div>
              <div style="background:#f4f4e7;padding:6px 8px;border-radius:3px;font-size:10px;display:flex;justify-content:space-between;">
                <span>LAT: ${m.lat.toFixed(4)}°</span>
                <span>LNG: ${m.lng.toFixed(4)}°</span>
              </div>
            </div>
            <div style="padding:8px 12px;background:#f4f4e7;border-top:1px solid #d7c3ad;display:flex;gap:6px;">
              <a href="/activity/${m.id}" style="flex:1;background:#0d70e9;color:#fff;text-align:center;padding:6px;border-radius:3px;font-size:10px;font-weight:700;text-decoration:none;">
                INSPECT →
              </a>
              <a href="/intelligence/${m.id}" style="background:#f0a000;color:#5e3c00;text-align:center;padding:6px 10px;border-radius:3px;font-size:10px;font-weight:700;text-decoration:none;border:1px solid #C78500;">
                AI DOSSIER
              </a>
            </div>
          </div>`;

        inner.bindPopup(popupHtml, {
          maxWidth: 300,
          className: "firesight-popup",
        });

        // Tooltip label
        inner.bindTooltip(
          `<span style="font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700">${m.id} [${m.frp}MW]</span>`,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative ${className}`}>
      {!ready && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-[#EDE8D5] border border-outline-variant">
          <div className="font-mono text-xs text-on-surface-variant animate-pulse">
            LOADING SATELLITE MAP…
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full"
      />

      {/* Legend overlay */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 border border-[#BFC1B7] p-2 rounded shadow-sm font-mono text-[10px] space-y-1 pointer-events-none">
        <div className="font-bold border-b border-outline-variant pb-0.5">
          MAP LAYERS
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#F54E00]" /> HIGH (&gt;70MW)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#F0A000]" /> MEDIUM (25–70MW)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#6AA84F]" /> LOW (&lt;25MW)
        </div>
      </div>
    </div>
  );
}
