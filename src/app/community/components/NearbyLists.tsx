"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDistanceKm } from "../lib/geo";
import {
  reportStatusDescription,
  reportStatusLabel,
  REPORT_STATUS_TONE,
  REPORT_STATUS_TONE_CLASSES,
} from "../lib/reportStatus";
import type { CommunityReport, HotspotMarker } from "@/types";
import { formatAdminFull } from "@/lib/adminRegion";
import { useTranslation, pick, type Language } from "@/lib/i18n/LanguageContext";

const MATCH_STATUS_LABEL: Record<string, readonly [string, string]> = {
  MATCHED: ["Cocok lintas sensor (MODIS + VIIRS)", "Matched across sensors (MODIS + VIIRS)"],
  MODIS_ONLY: ["MODIS saja", "MODIS only"],
  VIIRS_ONLY: ["VIIRS saja", "VIIRS only"],
  UNMATCHED: ["Belum tervalidasi silang", "Not cross-checked"],
};

function formatAcquiredAt(value: string | undefined, language: Language): string {
  if (!value) return pick(language, "Waktu tidak tercatat", "Time not recorded");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return pick(language, "Waktu tidak tercatat", "Time not recorded");
  return (
    date.toLocaleString(language === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
  );
}

export interface NearbyHotspot {
  marker: HotspotMarker;
  distanceKm: number;
}

export interface NearbyReportItem {
  report: CommunityReport;
  distanceKm: number;
}

export function NearbyHotspotList({ items }: { items: NearbyHotspot[] }) {
  const { tr, language } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--community-ink-muted)] rounded-xl border border-dashed border-[var(--community-border)] p-4">
        {tr(
          "Tidak ada deteksi satelit di sekitar lokasi Anda saat ini. Ini bisa berarti memang belum ada titik panas terdeteksi dalam 24 jam terakhir — bukan berarti data gagal dimuat.",
          "No satellite detections around you right now. That can simply mean no hotspot was detected in the last 24 hours — not that the data failed to load."
        )}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map(({ marker, distanceKm }) => {
        const expanded = expandedId === marker.id;
        return (
          <li key={marker.id}>
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : marker.id)}
              className="w-full text-left rounded-xl border border-[var(--community-border)] bg-white p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                      marker.severity === "HIGH"
                        ? "bg-red-600"
                        : marker.severity === "MEDIUM"
                          ? "bg-orange-400"
                          : "bg-yellow-400"
                    }`}
                  />
                  <span className="text-sm font-semibold truncate">{marker.label}</span>
                </div>
                <span className="shrink-0 text-xs font-bold text-[var(--community-accent)]">
                  {formatDistanceKm(distanceKm)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--community-ink-muted)]">
                <span>{marker.sensor ?? marker.satellite ?? tr("Sensor tidak tercatat", "Sensor not recorded")}</span>
                <span>FRP {typeof marker.frp === "number" ? `${marker.frp.toFixed(1)} MW` : "—"}</span>
                {marker.matchStatus && (
                  <span>{MATCH_STATUS_LABEL[marker.matchStatus] ? tr(...MATCH_STATUS_LABEL[marker.matchStatus]) : marker.matchStatus}</span>
                )}
              </div>

              {expanded && (
                <dl className="mt-2 pt-2 border-t border-[var(--community-border)] grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <dt className="text-[var(--community-ink-muted)]">{tr("Terdeteksi", "Detected")}</dt>
                    <dd className="font-medium">{formatAcquiredAt(marker.acquiredAt, language)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--community-ink-muted)]">{tr("Keyakinan", "Confidence")}</dt>
                    <dd className="font-medium">
                      {marker.confidenceLabel ??
                        (typeof marker.confidence === "number" ? `${marker.confidence}%` : "—")}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[var(--community-ink-muted)]">{tr("Wilayah", "Area")}</dt>
                    <dd className="font-medium">{formatAdminFull(marker.admin) ?? tr("Di luar batas wilayah tercatat", "Outside recorded boundaries")}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--community-ink-muted)]">{tr("Koordinat", "Coordinates")}</dt>
                    <dd className="font-medium font-mono">
                      {marker.lat.toFixed(4)}, {marker.lng.toFixed(4)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--community-ink-muted)]">{tr("Tingkat", "Level")}</dt>
                    <dd className="font-medium">{marker.severity}</dd>
                  </div>
                  <p className="col-span-2 text-[var(--community-ink-muted)]">
                    {tr(
                      "Deteksi satelit menunjukkan titik panas, bukan konfirmasi kebakaran di lapangan.",
                      "A satellite detection shows a hotspot, not a confirmed fire on the ground."
                    )}
                  </p>
                </dl>
              )}
            </button>
            {expanded && (
              <Link
                href={`/community/alert/${marker.id}`}
                className="mt-1 block text-right text-[11px] font-semibold text-[var(--community-accent)]"
              >
                {tr("Lihat detail peringatan →", "View alert details →")}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function NearbyReportList({ items }: { items: NearbyReportItem[] }) {
  const { tr, language } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--community-ink-muted)] rounded-xl border border-dashed border-[var(--community-border)] p-4">
        {tr("Belum ada laporan warga lain di sekitar lokasi Anda.", "No other citizen reports near you yet.")}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map(({ report, distanceKm }) => {
        const expanded = expandedId === report.id;
        const tone = REPORT_STATUS_TONE[report.status];
        return (
          <li key={report.id}>
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : report.id)}
              className="w-full text-left rounded-xl border border-[var(--community-border)] bg-white p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate pr-2">{report.description}</span>
                <span className="shrink-0 text-xs font-bold text-[var(--community-accent)]">
                  {formatDistanceKm(distanceKm)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${REPORT_STATUS_TONE_CLASSES[tone]}`}
                >
                  {reportStatusLabel(report.status, language)}
                </span>
                <span className="text-[11px] text-[var(--community-ink-muted)]">
                  {formatAcquiredAt(report.observedAt, language)}
                </span>
              </div>

              {expanded && (
                <div className="mt-2 pt-2 border-t border-[var(--community-border)] space-y-1 text-[11px]">
                  <p className="text-[var(--community-ink-muted)]">{reportStatusDescription(report.status, language)}</p>
                  {formatAdminFull(report.admin) && (
                    <p className="text-[var(--community-ink)]">{formatAdminFull(report.admin)}</p>
                  )}
                  <p className="font-mono text-[var(--community-ink-muted)]">
                    {report.lat.toFixed(4)}, {report.lon.toFixed(4)}
                  </p>
                </div>
              )}
            </button>
            {expanded && (
              <Link
                href={`/community/reports/${report.id}`}
                className="mt-1 block text-right text-[11px] font-semibold text-[var(--community-accent)]"
              >
                {tr("Lihat status lengkap →", "View full status →")}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
