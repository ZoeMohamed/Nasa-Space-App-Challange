"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { HotspotMarker } from "@/types";
import { formatAdminFull } from "@/lib/adminRegion";
import { useTranslation, pick, type Language } from "@/lib/i18n/LanguageContext";

/** A community-submitted field report pin, rendered alongside satellite markers. */
export interface CommunityReportPin {
  id: string;
  lat: number;
  lng: number;
  status: string;
  description: string;
  createdAt?: string;
}

export interface UserLocationPin {
  lat: number;
  lng: number;
  label?: string;
  radiusKm?: number;
}

export type SelectedMapEntity =
  | { kind: "hotspot"; marker: HotspotMarker; groupMembers?: HotspotMarker[] }
  | { kind: "report"; report: CommunityReportPin }
  | { kind: "user"; location: UserLocationPin };

interface FireMapProps {
  markers: HotspotMarker[];
  center?: [number, number];
  zoom?: number;
  className?: string;
  showSeverityLegend?: boolean;
  showSymbolLegend?: boolean;
  /** Called when a marker is selected, or with null when deselected/cleared. */
  onMarkerSelect?: (marker: HotspotMarker | null) => void;
  /** Called when a community-report pin is selected, or with null when deselected/cleared. */
  onReportSelect?: (report: CommunityReportPin | null) => void;
  /** Optional community field reports, rendered as person-icon pins. */
  reports?: CommunityReportPin[];
  /** Optional user location pin, rendered as a distinct blue pulsing circle. */
  userLocation?: UserLocationPin;
  /** Controls if the built-in non-intrusive detail panel/bottom sheet renders. Default true. */
  showDetailPanel?: boolean;
  /** Optional action link generator for the detail panel. */
  actionHref?: (marker: HotspotMarker) => string;
  actionLabel?: string;
  /** Enable built-in full-screen mode toggle. */
  allowFullScreenToggle?: boolean;
  /** Fit the view to all markers once, right after they first load — for a small focused map
   * (e.g. a single grid cell's detections) where a fixed center/zoom can leave markers tiny or
   * off-view. Only fires once per mount, not on every poll, so it doesn't fight manual panning. */
  autoFitOnLoad?: boolean;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  HIGH: "#dc2626", // red-600
  MEDIUM: "#fb923c", // orange-400
  LOW: "#facc15", // yellow-400
};

const SEVERITY_LABEL: Record<string, readonly [string, string]> = {
  HIGH: ["Tinggi (>70 MW)", "High (>70 MW)"],
  MEDIUM: ["Sedang (25–70 MW)", "Medium (25–70 MW)"],
  LOW: ["Rendah (<25 MW)", "Low (<25 MW)"],
};

const REPORT_STATUS_TEXT: Record<string, readonly [string, string]> = {
  submitted: ["Terkirim", "Submitted"],
  under_review: ["Sedang ditinjau", "Under review"],
  satellite_matched: ["Cocok dengan satelit", "Satellite match"],
  verified: ["Terverifikasi petugas", "Verified by officer"],
  rejected: ["Ditolak", "Rejected"],
};

function reportStatusText(status: string, language: Language): string {
  const pair = REPORT_STATUS_TEXT[status];
  return pair ? pick(language, ...pair) : status;
}

/** Backend labels read "<sensor> active fire"; localize that one known pattern. */
function markerLabel(marker: HotspotMarker, language: Language): string {
  const match = /^(.*) active fire$/.exec(marker.label);
  if (!match || language === "en") return marker.label;
  return `Titik api ${match[1]}`;
}

const REPORT_PIN_COLOR = "#2563eb"; // blue-600

// 70-minute window for pairing MODIS and VIIRS detections
const MATCH_PAIR_WINDOW_MS = 70 * 60 * 1000;

interface FirePairGroup {
  key: string;
  lat: number;
  lng: number;
  severity: HotspotMarker["severity"];
  members: HotspotMarker[];
}

function highestSeverity(members: HotspotMarker[]): HotspotMarker["severity"] {
  if (members.some((member) => member.severity === "HIGH")) return "HIGH";
  if (members.some((member) => member.severity === "MEDIUM")) return "MEDIUM";
  return "LOW";
}

function computeDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function groupMatchedPairs(markers: HotspotMarker[]): {
  fireGroups: FirePairGroup[];
  singles: HotspotMarker[];
} {
  const matched: HotspotMarker[] = [];
  const singles: HotspotMarker[] = [];
  for (const marker of markers) {
    if (marker.matchStatus === "MATCHED") matched.push(marker);
    else singles.push(marker);
  }

  const buckets = new Map<string, HotspotMarker[]>();
  for (const marker of matched) {
    const key = marker.areaId ?? "unknown-area";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(marker);
    else buckets.set(key, [marker]);
  }

  const fireGroups: FirePairGroup[] = [];
  for (const [areaKey, bucket] of buckets) {
    const sorted = [...bucket].sort(
      (a, b) => Date.parse(a.acquiredAt ?? "") - Date.parse(b.acquiredAt ?? "")
    );
    const used = new Set<string>();

    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      if (used.has(a.id)) continue;
      used.add(a.id);

      let partnerIndex = -1;
      let partnerDiff = Infinity;
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (used.has(b.id)) continue;
        const diff = Math.abs(Date.parse(b.acquiredAt ?? "") - Date.parse(a.acquiredAt ?? ""));
        if (diff > MATCH_PAIR_WINDOW_MS) break;
        if (b.sensor && a.sensor && b.sensor !== a.sensor && diff < partnerDiff) {
          partnerDiff = diff;
          partnerIndex = j;
        }
      }
      if (partnerIndex === -1) {
        for (let j = i + 1; j < sorted.length; j++) {
          const b = sorted[j];
          if (used.has(b.id)) continue;
          const diff = Math.abs(Date.parse(b.acquiredAt ?? "") - Date.parse(a.acquiredAt ?? ""));
          if (diff > MATCH_PAIR_WINDOW_MS) break;
          partnerIndex = j;
          break;
        }
      }

      const members = [a];
      if (partnerIndex !== -1) {
        used.add(sorted[partnerIndex].id);
        members.push(sorted[partnerIndex]);
      }

      const lat = members.reduce((sum, member) => sum + member.lat, 0) / members.length;
      const lng = members.reduce((sum, member) => sum + member.lng, 0) / members.length;

      fireGroups.push({
        key: `${areaKey}-${members.map((member) => member.id).join("+")}`,
        lat,
        lng,
        severity: highestSeverity(members),
        members,
      });
    }
  }

  return { fireGroups, singles };
}

type SingleShapeKind = "star" | "hexagon" | "triangle";

function singleShapeKind(marker: HotspotMarker): SingleShapeKind {
  if (marker.matchStatus === "MODIS_ONLY") return "star";
  if (marker.matchStatus === "VIIRS_ONLY") return "hexagon";
  return "triangle";
}

function sizeForSeverity(severity: HotspotMarker["severity"]) {
  return severity === "HIGH" ? 13 : severity === "MEDIUM" ? 11 : 9;
}

/** SVG polygon points for a pointy-top regular hexagon inscribed in a size×size box. */
function hexagonPoints(size: number): string {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.95;
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

/** SVG polygon points for a 5-point star inscribed in a size×size box. */
function starPoints(size: number): string {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = (size / 2) * 0.98;
  const innerR = outerR * 0.42;
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 180) * (36 * i - 90);
    const r = i % 2 === 0 ? outerR : innerR;
    points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

function formatAcquiredAt(acquiredAt: string | undefined, language: Language) {
  if (!acquiredAt) return pick(language, "Waktu tidak tercatat", "Time not recorded");
  const parsed = new Date(acquiredAt);
  if (Number.isNaN(parsed.getTime())) return pick(language, "Waktu tidak tercatat", "Time not recorded");
  const locale = language === "en" ? "en-GB" : "id-ID";
  const date = parsed.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const time = parsed.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${date} · ${time} UTC`;
}

export default function FireMap({
  markers,
  center = [-1.5, 108],
  zoom = 6,
  className = "h-[420px] w-full",
  showSeverityLegend = true,
  showSymbolLegend = true,
  onMarkerSelect,
  onReportSelect,
  reports,
  userLocation,
  showDetailPanel = true,
  actionHref,
  actionLabel,
  allowFullScreenToggle = false,
  isFullScreen = false,
  onToggleFullScreen,
  autoFitOnLoad = false,
}: FireMapProps) {
  const { tr, language } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const highlightLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const userLocationLayerRef = useRef<import("leaflet").LayerGroup | null>(null);

  const [ready, setReady] = useState(false);
  const didAutoFitRef = useRef(false);
  const [selectedEntity, setSelectedEntity] = useState<SelectedMapEntity | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(false);
  // Open by default — users repeatedly couldn't tell circle (MODIS) from
  // square (VIIRS) from 🔥 (harmonized) because this legend used to be
  // hidden behind a click. Still collapsible via the same button.
  const [showLegendModal, setShowLegendModal] = useState(true);
  const hasAnyLowConfidenceMarker = useMemo(
    () => markers.some((m) => (m.confidenceTier ? m.confidenceTier === "low" : m.highConfidence === false)),
    [markers]
  );

  const centerLat = center[0];
  const centerLng = center[1];

  // Initialize Map
  useEffect(() => {
    if (typeof window === "undefined") return;
    let isMounted = true;

    import("leaflet").then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [centerLat, centerLng],
        zoom,
        zoomControl: false, // Custom styled zoom controls
        attributionControl: false,
        preferCanvas: true,
      });

      // Satellite imagery basemap (Esri World Imagery — free, no API key),
      // matching the look of reference systems like KLHK's SiPongi+.
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Esri",
          maxZoom: 18,
        }
      ).addTo(map);

      // Place-name/boundary labels over the imagery, same provider's reference overlay —
      // keeps province/city names legible on top of satellite photography.
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 18,
          pane: "overlayPane",
        }
      ).addTo(map);

      L.control
        .attribution({ prefix: "AGNIBHŪMI | © Esri | NASA FIRMS" })
        .addTo(map);

      // Dedicated layers
      userLocationLayerRef.current = L.layerGroup().addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      highlightLayerRef.current = L.layerGroup().addTo(map);

      // Empty map tap / click dismisses selection panel
      map.on("click", (e) => {
        // If clicking map canvas directly
        const target = e.originalEvent.target as HTMLElement | null;
        if (target && (target.classList.contains("leaflet-container") || target.tagName === "CANVAS" || target.id?.includes("map"))) {
          setSelectedEntity(null);
          onMarkerSelect?.(null);
          onReportSelect?.(null);
        }
      });

      mapRef.current = map;
      setReady(true);
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
        highlightLayerRef.current = null;
        userLocationLayerRef.current = null;
      }
    };
  }, [centerLat, centerLng, zoom, onMarkerSelect, onReportSelect]);

  // Render User Location
  useEffect(() => {
    if (!ready || !userLocationLayerRef.current || !mapRef.current) return;
    const layer = userLocationLayerRef.current;
    layer.clearLayers();

    if (!userLocation) return;

    import("leaflet").then((L) => {
      // 10 km Radius Circle if specified
      if (userLocation.radiusKm) {
        L.circle([userLocation.lat, userLocation.lng], {
          radius: userLocation.radiusKm * 1000,
          color: "#075640",
          weight: 1.5,
          dashArray: "5, 5",
          fillColor: "#10b981",
          fillOpacity: 0.05,
        }).addTo(layer);
      }

      // User location pulsing pin
      const icon = L.divIcon({
        className: "agnibhumi-user-location-icon",
        html: `<div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;opacity:0.4;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:relative;width:14px;height:14px;border-radius:50%;background:#2563eb;border:3px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>
        </div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const userMarker = L.marker([userLocation.lat, userLocation.lng], {
        icon,
        zIndexOffset: 500,
      }).addTo(layer);

      userMarker.bindTooltip(userLocation.label ?? pick(language, "Lokasi Anda", "Your location"), {
        direction: "top",
        className: "firesight-tooltip",
      });

      userMarker.on("click", () => {
        setSelectedEntity({ kind: "user", location: userLocation });
        setPanelExpanded(false);
      });
    });
  }, [ready, userLocation, language]);

  // Render Markers and Non-intrusive Selection Interactions (NO popup balloons!)
  useEffect(() => {
    if (!ready || !markerLayerRef.current) return;

    let isMounted = true;

    import("leaflet").then((L) => {
      if (!isMounted || !markerLayerRef.current) return;

      const layer = markerLayerRef.current;
      layer.clearLayers();

      const { fireGroups, singles } = groupMatchedPairs(markers);

      // 1. MATCHED pairs -> Harmonized fire marker 🔥
      for (const group of fireGroups) {
        // Fire emoji needs more room than the flat sensor shapes to stay legible,
        // so it gets its own (still small) scale — no background disc, just the
        // glyph with a drop-shadow for contrast against the satellite imagery.
        const size = sizeForSeverity(group.severity) + 8;
        const isSelected =
          selectedEntity?.kind === "hotspot" &&
          group.members.some((m) => m.id === selectedEntity.marker.id);

        const icon = L.divIcon({
          className: "firesight-fire-icon",
          html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${Math.round(
            size * 0.85
          )}px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55))${isSelected ? " drop-shadow(0 0 4px #ea580c)" : ""};">🔥</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        const point = L.marker([group.lat, group.lng], {
          icon,
          zIndexOffset: isSelected ? 1200 : 600,
        }).addTo(layer);

        // Hover tooltip ONLY - NOT a large intrusive popup!
        const label =
          group.members.length > 1
            ? pick(language, "🔥 Terharmonisasi (MODIS + VIIRS)", "🔥 Harmonized (MODIS + VIIRS)")
            : `🔥 ${markerLabel(group.members[0], language)}`;
        point.bindTooltip(label, {
          direction: "top",
          className: "firesight-tooltip",
        });

        // Click opens/updates bottom sheet or side panel cleanly
        point.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          const primary = group.members[0];
          setSelectedEntity({
            kind: "hotspot",
            marker: primary,
            groupMembers: group.members,
          });
          setPanelExpanded(false);
          onMarkerSelect?.(primary);
        });
      }

      // 2. Singles: MODIS (Star), VIIRS (Hexagon), Fallback (Triangle) — small,
      // flat SVG shapes with a thin outline for contrast, no solid icon background.
      for (const marker of singles) {
        const shape = singleShapeKind(marker);
        const color = SEVERITY_COLOR[marker.severity] ?? "#9ca3af";
        const isSelected = selectedEntity?.kind === "hotspot" && selectedEntity.marker.id === marker.id;
        const size = isSelected ? sizeForSeverity(marker.severity) + 4 : sizeForSeverity(marker.severity);
        const stroke = isSelected ? "#facc15" : "rgba(255,255,255,0.9)";
        const strokeWidth = isSelected ? 1.5 : 1;

        const shapeMarkup =
          shape === "star"
            ? `<polygon points="${starPoints(size)}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
            : shape === "hexagon"
              ? `<polygon points="${hexagonPoints(size)}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
              : `<polygon points="${size / 2},0 ${size},${size} 0,${size}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

        // FIRMS "low"-confidence detections (only present when the caller opted into
        // includeAllConfidence) are rendered faded + dashed, never visually identical to a
        // nominal/high detection. Nominal is a normal valid detection and is drawn normally.
        const isLowConfidence = marker.confidenceTier ? marker.confidenceTier === "low" : marker.highConfidence === false;
        const opacity = isLowConfidence ? 0.5 : 1;
        const dashed = isLowConfidence ? ` stroke-dasharray="2,1.5"` : "";

        const icon = L.divIcon({
          className: `firesight-${shape}-icon`,
          html: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="opacity:${opacity};filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));">${shapeMarkup.replace("/>", `${dashed}/>`)}</svg>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        const point = L.marker([marker.lat, marker.lng], {
          icon,
          zIndexOffset: isSelected ? 1200 : isLowConfidence ? 400 : 500,
        }).addTo(layer);

        point.bindTooltip(
          `${markerLabel(marker, language)} (${marker.sensor ?? pick(language, "Satelit", "Satellite")})${
            isLowConfidence ? pick(language, " · confidence rendah", " · low confidence") : ""
          }`,
          {
            direction: "top",
            className: "firesight-tooltip",
          }
        );

        point.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedEntity({ kind: "hotspot", marker });
          setPanelExpanded(false);
          onMarkerSelect?.(marker);
        });
      }

      // 3. Community Reports (Person pin) — icon only, no solid background disc.
      for (const report of reports ?? []) {
        const isSelected = selectedEntity?.kind === "report" && selectedEntity.report.id === report.id;
        const icon = L.divIcon({
          className: "firesight-person-icon",
          html: `<div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5))${isSelected ? " drop-shadow(0 0 4px #2563eb)" : ""};"><span class="material-symbols-outlined" style="font-size:20px;color:${REPORT_PIN_COLOR};">person_pin_circle</span></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const point = L.marker([report.lat, report.lng], {
          icon,
          zIndexOffset: isSelected ? 1300 : 700,
        }).addTo(layer);

        point.bindTooltip(`${pick(language, "Laporan warga", "Citizen report")}: ${reportStatusText(report.status, language)}`, {
          direction: "top",
          className: "firesight-tooltip",
        });

        point.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedEntity({ kind: "report", report });
          setPanelExpanded(false);
          onReportSelect?.(report);
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [markers, reports, ready, onMarkerSelect, onReportSelect, selectedEntity, language]);

  // Render Highlight Halo for Selected Entity
  useEffect(() => {
    if (!ready || !highlightLayerRef.current) return;
    const layer = highlightLayerRef.current;
    layer.clearLayers();

    if (!selectedEntity) return;

    import("leaflet").then((L) => {
      let lat = 0;
      let lng = 0;

      if (selectedEntity.kind === "hotspot") {
        lat = selectedEntity.marker.lat;
        lng = selectedEntity.marker.lng;
      } else if (selectedEntity.kind === "report") {
        lat = selectedEntity.report.lat;
        lng = selectedEntity.report.lng;
      } else if (selectedEntity.kind === "user") {
        lat = selectedEntity.location.lat;
        lng = selectedEntity.location.lng;
      }

      if (!lat || !lng) return;

      const auraIcon = L.divIcon({
        className: "firesight-selection-aura",
        html: `<div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;pointer-events:none;">
          <div style="position:absolute;inset:0;border-radius:50%;border:2px dashed #f59e0b;animation:spin 12s linear infinite;"></div>
          <div style="width:34px;height:34px;border-radius:50%;background:rgba(245,158,11,0.18);border:2px solid #d97706;"></div>
        </div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      L.marker([lat, lng], {
        icon: auraIcon,
        zIndexOffset: 2000,
        interactive: false,
      }).addTo(layer);
    });
  }, [ready, selectedEntity]);

  // Recenter controls
  const handleRecenter = () => {
    if (!mapRef.current) return;
    if (userLocation) {
      mapRef.current.setView([userLocation.lat, userLocation.lng], 11, { animate: true });
    } else {
      mapRef.current.setView([centerLat, centerLng], zoom, { animate: true });
    }
  };

  const handleFitAll = () => {
    if (!mapRef.current || markers.length === 0) return;
    import("leaflet").then((L) => {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
      if (userLocation) bounds.extend([userLocation.lat, userLocation.lng]);
      mapRef.current?.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
    });
  };

  // Auto-fit once, the first time markers are available, when requested —
  // for a small focused map a fixed zoom can otherwise leave a sparse
  // cluster of tiny markers looking like an empty map.
  useEffect(() => {
    if (!autoFitOnLoad || didAutoFitRef.current || !ready || markers.length === 0) return;
    didAutoFitRef.current = true;
    handleFitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFitOnLoad, ready, markers]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  // Selected distance calculation
  const distanceToSelected = useMemo(() => {
    if (!userLocation || !selectedEntity) return null;
    let targetLat = 0;
    let targetLon = 0;
    if (selectedEntity.kind === "hotspot") {
      targetLat = selectedEntity.marker.lat;
      targetLon = selectedEntity.marker.lng;
    } else if (selectedEntity.kind === "report") {
      targetLat = selectedEntity.report.lat;
      targetLon = selectedEntity.report.lng;
    }
    if (!targetLat || !targetLon) return null;
    return computeDistanceKm(userLocation.lat, userLocation.lng, targetLat, targetLon);
  }, [userLocation, selectedEntity]);

  return (
    <div className={`relative overflow-hidden select-none ${className}`}>
      {/* Loading overlay */}
      {!ready && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-emerald-50/70 backdrop-blur-xs">
          <div className="flex items-center gap-2.5 font-bold text-xs text-emerald-900 bg-white/90 px-4 py-2.5 rounded-full shadow-md border border-emerald-200">
            <span className="material-symbols-outlined text-[18px] animate-spin text-emerald-600">refresh</span>
            <span>{tr("MEMUAT PETA…", "LOADING MAP…")}</span>
          </div>
        </div>
      )}

      {/* Leaflet DOM container */}
      <div ref={containerRef} className="h-full w-full z-[100]" />

      {/* Top-Right & Bottom-Right Floating Controls (Zoom, Recenter, Legend, Fullscreen) */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
        {/* Zoom In */}
        <button
          type="button"
          onClick={handleZoomIn}
          aria-label={tr("Perbesar peta", "Zoom in")}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-gray-800 shadow-md border border-gray-200/80 hover:bg-white active:scale-95 transition"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
        </button>
        {/* Zoom Out */}
        <button
          type="button"
          onClick={handleZoomOut}
          aria-label={tr("Perkecil peta", "Zoom out")}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-gray-800 shadow-md border border-gray-200/80 hover:bg-white active:scale-95 transition"
        >
          <span className="material-symbols-outlined text-[20px]">remove</span>
        </button>
        {/* Recenter to Location */}
        <button
          type="button"
          onClick={handleRecenter}
          title={userLocation ? tr("Pusatkan ke lokasi Anda", "Center on your location") : tr("Pusatkan peta", "Recenter map")}
          aria-label={tr("Pusatkan peta", "Recenter map")}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-emerald-800 shadow-md border border-gray-200/80 hover:bg-white active:scale-95 transition"
        >
          <span className="material-symbols-outlined text-[19px]">my_location</span>
        </button>
        {/* Fit All Points */}
        <button
          type="button"
          onClick={handleFitAll}
          title={tr("Tampilkan seluruh titik api", "Show all hotspots")}
          aria-label={tr("Tampilkan seluruh titik api", "Show all hotspots")}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-gray-700 shadow-md border border-gray-200/80 hover:bg-white active:scale-95 transition"
        >
          <span className="material-symbols-outlined text-[19px]">crop_free</span>
        </button>
        {/* Fullscreen toggle button if allowed */}
        {allowFullScreenToggle && onToggleFullScreen && (
          <button
            type="button"
            onClick={onToggleFullScreen}
            title={isFullScreen ? tr("Keluar layar penuh", "Exit full screen") : tr("Buka layar penuh", "Full screen")}
            aria-label={isFullScreen ? tr("Keluar layar penuh", "Exit full screen") : tr("Buka layar penuh", "Full screen")}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-[#075640] shadow-md border border-emerald-200 hover:bg-white active:scale-95 transition"
          >
            <span className="material-symbols-outlined text-[19px]">
              {isFullScreen ? "fullscreen_exit" : "fullscreen"}
            </span>
          </button>
        )}
      </div>

      {/* Legend — two small always-visible stacked boxes (SiPongi+-style), not a
          collapsible popover, so the symbol meanings are never one click away. */}
      {(showSeverityLegend || showSymbolLegend) && (
        <div className="absolute top-3 right-3 z-[1000] pointer-events-auto flex flex-col items-end gap-2">
          {showSeverityLegend && (
            <div className="rounded-lg bg-white/97 backdrop-blur-xs border border-gray-200 shadow-md px-3 py-2 text-[11px] text-gray-700">
              <div className="font-extrabold text-[10px] text-[#123027] uppercase tracking-wide pb-1.5">
                {tr("Tingkat Keparahan (FRP)", "Severity (FRP)")}
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-600 ring-1 ring-red-200" />
                  {tr("Tinggi", "High")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-400 ring-1 ring-orange-200" />
                  {tr("Sedang", "Medium")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 ring-1 ring-yellow-200" />
                  {tr("Rendah", "Low")}
                </span>
              </div>
            </div>
          )}

          {showSymbolLegend && (
            <div className="rounded-lg bg-white/97 backdrop-blur-xs border border-gray-200 shadow-md px-3 py-2 text-[11px] text-gray-700 max-w-[220px]">
              <button
                type="button"
                onClick={() => setShowLegendModal(!showLegendModal)}
                className="flex w-full items-center justify-between gap-2 font-extrabold text-[10px] text-[#123027] uppercase tracking-wide"
              >
                <span>{tr("Sumber Data & Bentuk", "Data Source & Shape")}</span>
                <span className="material-symbols-outlined text-[14px] text-gray-400">
                  {showLegendModal ? "expand_less" : "expand_more"}
                </span>
              </button>
              {showLegendModal && (
                <div className="mt-1.5 space-y-1 pt-1.5 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="flex h-3.5 w-3.5 items-center justify-center text-[10px]">🔥</span>
                    <span>{tr("Terharmonisasi (MODIS + VIIRS)", "Harmonized (MODIS + VIIRS)")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[12px] text-slate-500">star</span>
                    <span>{tr("Hanya MODIS (Terra/Aqua)", "MODIS only (Terra/Aqua)")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[12px] text-slate-500">hexagon</span>
                    <span>{tr("Hanya VIIRS (S-NPP/NOAA-20/21)", "VIIRS only (S-NPP/NOAA-20/21)")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px] text-blue-600">person_pin_circle</span>
                    <span>{tr("Laporan warga", "Citizen report")}</span>
                  </div>
                  {hasAnyLowConfidenceMarker && (
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full border border-dashed border-gray-400 bg-gray-300 opacity-50" />
                      <span>{tr("Marker pudar/putus-putus = confidence rendah", "Faded/dashed marker = low confidence")}</span>
                    </div>
                  )}
                  {userLocation && (
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-white" />
                      <span className="font-semibold text-blue-900">{tr("Lokasi Anda (bukan api)", "Your location (not a fire)")}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 leading-snug pt-1 border-t border-gray-100">
                    {tr("Deteksi satelit adalah anomali radiasi termal mendekati waktu nyata.", "Satellite detections are near-real-time thermal anomalies.")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* COMPACT DISMISSIBLE DETAIL PANEL (Bottom Sheet on Mobile / Side Card on Desktop) */}
      {showDetailPanel && selectedEntity && (
        <div
          className={`pointer-events-auto transition-all duration-200 z-[1100] ${
            /* Mobile: Bottom Sheet floating above bottom nav */
            /* Desktop: Elegant side panel floating on top-right */
            "fixed inset-x-3 bottom-3 md:absolute md:inset-auto md:top-14 md:right-3 md:w-84 md:max-w-sm"
          }`}
        >
          <div className="rounded-2xl bg-white/98 backdrop-blur-md border border-gray-200/90 shadow-2xl p-4 space-y-2.5 overflow-hidden">
            
            {/* Header with Title, Close, and Expand toggle */}
            <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-2">
              <div className="flex items-center gap-2 min-w-0">
                {selectedEntity.kind === "hotspot" && (
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white ${
                      selectedEntity.marker.severity === "HIGH"
                        ? "bg-red-600 shadow-xs shadow-red-900/30"
                        : selectedEntity.marker.severity === "MEDIUM"
                          ? "bg-orange-500"
                          : "bg-amber-400"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">local_fire_department</span>
                  </span>
                )}
                {selectedEntity.kind === "report" && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                    <span className="material-symbols-outlined text-[18px]">person_pin_circle</span>
                  </span>
                )}
                {selectedEntity.kind === "user" && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                    <span className="material-symbols-outlined text-[18px]">my_location</span>
                  </span>
                )}

                <div className="min-w-0">
                  <h3 className="text-xs md:text-sm font-bold text-[#123027] truncate">
                    {selectedEntity.kind === "hotspot"
                      ? selectedEntity.marker.matchStatus === "MATCHED"
                        ? tr("Titik Api (MODIS + VIIRS)", "Hotspot (MODIS + VIIRS)")
                        : `${tr("Titik Api", "Hotspot")} ${selectedEntity.marker.sensor ?? tr("Satelit", "Satellite")}`
                      : selectedEntity.kind === "report"
                        ? tr("Laporan Lapangan Warga", "Citizen Field Report")
                        : selectedEntity.location.label ?? tr("Lokasi Anda", "Your location")}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 truncate mt-0.5 font-medium">
                    {distanceToSelected !== null && (
                      <span className="font-bold text-emerald-800">
                        {formatDistance(distanceToSelected)} {tr("dari Anda", "from you")}
                      </span>
                    )}
                    {selectedEntity.kind === "hotspot" && (
                      <span>{formatAcquiredAt(selectedEntity.marker.acquiredAt, language).split("·")[1] ?? ""}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1 shrink-0">
                {selectedEntity.kind === "hotspot" && (
                  <button
                    type="button"
                    onClick={() => setPanelExpanded(!panelExpanded)}
                    title={panelExpanded ? tr("Sembunyikan rincian", "Hide details") : tr("Tampilkan rincian lengkap", "Show full details")}
                    aria-label={panelExpanded ? tr("Sembunyikan rincian", "Hide details") : tr("Tampilkan rincian lengkap", "Show full details")}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                  >
                    <span className="material-symbols-outlined text-[17px]">
                      {panelExpanded ? "expand_less" : "expand_more"}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEntity(null);
                    onMarkerSelect?.(null);
                    onReportSelect?.(null);
                  }}
                  title={tr("Tutup panel", "Close panel")}
                  aria-label={tr("Tutup panel", "Close panel")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            </div>

            {/* Quick Summary Row (Visible in Collapsed State) */}
            {selectedEntity.kind === "hotspot" && (
              <div className="flex items-center justify-between text-xs py-0.5">
                <span className="text-[11px] text-gray-500 font-medium">
                  {markerLabel(selectedEntity.marker, language)}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                    selectedEntity.marker.severity === "HIGH"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : selectedEntity.marker.severity === "MEDIUM"
                        ? "bg-orange-50 text-orange-700 border-orange-200"
                        : "bg-yellow-50 text-yellow-800 border-yellow-200"
                  }`}
                >
                  {SEVERITY_LABEL[selectedEntity.marker.severity]
                    ? tr(...SEVERITY_LABEL[selectedEntity.marker.severity])
                    : selectedEntity.marker.severity}
                </span>
              </div>
            )}

            {selectedEntity.kind === "report" && (
              <div className="space-y-1.5 text-xs text-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{tr("Status verifikasi", "Verification status")}:</span>
                  <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                    {reportStatusText(selectedEntity.report.status, language)}
                  </span>
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed bg-gray-50 p-2 rounded-xl">
                  {selectedEntity.report.description}
                </p>
              </div>
            )}

            {selectedEntity.kind === "user" && (
              <div className="text-xs text-gray-600 space-y-1">
                <p>{tr("Ini adalah titik acuan lokasi Anda untuk menghitung radius pantau kebakaran.", "This is your reference location for the fire-watch radius.")}</p>
                <div className="text-[11px] font-mono text-gray-500">
                  {selectedEntity.location.lat.toFixed(4)}°, {selectedEntity.location.lng.toFixed(4)}°
                </div>
              </div>
            )}

            {/* EXPANDED STATE (Detailed Fields without Fabricated Data) */}
            {panelExpanded && selectedEntity.kind === "hotspot" && (
              <div className="space-y-2.5 pt-2 border-t border-gray-100 text-xs animate-fadeIn">
                {/* FRP Meter */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-medium text-gray-600 mb-1">
                    <span>{tr("Daya Radiasi (FRP)", "Radiative Power (FRP)")}</span>
                    <span className="font-extrabold text-[#123027]">
                      {selectedEntity.marker.frp.toFixed(1)} MW
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600"
                      style={{
                        width: `${Math.min(100, Math.max(8, (selectedEntity.marker.frp / 100) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-gray-50/80 p-2.5 rounded-xl border border-gray-100">
                  <div>
                    <span className="text-gray-400 block text-[10px]">{tr("Sensor / Satelit", "Sensor / Satellite")}</span>
                    <span className="font-semibold text-gray-800">
                      {selectedEntity.marker.sensor ?? selectedEntity.marker.source ?? "NASA FIRMS"}
                      {selectedEntity.marker.satellite ? ` (${selectedEntity.marker.satellite})` : ""}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">{tr("Tingkat Keyakinan", "Confidence")}</span>
                    <span className="font-semibold text-gray-800">
                      {selectedEntity.marker.confidenceLabel ??
                        (typeof selectedEntity.marker.confidence === "number"
                          ? `${selectedEntity.marker.confidence.toFixed(0)}%`
                          : tr("Tersedia", "Available"))}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400 block text-[10px]">{tr("Waktu Pengamatan", "Observed At")}</span>
                    <span className="font-semibold text-gray-800">
                      {formatAcquiredAt(selectedEntity.marker.acquiredAt, language)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400 block text-[10px]">{tr("Wilayah", "Area")}</span>
                    <span className="text-gray-700">{formatAdminFull(selectedEntity.marker.admin) ?? tr("Tidak tercatat", "Not recorded")}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400 block text-[10px]">{tr("Koordinat Deteksi", "Detection Coordinates")}</span>
                    <span className="font-mono text-gray-700">
                      {selectedEntity.marker.lat.toFixed(4)}°, {selectedEntity.marker.lng.toFixed(4)}°
                    </span>
                  </div>
                  {selectedEntity.marker.matchStatus && (
                    <div className="col-span-2">
                      <span className="text-gray-400 block text-[10px]">{tr("Validasi Silang Sensor", "Cross-Sensor Check")}</span>
                      <span className="font-semibold text-emerald-800">
                        {selectedEntity.marker.matchStatus === "MATCHED"
                          ? tr("Cocok lintas sensor (MODIS + VIIRS)", "Matched across sensors (MODIS + VIIRS)")
                          : selectedEntity.marker.matchStatus === "MODIS_ONLY"
                            ? tr("Hanya MODIS", "MODIS only")
                            : selectedEntity.marker.matchStatus === "VIIRS_ONLY"
                              ? tr("Hanya VIIRS", "VIIRS only")
                              : selectedEntity.marker.matchStatus.replaceAll("_", " ")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Caution Note */}
                <p className="text-[10px] text-amber-900 bg-amber-50/80 border border-amber-200/60 p-2 rounded-xl leading-relaxed">
                  {tr(
                    "Deteksi satelit adalah anomali radiasi termal mendekati waktu nyata, bukan konfirmasi resmi kebakaran di lapangan.",
                    "Satellite detections are near-real-time thermal anomalies, not official confirmation of a fire on the ground."
                  )}
                </p>

                {/* Action Link (e.g., Detail Peringatan or Lapor) */}
                {actionHref ? (
                  <Link
                    href={actionHref(selectedEntity.marker)}
                    className="block w-full text-center py-2 px-3 rounded-xl bg-[#075640] hover:bg-[#054030] text-white font-bold text-xs shadow-xs transition active:scale-[0.99]"
                  >
                    {actionLabel ?? tr("Lihat Detail Peringatan", "View Alert Details")}
                  </Link>
                ) : (
                  <Link
                    href={`/community/alert/${selectedEntity.marker.id}`}
                    className="block w-full text-center py-2 px-3 rounded-xl bg-[#075640] hover:bg-[#054030] text-white font-bold text-xs shadow-xs transition active:scale-[0.99]"
                  >
                    {tr("Lihat Panduan & Detail Peringatan", "View Guidance & Alert Details")}
                  </Link>
                )}
              </div>
            )}

            {/* Toggle Expand/Collapse Link */}
            {selectedEntity.kind === "hotspot" && (
              <button
                type="button"
                onClick={() => setPanelExpanded(!panelExpanded)}
                className="w-full text-center text-[11px] font-bold text-emerald-800 hover:text-emerald-950 pt-1 border-t border-gray-100 flex items-center justify-center gap-1"
              >
                <span>{panelExpanded ? tr("Ciutkan rincian", "Collapse details") : tr("Lihat rincian lengkap deteksi", "See full detection details")}</span>
                <span className="material-symbols-outlined text-[14px]">
                  {panelExpanded ? "expand_less" : "expand_more"}
                </span>
              </button>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
