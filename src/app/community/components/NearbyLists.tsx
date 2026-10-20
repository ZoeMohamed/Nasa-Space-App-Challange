"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDistanceKm } from "../lib/geo";
import {
  REPORT_STATUS_DESCRIPTION,
  REPORT_STATUS_LABEL,
  REPORT_STATUS_TONE,
  REPORT_STATUS_TONE_CLASSES,
} from "../lib/reportStatus";
import type { CommunityReport, HotspotMarker } from "@/types";
import { formatAdminFull } from "@/lib/adminRegion";

const MATCH_STATUS_LABEL: Record<string, string> = {
  MATCHED: "Cocok lintas sensor (MODIS + VIIRS)",
  MODIS_ONLY: "MODIS saja",
  VIIRS_ONLY: "VIIRS saja",
  UNMATCHED: "Belum tervalidasi silang",
};

function formatAcquiredAt(value: string | undefined): string {
  if (!value) return "Waktu tidak tercatat";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tercatat";
  return (
    date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--community-ink-muted)] rounded-xl border border-dashed border-[var(--community-border)] p-4">
        Tidak ada deteksi satelit di sekitar lokasi Anda saat ini. Ini bisa berarti memang belum ada titik
        panas terdeteksi dalam 24 jam terakhir — bukan berarti data gagal dimuat.
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
                <span>{marker.sensor ?? marker.satellite ?? "Sensor tidak tercatat"}</span>
                <span>FRP {typeof marker.frp === "number" ? `${marker.frp.toFixed(1)} MW` : "—"}</span>
                {marker.matchStatus && (
                  <span>{MATCH_STATUS_LABEL[marker.matchStatus] ?? marker.matchStatus}</span>
                )}
              </div>

              {expanded && (
                <dl className="mt-2 pt-2 border-t border-[var(--community-border)] grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <dt className="text-[var(--community-ink-muted)]">Terdeteksi</dt>
                    <dd className="font-medium">{formatAcquiredAt(marker.acquiredAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--community-ink-muted)]">Keyakinan</dt>
                    <dd className="font-medium">
                      {marker.confidenceLabel ??
                        (typeof marker.confidence === "number" ? `${marker.confidence}%` : "—")}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[var(--community-ink-muted)]">Wilayah</dt>
                    <dd className="font-medium">{formatAdminFull(marker.admin) ?? "Di luar batas wilayah tercatat"}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--community-ink-muted)]">Koordinat</dt>
                    <dd className="font-medium font-mono">
                      {marker.lat.toFixed(4)}, {marker.lng.toFixed(4)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--community-ink-muted)]">Tingkat</dt>
                    <dd className="font-medium">{marker.severity}</dd>
                  </div>
                  <p className="col-span-2 text-[var(--community-ink-muted)]">
                    Deteksi satelit menunjukkan titik panas, bukan konfirmasi kebakaran di lapangan.
                  </p>
                </dl>
              )}
            </button>
            {expanded && (
              <Link
                href={`/community/alert/${marker.id}`}
                className="mt-1 block text-right text-[11px] font-semibold text-[var(--community-accent)]"
              >
                Lihat detail peringatan →
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function NearbyReportList({ items }: { items: NearbyReportItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--community-ink-muted)] rounded-xl border border-dashed border-[var(--community-border)] p-4">
        Belum ada laporan warga lain di sekitar lokasi Anda.
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
                  {REPORT_STATUS_LABEL[report.status]}
                </span>
                <span className="text-[11px] text-[var(--community-ink-muted)]">
                  {formatAcquiredAt(report.observedAt)}
                </span>
              </div>

              {expanded && (
                <div className="mt-2 pt-2 border-t border-[var(--community-border)] space-y-1 text-[11px]">
                  <p className="text-[var(--community-ink-muted)]">{REPORT_STATUS_DESCRIPTION[report.status]}</p>
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
                Lihat status lengkap →
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
