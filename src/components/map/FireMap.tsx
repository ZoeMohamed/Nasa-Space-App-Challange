"use client";

import { useEffect, useRef, useState } from "react";
import type { HotspotMarker } from "@/types";

/** A community-submitted field report pin, rendered alongside satellite markers. */
export interface CommunityReportPin {
  id: string;
  lat: number;
  lng: number;
  status: string;
  description: string;
}

interface FireMapProps {
  markers: HotspotMarker[];
  center?: [number, number];
  zoom?: number;
  className?: string;
  showSeverityLegend?: boolean;
  /** Shows the shape/symbol legend (fire / circle / square / triangle / person). Default true. */
  showSymbolLegend?: boolean;
  /** Called with the full marker record when its map point is clicked — drives an external detail panel. */
  onMarkerSelect?: (marker: HotspotMarker) => void;
  /** Optional community field reports, rendered as person-icon pins with their own popup. */
  reports?: CommunityReportPin[];
}

const SEVERITY_COLOR: Record<string, string> = {
  HIGH: "#dc2626", // red-600
  MEDIUM: "#fb923c", // orange-400
  LOW: "#facc15", // yellow-400
};

const REPORT_PIN_COLOR = "#2563eb"; // blue-600, consistent with this app's existing blue accent

// Slightly wider than the 60-minute window python-service/fire_pipeline/matching.py uses to
// pair MODIS↔VIIRS detections, to tolerate acquiredAt string rounding to the minute.
const MATCH_PAIR_WINDOW_MS = 70 * 60 * 1000;

/**
 * One rendered "harmonized fire" marker — either an actual MODIS+VIIRS matched pair (2 members)
 * or a lone MATCHED-status detection that had no in-bucket partner (1 member, nothing dropped).
 */
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

/**
 * Groups raw markers into:
 *  - `fireGroups`: one combined 🔥 marker per MATCHED MODIS/VIIRS pair (the live pipeline
 *    currently emits BOTH sides of a matched pair as separate marker entries, each flagged
 *    matchStatus: "MATCHED" — this collapses them into one visual marker so a matched pair
 *    never renders as two overlapping points).
 *  - `singles`: every other marker (MODIS_ONLY / VIIRS_ONLY / UNMATCHED / unrecognized),
 *    rendered individually by `singleShapeKind`.
 *
 * Pairing strategy (documented per the task): `matchedDetectionId` from the Python pipeline is
 * an internal pandas `detection_id` integer, not this marker's own string `id`
 * (`source-acquiredAt-lat-lon`), so it cannot be used as a direct id→id lookup from the
 * frontend. Instead this buckets MATCHED markers by `areaId` (a Map, O(n) over all markers —
 * no nested loop over the full list), then within each small bucket (normally 2–8 detections
 * sharing one 0.25° grid cell) pairs the nearest-in-time detections, preferring a cross-sensor
 * match first so two unrelated same-sensor MATCHED detections that happen to share a grid cell
 * aren't fused together. No detection is ever dropped: an unpaired MATCHED marker still renders
 * as its own single-member fire marker with its own detail in the popup.
 *
 * Representative position for a pair: the midpoint of the two members' coordinates.
 */
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
        if (diff > MATCH_PAIR_WINDOW_MS) break; // sorted ascending — nothing further qualifies
        if (b.sensor && a.sensor && b.sensor !== a.sensor && diff < partnerDiff) {
          partnerDiff = diff;
          partnerIndex = j;
        }
      }
      if (partnerIndex === -1) {
        // No cross-sensor candidate in the window — fall back to the nearest remaining
        // unused detection in-bucket rather than dropping it unpaired.
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

type SingleShapeKind = "circle" | "square" | "triangle";

/** MODIS_ONLY -> circle, VIIRS_ONLY -> square, anything else (UNMATCHED / missing sensor info,
 * expected to be rare) -> triangle fallback. */
function singleShapeKind(marker: HotspotMarker): SingleShapeKind {
  if (marker.matchStatus === "MODIS_ONLY") return "circle";
  if (marker.matchStatus === "VIIRS_ONLY") return "square";
  return "triangle";
}

function sizeForSeverity(severity: HotspotMarker["severity"]) {
  return severity === "HIGH" ? 22 : severity === "MEDIUM" ? 18 : 14;
}

function formatAcquiredAt(acquiredAt: string | undefined) {
  if (!acquiredAt) return "waktu tidak diketahui";
  const parsed = new Date(acquiredAt);
  if (Number.isNaN(parsed.getTime())) return "waktu tidak diketahui";
  const date = parsed.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const time = parsed.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${date} ${time} UTC`;
}

function buildDetectionDetailHtml(marker: HotspotMarker) {
  const confidenceText =
    marker.confidenceLabel ?? (marker.confidence !== undefined ? `${marker.confidence.toFixed(0)}%` : "tidak dilaporkan");
  return `<div style="border-top:1px solid #e2e8f0;padding-top:4px;margin-top:4px;">
    <div style="font-weight:600;">${escapeHtml(marker.sensor ?? marker.source ?? "Sensor tidak diketahui")}</div>
    <div>Keyakinan: ${escapeHtml(confidenceText)}</div>
    <div>FRP: ${marker.frp.toFixed(1)} MW</div>
    <div>Terdeteksi: ${escapeHtml(formatAcquiredAt(marker.acquiredAt))}</div>
  </div>`;
}

export default function FireMap({
  markers,
  center = [-1.5, 108],
  zoom = 6,
  className = "h-[420px] w-full",
  showSeverityLegend = true,
  showSymbolLegend = true,
  onMarkerSelect,
  reports,
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

      const { fireGroups, singles } = groupMatchedPairs(markers);

      // MATCHED pairs -> one 🔥 divIcon marker each, popup carries BOTH source detections.
      for (const group of fireGroups) {
        const size = sizeForSeverity(group.severity);
        const color = SEVERITY_COLOR[group.severity] ?? "#9ca3af";
        const icon = L.divIcon({
          className: "firesight-fire-icon",
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.45);font-size:${Math.round(
            size * 0.62
          )}px;line-height:1;">🔥</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        const point: import("leaflet").Layer = L.marker([group.lat, group.lng], { icon }).addTo(layer);

        const detailHtml = group.members.map((member) => buildDetectionDetailHtml(member)).join("");
        const heading =
          group.members.length > 1
            ? "Terdeteksi dua sensor (MODIS + VIIRS)"
            : "Terdeteksi (pasangan sensor tidak ditemukan di sel grid ini)";
        point.bindPopup(
          `<div style="font:12px/1.4 system-ui, sans-serif;min-width:200px;">
            <div style="font-weight:700;">🔥 ${escapeHtml(heading)}</div>
            ${detailHtml}
          </div>`
        );
        point.bindTooltip(group.members.length > 1 ? "Harmonized (MODIS + VIIRS)" : escapeHtml(group.members[0].label), {
          direction: "top",
          className: "firesight-tooltip",
        });

        if (onMarkerSelect) {
          const primary = group.members[0];
          point.on("click", () => onMarkerSelect(primary));
        }
      }

      // Everything else: MODIS_ONLY -> circle, VIIRS_ONLY -> square, fallback -> triangle.
      for (const marker of singles) {
        const shape = singleShapeKind(marker);
        const color = SEVERITY_COLOR[marker.severity] ?? "#9ca3af";
        const label = escapeHtml(marker.label);
        let point: import("leaflet").Layer;

        if (shape === "circle") {
          const radius = marker.severity === "HIGH" ? 7 : marker.severity === "MEDIUM" ? 5 : 4;
          point = L.circleMarker([marker.lat, marker.lng], {
            radius,
            color: "#fff",
            weight: 1,
            fillColor: color,
            fillOpacity: 0.85,
          }).addTo(layer);
        } else {
          const size = sizeForSeverity(marker.severity);
          const html =
            shape === "square"
              ? `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`
              : `<div style="width:0;height:0;border-left:${size / 2}px solid transparent;border-right:${size / 2}px solid transparent;border-bottom:${size}px solid ${color};filter:drop-shadow(0 1px 1px rgba(0,0,0,0.4));"></div>`;
          const icon = L.divIcon({
            className: shape === "square" ? "firesight-square-icon" : "firesight-triangle-icon",
            html,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
          point = L.marker([marker.lat, marker.lng], { icon }).addTo(layer);
        }

        point.bindTooltip(label, {
          direction: "top",
          className: "firesight-tooltip",
        });

        if (onMarkerSelect) {
          point.on("click", () => onMarkerSelect(marker));
        }
      }

      // Community field reports -> person-icon pins with their own popup (optional, backward
      // compatible — existing callers that don't pass `reports` render none of this).
      for (const report of reports ?? []) {
        const icon = L.divIcon({
          className: "firesight-person-icon",
          html: `<div style="width:22px;height:22px;border-radius:50%;background:${REPORT_PIN_COLOR};display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.45);"><span class="material-symbols-outlined" style="font-size:14px;color:#fff;">person_pin_circle</span></div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const point = L.marker([report.lat, report.lng], { icon }).addTo(layer);
        point.bindPopup(
          `<div style="font:12px/1.4 system-ui, sans-serif;min-width:180px;">
            <div style="font-weight:700;margin-bottom:2px;">Laporan Komunitas</div>
            <div style="margin-bottom:2px;"><strong>Status:</strong> ${escapeHtml(report.status)}</div>
            <div>${escapeHtml(report.description)}</div>
          </div>`
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [markers, reports, ready, onMarkerSelect]);

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

      {showSeverityLegend && (
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
      )}

      {showSymbolLegend && (
        <div
          className="absolute bottom-4 right-4 z-[1000] bg-white border border-gray-200 p-3 rounded-lg shadow-md text-[11px] font-medium space-y-2 pointer-events-none max-w-[210px]"
          aria-label="Legenda simbol peta"
        >
          <div className="font-bold text-gray-900 border-b border-gray-100 pb-1 mb-2">
            Legenda Simbol
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <span aria-hidden="true" className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-500 text-[9px] leading-none">
              🔥
            </span>
            <span>Cocok 2 sensor (MODIS + VIIRS)</span>
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full bg-gray-500 shrink-0" />
            <span>Hanya MODIS</span>
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <span aria-hidden="true" className="inline-block w-2.5 h-2.5 bg-gray-500 shrink-0" />
            <span>Hanya VIIRS</span>
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <span
              aria-hidden="true"
              className="inline-block w-0 h-0 shrink-0"
              style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: "9px solid #6b7280" }}
            />
            <span>Sensor tidak diketahui</span>
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <span className="material-symbols-outlined text-[14px] text-blue-600 shrink-0">person_pin_circle</span>
            <span>Laporan komunitas</span>
          </div>
          <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-100 leading-snug">
            Warna = tingkat keparahan (merah tinggi, oranye sedang, kuning rendah). Bentuk = jenis sumber data.
          </p>
        </div>
      )}
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
