"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup, TileLayer } from "leaflet";
import { Crosshair, Layers, Minus, Plus, Satellite, Map as MapIcon, Check, X } from "lucide-react";
import type { CommunityReport, HotspotMarker } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";

/** Marker colour by FRP class (backend severity: HIGH > 70 MW, MEDIUM 25–70 MW, LOW < 25 MW). */
export const FRP_COLOR: Record<HotspotMarker["severity"], string> = {
  HIGH: "#dc2626",
  MEDIUM: "#f5b301",
  LOW: "#22c55e",
};

export type SourceLayer = "harmonized" | "modis" | "viirs" | "reports";

export interface MapFocus {
  lat: number;
  lon: number;
  zoom: number;
  /** Changes on every request so the same point can be focused twice. */
  nonce: number;
}

/** Which toggleable layer a satellite marker belongs to. MATCHED = MODIS and VIIRS saw the same fire. */
export function sourceLayerOf(marker: HotspotMarker): Exclude<SourceLayer, "reports"> {
  if (marker.matchStatus === "MATCHED") return "harmonized";
  if (marker.matchStatus === "MODIS_ONLY") return "modis";
  if (marker.matchStatus === "VIIRS_ONLY") return "viirs";
  return marker.sensor === "MODIS" ? "modis" : "viirs";
}

interface CitizenMapProps {
  markers: HotspotMarker[];
  reports: CommunityReport[];
  layers: Record<SourceLayer, boolean>;
  onToggleLayer: (layer: SourceLayer) => void;
  layerCounts: Record<SourceLayer, number>;
  selectedId: string | null;
  onSelectMarker: (marker: HotspotMarker | null) => void;
  onSelectReport?: (report: CommunityReport) => void;
  userLocation: { lat: number; lon: number; radiusKm: number } | null;
  onLocate: () => void;
  focus: MapFocus | null;
}

const BASEMAPS = {
  satellite: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  ],
  map: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"],
} as const;

const INDONESIA_CENTER: [number, number] = [-2.3, 117.5];

export default function CitizenMap({
  markers,
  reports,
  layers,
  onToggleLayer,
  layerCounts,
  selectedId,
  onSelectMarker,
  onSelectReport,
  userLocation,
  onLocate,
  focus,
}: CitizenMapProps) {
  const { tr } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const baseLayersRef = useRef<TileLayer[]>([]);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const reportLayerRef = useRef<LayerGroup | null>(null);
  const userLayerRef = useRef<LayerGroup | null>(null);
  const selectLayerRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState<keyof typeof BASEMAPS>("satellite");
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  // Keep the latest callbacks without re-binding every marker on each render.
  const onSelectMarkerRef = useRef(onSelectMarker);
  const onSelectReportRef = useRef(onSelectReport);
  useEffect(() => {
    onSelectMarkerRef.current = onSelectMarker;
    onSelectReportRef.current = onSelectReport;
  });

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: INDONESIA_CENTER,
        zoom: 5,
        minZoom: 4,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      });
      L.control.attribution({ position: "bottomright", prefix: "© Esri · NASA FIRMS" }).addTo(map);
      userLayerRef.current = L.layerGroup().addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      reportLayerRef.current = L.layerGroup().addTo(map);
      selectLayerRef.current = L.layerGroup().addTo(map);
      map.on("click", () => onSelectMarkerRef.current(null));
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Basemap
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    import("leaflet").then((L) => {
      baseLayersRef.current.forEach((layer) => layer.remove());
      baseLayersRef.current = BASEMAPS[basemap].map((url) => L.tileLayer(url, { maxZoom: 18 }).addTo(map));
      baseLayersRef.current.forEach((layer) => layer.bringToBack());
    });
  }, [ready, basemap]);

  const visibleMarkers = useMemo(
    () =>
      markers
        .filter((m) => layers[sourceLayerOf(m)])
        // Draw low FRP first so high-intensity points stay on top.
        .sort((a, b) => a.frp - b.frp),
    [markers, layers]
  );

  // Satellite markers
  useEffect(() => {
    const group = markerLayerRef.current;
    if (!ready || !group) return;
    import("leaflet").then((L) => {
      group.clearLayers();
      for (const marker of visibleMarkers) {
        const circle = L.circleMarker([marker.lat, marker.lng], {
          radius: marker.severity === "HIGH" ? 8 : 7,
          color: "#ffffff",
          weight: 1,
          opacity: 0.9,
          fillColor: FRP_COLOR[marker.severity],
          fillOpacity: 0.92,
        });
        circle.on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          onSelectMarkerRef.current(marker);
        });
        circle.addTo(group);
      }
    });
  }, [ready, visibleMarkers]);

  // Officer-verified citizen reports (public shape: rounded ~1 km)
  useEffect(() => {
    const group = reportLayerRef.current;
    if (!ready || !group) return;
    import("leaflet").then((L) => {
      group.clearLayers();
      if (!layers.reports) return;
      for (const report of reports) {
        const pin = L.circleMarker([report.lat, report.lon], {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#2563eb",
          fillOpacity: 0.95,
        });
        pin.bindTooltip(tr("Laporan warga terverifikasi", "Verified citizen report"), { direction: "top" });
        pin.on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          onSelectReportRef.current?.(report);
        });
        pin.addTo(group);
      }
    });
  }, [ready, reports, layers.reports, tr]);

  // User location + status radius
  useEffect(() => {
    const group = userLayerRef.current;
    if (!ready || !group) return;
    import("leaflet").then((L) => {
      group.clearLayers();
      if (!userLocation) return;
      L.circle([userLocation.lat, userLocation.lon], {
        radius: userLocation.radiusKm * 1000,
        color: "#ffffff",
        weight: 1.5,
        dashArray: "6 6",
        fillColor: "#2563eb",
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(group);
      L.marker([userLocation.lat, userLocation.lon], {
        interactive: false,
        zIndexOffset: 800,
        icon: L.divIcon({
          className: "",
          html: '<div class="agnibhumi-user-beacon"><span class="beacon-pulse"></span><span class="beacon-core"></span></div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(group);
    });
  }, [ready, userLocation]);

  // Selected marker highlight
  useEffect(() => {
    const group = selectLayerRef.current;
    if (!ready || !group) return;
    import("leaflet").then((L) => {
      group.clearLayers();
      const selected = selectedId ? markers.find((m) => m.id === selectedId) : null;
      if (!selected) return;
      L.circleMarker([selected.lat, selected.lng], {
        radius: 13,
        color: "#ffffff",
        weight: 3,
        fill: false,
        interactive: false,
      }).addTo(group);
    });
  }, [ready, selectedId, markers]);

  // External focus requests (area card, hotspot selection, "my location")
  useEffect(() => {
    if (!ready || !focus || !mapRef.current) return;
    mapRef.current.flyTo([focus.lat, focus.lon], focus.zoom, { duration: 0.8 });
  }, [ready, focus]);

  const layerOptions: { id: SourceLayer; label: string; hint: string; swatch: string }[] = [
    {
      id: "harmonized",
      label: tr("Harmonisasi MODIS + VIIRS", "Harmonized MODIS + VIIRS"),
      hint: tr("Titik yang dilihat kedua sensor", "Points seen by both sensors"),
      swatch: "bg-gradient-to-r from-amber-400 to-red-600",
    },
    { id: "modis", label: tr("Hanya MODIS", "MODIS only"), hint: "Terra / Aqua", swatch: "bg-amber-400" },
    { id: "viirs", label: tr("Hanya VIIRS", "VIIRS only"), hint: "S-NPP / NOAA-20 / NOAA-21", swatch: "bg-orange-500" },
    {
      id: "reports",
      label: tr("Laporan warga terverifikasi", "Verified citizen reports"),
      hint: tr("Lokasi dibulatkan ±1 km", "Location rounded ±1 km"),
      swatch: "bg-blue-600",
    },
  ];

  const controlButton =
    "flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-800 shadow-md shadow-black/20 transition hover:bg-slate-50 active:scale-95";

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full bg-[#0b2a33]" />

      {/* Map controls */}
      <div className="absolute left-4 md:left-8 bottom-[11.5rem] md:bottom-40 z-[500] flex flex-col gap-3">
        <button type="button" onClick={onLocate} className={controlButton} aria-label={tr("Lokasi saya", "My location")}>
          <Crosshair className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => mapRef.current?.zoomIn()} className={controlButton} aria-label={tr("Perbesar", "Zoom in")}>
          <Plus className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => mapRef.current?.zoomOut()} className={controlButton} aria-label={tr("Perkecil", "Zoom out")}>
          <Minus className="h-5 w-5" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setLayerMenuOpen((open) => !open)}
            className={`${controlButton} ${layerMenuOpen ? "ring-2 ring-emerald-500" : ""}`}
            aria-label={tr("Lapisan data", "Data layers")}
            aria-expanded={layerMenuOpen}
          >
            <Layers className="h-5 w-5" />
          </button>
          {layerMenuOpen && (
            <div className="absolute left-14 bottom-0 w-72 rounded-2xl bg-white p-4 shadow-xl shadow-black/25">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">{tr("Lapisan data", "Data layers")}</p>
                <button
                  type="button"
                  onClick={() => setLayerMenuOpen(false)}
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                  aria-label={tr("Tutup", "Close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="mt-3 space-y-1.5">
                {layerOptions.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => onToggleLayer(option.id)}
                      aria-pressed={layers[option.id]}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          layers[option.id] ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white"
                        }`}
                      >
                        {layers[option.id] && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${option.swatch}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-slate-800">{option.label}</span>
                        <span className="block text-[11px] text-slate-500">{option.hint}</span>
                      </span>
                      <span className="text-[11px] font-semibold tabular-nums text-slate-500">{layerCounts[option.id]}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500">
                {tr(
                  "Data NASA FIRMS 24 jam terakhir, dicocokkan antar-sensor oleh pipeline AGNIBHŪMI.",
                  "NASA FIRMS data from the last 24 hours, cross-matched between sensors by the AGNIBHŪMI pipeline."
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* FRP legend */}
      <div className="absolute left-4 md:left-8 bottom-24 md:bottom-8 z-[500] rounded-2xl bg-white px-4 py-3 md:px-5 md:py-4 shadow-lg shadow-black/20">
        <p className="text-sm md:text-base font-semibold text-slate-900">{tr("Intensitas Panas (FRP)", "Heat Intensity (FRP)")}</p>
        <div className="mt-2 flex items-center gap-4 md:gap-8">
          {(
            [
              ["HIGH", tr("Tinggi", "High")],
              ["MEDIUM", tr("Sedang", "Medium")],
              ["LOW", tr("Rendah", "Low")],
            ] as const
          ).map(([severity, label]) => (
            <span key={severity} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: FRP_COLOR[severity] }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Basemap switch */}
      <button
        type="button"
        onClick={() => setBasemap((b) => (b === "satellite" ? "map" : "satellite"))}
        className="absolute right-4 md:right-0 bottom-24 md:bottom-6 z-[500] flex flex-col items-center gap-1 rounded-xl md:rounded-r-none border border-white/20 bg-[#0d2f3a]/90 px-4 py-2.5 text-[11px] font-bold tracking-widest text-sky-200 shadow-lg backdrop-blur transition hover:bg-[#0d2f3a]"
        aria-label={tr("Ganti peta dasar", "Switch basemap")}
      >
        {basemap === "satellite" ? <Satellite className="h-5 w-5" /> : <MapIcon className="h-5 w-5" />}
        {basemap === "satellite" ? tr("SATELIT", "SATELLITE") : tr("PETA", "MAP")}
      </button>
    </div>
  );
}
