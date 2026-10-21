"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_AOI_POINTS, polygonAreaKm2, type LatLon } from "@/lib/aoiPolygon";
import { useTranslation } from "@/lib/i18n/LanguageContext";

/**
 * Draw an area of interest by clicking points on a map (no drawing library needed): each click
 * adds a corner, the outline closes automatically, and "Use this area" hands the points back.
 * The calendar then counts every 0.25° grid cell the outline touches, like an admin area.
 */
export default function AoiDrawMap({
  initial,
  center = [-1.5, 115],
  zoom = 5,
  onUse,
  onCancel,
}: {
  initial?: LatLon[] | null;
  center?: LatLon;
  zoom?: number;
  onUse: (points: LatLon[]) => void;
  onCancel: () => void;
}) {
  const { tr, language } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const [points, setPoints] = useState<LatLon[]>(initial ?? []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    import("leaflet").then((L) => {
      if (!mounted || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { center, zoom, attributionControl: false, doubleClickZoom: false });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18 }).addTo(map);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 18,
        pane: "overlayPane",
      }).addTo(map);
      L.control.attribution({ prefix: "© Esri" }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      map.on("click", (event) => {
        setPoints((current) => (current.length >= MAX_AOI_POINTS ? current : [...current, [event.latlng.lat, event.latlng.lng]]));
      });
      if (initial && initial.length >= 3) map.fitBounds(L.latLngBounds(initial.map(([lat, lon]) => L.latLng(lat, lon))), { padding: [30, 30] });
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once; later prop changes don't re-create it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw the outline whenever the points change.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    const latlngs = points.map(([lat, lon]) => L.latLng(lat, lon));
    if (latlngs.length >= 3) L.polygon(latlngs, { color: "#f59e0b", weight: 2, fillOpacity: 0.15 }).addTo(layer);
    else if (latlngs.length === 2) L.polyline(latlngs, { color: "#f59e0b", weight: 2 }).addTo(layer);
    latlngs.forEach((latlng) => L.circleMarker(latlng, { radius: 4, color: "#ffffff", weight: 2, fillColor: "#f59e0b", fillOpacity: 1 }).addTo(layer));
  }, [points, ready]);

  const area = polygonAreaKm2(points);
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-600">
        {tr(
          "Klik di peta untuk menambah titik sudut area (minimal 3). Garisnya menutup sendiri. Perbesar peta dulu kalau areanya kecil.",
          "Click the map to add corner points (at least 3). The outline closes by itself. Zoom in first for a small area."
        )}
      </p>
      <div ref={containerRef} className="h-[420px] w-full overflow-hidden rounded-lg border border-gray-200" style={{ cursor: "crosshair" }} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-gray-600">
          {points.length} {tr("titik", "points")}
          {points.length >= 3 && ` · ±${area.toLocaleString(language === "en" ? "en-US" : "id-ID", { maximumFractionDigits: 0 })} km²`}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPoints((current) => current.slice(0, -1))}
            disabled={points.length === 0}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-40"
          >
            {tr("Hapus titik terakhir", "Undo last point")}
          </button>
          <button
            type="button"
            onClick={() => setPoints([])}
            disabled={points.length === 0}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-40"
          >
            {tr("Ulangi", "Start over")}
          </button>
          <button type="button" onClick={onCancel} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">
            {tr("Batal", "Cancel")}
          </button>
          <button
            type="button"
            onClick={() => onUse(points)}
            disabled={points.length < 3}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {tr("Pakai area ini", "Use this area")}
          </button>
        </div>
      </div>
    </div>
  );
}
