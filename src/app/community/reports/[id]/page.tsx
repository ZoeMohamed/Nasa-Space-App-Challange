"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { CommunityReport } from "@/types";
import { formatAdminFull } from "@/lib/adminRegion";
import { useTranslation, type Language } from "@/lib/i18n/LanguageContext";
import {
  reportStatusDescription,
  reportStatusLabel,
  REPORT_STATUS_TONE,
  REPORT_STATUS_TONE_CLASSES,
} from "../../lib/reportStatus";

function formatClock(iso: string | null | undefined, language: Language): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleString(language === "en" ? "en-GB" : "id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  })} WIB`;
}

/**
 * Status of one citizen report. Every line comes from GET /api/reports/{id} — there is no demo
 * fallback: if the report can't be loaded, the page says so instead of showing a made-up one.
 */
export default function ReportStatusPage() {
  const { tr, language } = useTranslation();
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<"loading" | "loaded" | "missing" | "error">("loading");
  const [report, setReport] = useState<CommunityReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports/${encodeURIComponent(params.id)}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as CommunityReport;
      })
      .then((body) => {
        if (cancelled) return;
        setReport(body);
        setState(body ? "loaded" : "missing");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const links = report?.satelliteLinks ?? [];
  const nearestLink = [...links].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))[0];
  const place = report ? (formatAdminFull(report.admin) ?? `${report.lat.toFixed(4)}, ${report.lon.toFixed(4)}`) : "";
  const reviewed = report ? report.status === "verified" || report.status === "rejected" : false;

  const steps = report
    ? [
        {
          done: true,
          title: tr("Laporan diterima sistem", "Report received"),
          time: formatClock(report.createdAt, language),
          body: tr(
            `Lokasi ${place}${report.photoFilename ? ", 1 foto terlampir" : ", tanpa foto"}.`,
            `Location ${place}${report.photoFilename ? ", 1 photo attached" : ", no photo"}.`
          ),
        },
        {
          done: true,
          title: tr("Dicocokkan otomatis dengan data satelit", "Automatically matched with satellite data"),
          time: null,
          body:
            links.length > 0
              ? tr(
                  `${links.length} deteksi MODIS/VIIRS dalam 5 km & 24 jam${nearestLink?.distanceKm != null ? ` (terdekat ${nearestLink.distanceKm.toFixed(1)} km)` : ""}. Ini belum berarti kebakaran terkonfirmasi.`,
                  `${links.length} MODIS/VIIRS detections within 5 km & 24 hours${nearestLink?.distanceKm != null ? ` (nearest ${nearestLink.distanceKm.toFixed(1)} km)` : ""}. This doesn't yet mean a fire is confirmed.`
                )
              : tr(
                  "Tidak ada deteksi MODIS/VIIRS dalam 5 km & 24 jam dari laporan ini.",
                  "No MODIS/VIIRS detection within 5 km & 24 hours of this report."
                ),
        },
        {
          done: reviewed,
          title: tr("Ditinjau petugas", "Officer review"),
          time: formatClock(report.reviewedAt, language),
          body: reviewed
            ? reportStatusDescription(report.status, language)
            : tr("Belum ada keputusan petugas.", "No officer decision yet."),
        },
      ]
    : [];

  return (
    <div className="max-w-xl mx-auto space-y-5 animate-fadeIn pb-12">
      <div className="flex items-center justify-between">
        <Link
          href="/community/saya"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#123027] hover:text-[var(--community-accent)] transition"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>{tr("Laporan saya", "My reports")}</span>
        </Link>
      </div>

      {state === "loading" && (
        <div className="py-12 text-center text-xs font-medium text-[var(--community-ink-muted)] animate-pulse">
          {tr("Memuat status laporan…", "Loading report status…")}
        </div>
      )}

      {(state === "missing" || state === "error") && (
        <div className="rounded-2xl border border-dashed border-[var(--community-border)] bg-white p-6 text-center space-y-3">
          <span className="material-symbols-outlined text-[32px] text-[var(--community-ink-muted)]">search_off</span>
          <p className="text-sm font-semibold text-[#123027]">
            {state === "missing"
              ? tr("Laporan ini tidak ditemukan.", "This report was not found.")
              : tr("Status laporan sedang tidak bisa dimuat.", "The report status can't be loaded right now.")}
          </p>
          <Link href="/community/saya" className="inline-block text-xs font-bold text-[var(--community-accent)] hover:underline">
            {tr("Lihat semua laporan saya", "See all my reports")}
          </Link>
        </div>
      )}

      {state === "loaded" && report && (
        <>
          <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-[var(--community-ink-muted)]">
                {tr("ID laporan", "Report ID")} {report.id.slice(0, 8).toUpperCase()}
              </span>
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  REPORT_STATUS_TONE_CLASSES[REPORT_STATUS_TONE[report.status]]
                }`}
              >
                {reportStatusLabel(report.status, language)}
              </span>
            </div>
            <h1 className="text-sm font-bold text-[#123027]">{report.description}</h1>
            <p className="text-[11px] text-[var(--community-ink-muted)]">{place}</p>
            <p className="text-[11px] text-[var(--community-ink-muted)]">
              {tr("Dilihat", "Observed")}: {formatClock(report.observedAt, language) ?? "—"}
            </p>
            {report.photoFilename && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/reports/${report.id}/photo`}
                alt={tr("Foto lampiran laporan", "Photo attached to the report")}
                className="mt-1 h-48 w-full rounded-xl object-cover bg-gray-100"
              />
            )}
          </div>

          <section className="rounded-3xl border border-[var(--community-border)] bg-white p-5 space-y-4 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--community-ink-muted)]">
              {tr("Perjalanan laporanmu", "Your report's journey")}
            </h2>
            <ol className="space-y-4">
              {steps.map((step, index) => (
                <li key={step.title} className={`flex gap-3 ${step.done ? "" : "opacity-60"}`}>
                  <span
                    className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      step.done ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {step.done ? "✓" : index + 1}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#123027]">{step.title}</span>
                      {step.time && <span className="text-[11px] text-[var(--community-ink-muted)]">{step.time}</span>}
                    </div>
                    <p className="text-xs text-[var(--community-ink-muted)] mt-0.5 leading-relaxed">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            {report.reviewNote && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs text-[#123027]">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--community-ink-muted)] mb-0.5">
                  {tr("Catatan petugas", "Officer note")}
                </span>
                {report.reviewNote}
              </div>
            )}
            {!reviewed && (
              <p className="text-[11px] text-[var(--community-ink-muted)]">
                {reportStatusDescription(report.status, language)}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
