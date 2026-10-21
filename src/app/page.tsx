"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LanguageToggle from "@/components/LanguageToggle";
import HotspotCarousel from "@/components/landing/HotspotCarousel";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type {
  AreaSummary,
  CommunityReport,
  HotspotApiResponse,
  HotspotMarker,
  ReportsListResponse,
} from "@/types";
import { areaRegionLabel, placeLabel } from "@/lib/adminRegion";

/**
 * Public landing page for "/" — the entry point before picking a role.
 *
 * This is deliberately NOT wrapped in WorkstationLayout (that component is the dark-green
 * Operator workstation chrome: sidebar + top bar + live /api/hotspots fetching) — this page has
 * its own lightweight top bar and fetches a small amount of live data directly.
 *
 * Layout/content PATTERN (not literal content or color) is adapted from the Figma reference
 * (fileKey wasTTtlmYfsjK1ZkH1Kzim, nodeId 103:17028): hero w/ greeting-style headline + CTA +
 * illustration, a stat strip below the hero, a "new hotspot" live-feed preview, and a "citizen
 * report" preview section with cards + a "view all" link. The reference's own warm cream/orange
 * palette and fabricated numbers ("842 detections", stock photos, fake hotspot IDs) are NOT
 * reused — this page keeps AGNIBHUMI's dark-green palette (see src/app/globals.css) and only
 * shows real data from /api/hotspots and /api/reports, with honest empty/unavailable states.
 *
 * The former contents of this file (the Dashboard / Overview screen) moved to
 * src/app/operator/page.tsx unchanged — see that file for the Dashboard itself.
 *
 * Copy here intentionally mirrors the honest framing already established on
 * src/app/priority-areas/page.tsx ("indikasi, bukan konfirmasi kebakaran" / "Perlu verifikasi
 * lapangan") and src/app/data-model/page.tsx (NASA LANCE NRT latency ~120–180 menit per orbit,
 * i.e. up to ~3 jam) rather than inventing new claims.
 */

const SATELLITE_POINTS = [
  { x: 230, y: 150, r: 9, color: "#f97316" },
  { x: 170, y: 250, r: 6, color: "#facc15" },
  { x: 268, y: 258, r: 7, color: "#ef4444" },
];

function HeroVisual() {
  const { tr } = useTranslation();
  return (
    <div
      className="relative mx-auto w-full max-w-[420px] aspect-square"
      role="img"
      aria-label={tr(
        "Ilustrasi jaringan pemantauan satelit yang menyorot beberapa titik panas dan satu laporan komunitas di atas grid wilayah",
        "Illustration of a satellite monitoring network highlighting several hotspots and one community report over a regional grid"
      )}
    >
      <svg viewBox="0 0 400 400" className="w-full h-full">
        <defs>
          <radialGradient id="agn-scan-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f1f5f9" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#f1f5f9" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="400" height="400" rx="28" fill="#06352a" />
        <circle cx="200" cy="200" r="190" fill="url(#agn-scan-glow)" />

        {[60, 112, 164].map((r) => (
          <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#f1f5f9" strokeOpacity="0.12" strokeWidth="1" />
        ))}

        {Array.from({ length: 7 }).map((_, row) =>
          Array.from({ length: 7 }).map((_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={40 + col * 53}
              cy={40 + row * 53}
              r="1.6"
              fill="#f1f5f9"
              fillOpacity="0.14"
            />
          ))
        )}

        {/* Stylized orbit path + satellite */}
        <ellipse cx="200" cy="200" rx="186" ry="92" fill="none" stroke="#6ee7b7" strokeOpacity="0.35" strokeWidth="1.2" />
        <circle cx="26" cy="152" r="5" fill="#6ee7b7" />

        {/* Satellite hotspot detections — decorative, severity-colored like the FireMap legend */}
        {SATELLITE_POINTS.map((point, index) => (
          <g key={index}>
            <circle cx={point.x} cy={point.y} r={point.r + 7} fill={point.color} fillOpacity="0.16" />
            <circle cx={point.x} cy={point.y} r={point.r} fill={point.color} stroke="#fff" strokeWidth="1.5" />
          </g>
        ))}

        {/* One community report pin, same blue used by FireMap's person-icon markers */}
        <circle cx="140" cy="165" r="6.5" fill="#2563eb" stroke="#fff" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/** Live stat card — adapts the Figma reference's "Burn Activity" / "Most Burning Area" pattern,
 * but only ever shows real numbers pulled from /api/hotspots, or an honest unavailable state. */
function StatCard({
  label,
  value,
  caption,
  loading,
  unavailable,
}: {
  label: string;
  value: string;
  caption: string;
  loading: boolean;
  unavailable: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">{label}</p>
      {loading ? (
        <p className="text-2xl font-bold text-[var(--color-text-muted)] animate-pulse">{t("stats.loading")}</p>
      ) : unavailable ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("stats.unavailable")}</p>
      ) : (
        <p className="text-2xl sm:text-3xl font-bold text-[var(--color-text-main)]">{value}</p>
      )}
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{caption}</p>
    </div>
  );
}

function formatDateTime(value: string | undefined | null, language: "id" | "en", unrecordedLabel: string): string {
  if (!value) return unrecordedLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unrecordedLabel;
  const locale = language === "en" ? "en-US" : "id-ID";
  const formatted = date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
  return language === "en" ? `${formatted} (WIB)` : `${formatted} WIB`;
}

async function fetchHotspots(signal?: AbortSignal): Promise<HotspotApiResponse> {
  // Latest 10 by acquisition time, picked server-side from ALL detections (not the FRP-capped list).
  const response = await fetch("/api/hotspots?order=recent&limit=10", { signal, cache: "no-store" });
  const body = (await response.json()) as HotspotApiResponse & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Gagal memuat data titik panas.");
  return body;
}

async function fetchReports(signal?: AbortSignal): Promise<CommunityReport[]> {
  const response = await fetch("/api/reports", { signal, cache: "no-store" });
  const body = (await response.json()) as ReportsListResponse & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Gagal memuat laporan warga.");
  return body.reports;
}

export default function LandingPage() {
  const { t, tr, language } = useTranslation();
  const [markers, setMarkers] = useState<HotspotMarker[]>([]);
  const [totalDetections, setTotalDetections] = useState(0);
  const [areas, setAreas] = useState<AreaSummary[]>([]);
  const [hotspotsLoading, setHotspotsLoading] = useState(true);
  const [hotspotsUnavailable, setHotspotsUnavailable] = useState(false);

  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchHotspots(controller.signal)
      .then((body) => {
        setMarkers(body.markers ?? []);
        setTotalDetections(body.meta?.markers?.total ?? (body.markers ?? []).length);
        setAreas(body.areas ?? []);
        setHotspotsUnavailable(Boolean(body.meta?.degraded) && (body.markers ?? []).length === 0);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setHotspotsUnavailable(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHotspotsLoading(false);
      });

    fetchReports(controller.signal)
      .then((fetched) => {
        setReports(fetched);
        setReportsError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setReportsError(error instanceof Error ? error.message : "Gagal memuat laporan warga.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setReportsLoading(false);
      });

    return () => controller.abort();
  }, []);

  const highestPriorityArea = areas
    .slice()
    .sort((a, b) => (b.priorityScore ?? -Infinity) - (a.priorityScore ?? -Infinity))[0];

  // "Latest" = most recently acquired, not highest priority.
  const recentMarkers = markers
    .filter((marker) => marker.acquiredAt)
    .sort((a, b) => (b.acquiredAt ?? "").localeCompare(a.acquiredAt ?? ""))
    .slice(0, 10);

  const recentReports = reports
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  return (
    <main className="min-h-screen bg-[var(--color-bg-main)] text-[var(--color-text-main)]">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 sm:px-10 py-5 max-w-[1280px] mx-auto">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[26px] text-[var(--color-primary)]" aria-hidden="true">
            local_fire_department
          </span>
          <span className="font-semibold text-xl tracking-tight text-[var(--color-text-main)]">
            AGNIBHŪMI
          </span>
        </div>
        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-[var(--color-text-muted)]">
          <Link href="/data-model" className="hover:text-[var(--color-text-main)] transition-colors">
            {t("nav.aboutData")}
          </Link>
          <Link href="/operator" className="hover:text-[var(--color-text-main)] transition-colors">
            {t("nav.loginOfficer")}
          </Link>
          <LanguageToggle />
        </nav>
        <div className="sm:hidden">
          <LanguageToggle />
        </div>
      </header>

      {/* Hero — Figma-reference pattern: eyebrow label, headline, paragraph, CTA, illustration —
          recolored to AGNIBHUMI dark green instead of the reference's cream/orange, with the
          two role buttons (the actual point of this page) as the hero's CTA. */}
      <section className="relative overflow-hidden bg-[var(--color-primary)]">
        <div className="max-w-[1280px] mx-auto px-6 sm:px-10 py-14 sm:py-20 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-14 items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-200/80 bg-white/[0.06] border border-white/10 rounded-full px-3 py-1.5 mb-6">
              {t("hero.eyebrow")}
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.2rem] font-bold leading-[1.08] text-[var(--color-sidebar-foreground)] mb-6">
              {t("hero.headline")}
            </h1>
            <p className="text-base sm:text-lg leading-relaxed text-[var(--color-sidebar-foreground)]/75 max-w-xl mb-10">
              {t("hero.body")}
            </p>

            {/* Role selection — the centerpiece of this page */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-8">
              <Link
                href="/community"
                className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold text-[#06281e] bg-amber-400 hover:bg-amber-300 transition-colors"
              >
                {t("hero.ctaCommunity")}
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
              <Link
                href="/operator"
                className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold text-white bg-white/10 border border-white/25 hover:bg-white/15 transition-colors"
              >
                {t("hero.ctaOperator")}
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--color-sidebar-foreground)]/60">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  satellite_alt
                </span>
                {t("hero.badgeFirms")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  groups
                </span>
                {t("hero.badgeCommunity")}
              </span>
            </div>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* Live stat strip — Figma reference's "Burn Activity" / "Most Burning Area" pattern,
          with real counts from /api/hotspots (or an honest unavailable state). */}
      {/* What the NASA challenge asks for -> where it lives in the app. */}
      <section className="max-w-[1280px] mx-auto px-6 sm:px-10 pt-14 sm:pt-16">
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text-main)] mb-6">{t("challenge.title")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(
            [
              ["merge", "challenge.harmonize.title", "challenge.harmonize.body", "/map"],
              ["calendar_month", "challenge.calendar.title", "challenge.calendar.body", "/calendar"],
              ["crisis_alert", "challenge.unusual.title", "challenge.unusual.body", "/priority-areas"],
            ] as const
          ).map(([icon, title, body, href]) => (
            <Link
              key={href}
              href={href}
              className="group rounded-2xl border border-[var(--color-border)] bg-white p-6 hover:border-[var(--color-primary)] transition-colors"
            >
              <span className="material-symbols-outlined text-[26px] text-[var(--color-primary)]" aria-hidden="true">
                {icon}
              </span>
              <h3 className="mt-3 text-base font-bold text-[var(--color-text-main)]">{t(title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-muted)]">{t(body)}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)]">
                {t("challenge.open")}
                <span className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                  arrow_forward
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-[1280px] mx-auto px-6 sm:px-10 py-14 sm:py-16">
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text-main)] mb-6">
          {t("stats.title")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label={t("stats.totalDetections")}
            value={totalDetections.toLocaleString(language === "en" ? "en-US" : "id-ID")}
            caption={t("stats.totalDetectionsCaption")}
            loading={hotspotsLoading}
            unavailable={hotspotsUnavailable}
          />
          <StatCard
            label={t("stats.priorityArea")}
            value={
              highestPriorityArea
                ? areaRegionLabel(highestPriorityArea).title
                : "-"
            }
            caption={
              highestPriorityArea
                ? `Grid 0.25° · ${language === "en" ? "priority score" : "skor prioritas"} ${highestPriorityArea.priorityScore?.toFixed(1) ?? "-"}`
                : t("stats.priorityAreaNone")
            }
            loading={hotspotsLoading}
            unavailable={hotspotsUnavailable || !highestPriorityArea}
          />
          <StatCard
            label={t("stats.analyzedAreas")}
            value={String(areas.length)}
            caption={t("stats.analyzedAreasCaption")}
            loading={hotspotsLoading}
            unavailable={hotspotsUnavailable}
          />
        </div>
        {hotspotsUnavailable && !hotspotsLoading && (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            {t("stats.unavailableNote")}
          </p>
        )}
      </section>

      {/* Latest hotspots — auto-advancing carousel of real detections (see HotspotCarousel). */}
      <section className="max-w-[1280px] mx-auto px-6 sm:px-10 py-6 sm:py-10">
        <HotspotCarousel
          markers={recentMarkers}
          loading={hotspotsLoading}
          unavailable={hotspotsUnavailable}
          windowLabel={t("recentHotspots.window24h")}
        />
      </section>

      {/* Citizen report preview — adapts the Figma reference's photo-card pattern with real
          reports from /api/reports (or an honest empty state if none exist yet). */}
      <section className="max-w-[1280px] mx-auto px-6 sm:px-10 py-14 sm:py-16 border-t border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text-main)]">{t("recentReports.title")}</h2>
          <Link href="/community" className="text-sm font-semibold text-[var(--color-primary)] hover:underline">
            {t("recentReports.viewAll")}
          </Link>
        </div>

        {reportsLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t("recentReports.loading")}</p>
        ) : reportsError ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-7 text-sm text-[var(--color-text-muted)]">
            {tr("Gagal memuat laporan warga.", "Failed to load citizen reports.")}
          </div>
        ) : recentReports.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-7 text-sm text-[var(--color-text-muted)]">
            {t("recentReports.empty")}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {recentReports.map((report) => (
              <div key={report.id} className="rounded-2xl border border-[var(--color-border)] bg-white overflow-hidden flex flex-col">
                {report.photoFilename ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/reports/${report.id}/photo`}
                    alt={tr("Foto lampiran laporan warga", "Photo attached to a citizen report")}
                    className="w-full h-36 object-cover bg-[var(--color-primary-light)]"
                  />
                ) : (
                  <div className="w-full h-36 flex items-center justify-center bg-[var(--color-primary-light)]">
                    <span className="material-symbols-outlined text-[32px] text-[var(--color-primary)]/40" aria-hidden="true">
                      image_not_supported
                    </span>
                  </div>
                )}
                <div className="p-5 flex-1 flex flex-col">
                  <p className="text-xs text-[var(--color-text-muted)] mb-1">
                    {formatDateTime(report.observedAt, language, t("recentHotspots.unrecorded"))}
                  </p>
                  <p className="text-sm text-[var(--color-text-main)] leading-relaxed mb-3 flex-1">
                    {report.description}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {placeLabel(report.admin, report.lat, report.lon)}
                  </p>
                  <span className="mt-2 inline-flex w-fit items-center rounded-md bg-[var(--color-primary-light)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)]">
                    {report.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Disclaimer — same honest framing as src/app/priority-areas/page.tsx */}
      <section className="max-w-[1280px] mx-auto px-6 sm:px-10 pb-16">
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-900">
          <span className="material-symbols-outlined text-amber-600 text-xl shrink-0" aria-hidden="true">
            info
          </span>
          <p className="leading-relaxed">
            <strong className="font-semibold">{t("disclaimer.strong")}</strong>{" "}
            {t("disclaimer.body")}
          </p>
        </div>
      </section>

      <footer className="border-t border-[var(--color-border)] py-8 px-6 sm:px-10 text-center text-xs text-[var(--color-text-muted)]">
        {t("footer.tagline")}
      </footer>
    </main>
  );
}
