"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AreaSummary,
  CommunityReport,
  HotspotApiResponse,
  HotspotMarker,
  ReportsListResponse,
} from "@/types";

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
  return (
    <div
      className="relative mx-auto w-full max-w-[420px] aspect-square"
      role="img"
      aria-label="Ilustrasi jaringan pemantauan satelit yang menyorot beberapa titik panas dan satu laporan komunitas di atas grid wilayah"
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
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">{label}</p>
      {loading ? (
        <p className="text-2xl font-bold text-[var(--color-text-muted)] animate-pulse">Memuat…</p>
      ) : unavailable ? (
        <p className="text-sm text-[var(--color-text-muted)]">Data belum tersedia</p>
      ) : (
        <p className="text-2xl sm:text-3xl font-bold text-[var(--color-text-main)]">{value}</p>
      )}
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{caption}</p>
    </div>
  );
}

function formatDateTime(value: string | undefined | null): string {
  if (!value) return "Waktu tidak tercatat";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tercatat";
  return `${date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`;
}

async function fetchHotspots(signal?: AbortSignal): Promise<HotspotApiResponse> {
  const response = await fetch("/api/hotspots", { signal, cache: "no-store" });
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
  const [markers, setMarkers] = useState<HotspotMarker[]>([]);
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

  const recentMarkers = markers
    .slice()
    .sort((a, b) => (b.priorityScore ?? b.attentionScore ?? 0) - (a.priorityScore ?? a.attentionScore ?? 0))
    .slice(0, 3);

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
            Tentang data
          </Link>
          <Link href="/operator" className="hover:text-[var(--color-text-main)] transition-colors">
            Masuk sebagai petugas
          </Link>
        </nav>
      </header>

      {/* Hero — Figma-reference pattern: eyebrow label, headline, paragraph, CTA, illustration —
          recolored to AGNIBHUMI dark green instead of the reference's cream/orange, with the
          two role buttons (the actual point of this page) as the hero's CTA. */}
      <section className="relative overflow-hidden bg-[var(--color-primary)]">
        <div className="max-w-[1280px] mx-auto px-6 sm:px-10 py-14 sm:py-20 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-14 items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-200/80 bg-white/[0.06] border border-white/10 rounded-full px-3 py-1.5 mb-6">
              Intelijen satelit &amp; komunitas
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.2rem] font-bold leading-[1.08] text-[var(--color-sidebar-foreground)] mb-6">
              Memahami api dari luar angkasa, hingga ke lapangan.
            </h1>
            <p className="text-base sm:text-lg leading-relaxed text-[var(--color-sidebar-foreground)]/75 max-w-xl mb-10">
              AGNIBHŪMI menggabungkan deteksi anomali termal NASA FIRMS (MODIS &amp; VIIRS) dengan
              laporan warga di lapangan, untuk membantu siapa pun memantau dan memverifikasi
              potensi kebakaran lahan dan hutan secara lebih cepat.
            </p>

            {/* Role selection — the centerpiece of this page */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-8">
              <Link
                href="/community"
                className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold text-[#06281e] bg-amber-400 hover:bg-amber-300 transition-colors"
              >
                Jelajahi sebagai Masyarakat
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
              <Link
                href="/operator"
                className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold text-white bg-white/10 border border-white/25 hover:bg-white/15 transition-colors"
              >
                Lanjutkan sebagai Petugas
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
                Data NASA FIRMS langsung
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  groups
                </span>
                Laporan komunitas
              </span>
            </div>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* Live stat strip — Figma reference's "Burn Activity" / "Most Burning Area" pattern,
          with real counts from /api/hotspots (or an honest unavailable state). */}
      <section className="max-w-[1280px] mx-auto px-6 sm:px-10 py-14 sm:py-16">
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text-main)] mb-6">
          Aktivitas titik panas hari ini
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Total deteksi aktif"
            value={String(markers.length)}
            caption="Titik panas dari MODIS & VIIRS, 24 jam terakhir"
            loading={hotspotsLoading}
            unavailable={hotspotsUnavailable}
          />
          <StatCard
            label="Wilayah prioritas tertinggi"
            value={
              highestPriorityArea
                ? `${highestPriorityArea.gridLat.toFixed(2)}, ${highestPriorityArea.gridLon.toFixed(2)}`
                : "—"
            }
            caption={
              highestPriorityArea
                ? `Grid 0,25° · skor prioritas ${highestPriorityArea.priorityScore?.toFixed(1) ?? "—"}`
                : "Belum ada area dengan skor prioritas"
            }
            loading={hotspotsLoading}
            unavailable={hotspotsUnavailable || !highestPriorityArea}
          />
          <StatCard
            label="Area teranalisis"
            value={String(areas.length)}
            caption="Grid sel 0,25° yang dianalisis pipeline"
            loading={hotspotsLoading}
            unavailable={hotspotsUnavailable}
          />
        </div>
        {hotspotsUnavailable && !hotspotsLoading && (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Sumber data NASA FIRMS sedang tidak tersedia (kemungkinan kunci API belum dikonfigurasi) — angka
            di atas tidak ditampilkan sebagai gantinya, karena ini bukan data sungguhan.
          </p>
        )}
      </section>

      {/* New hotspot — adapts the Figma reference's live-feed carousel card with real marker
          fields (id/date/source/sensor), not fabricated hotspot IDs. */}
      <section className="max-w-[1280px] mx-auto px-6 sm:px-10 py-6 sm:py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text-main)]">Titik panas terbaru</h2>
          <Link href="/map" className="text-sm font-semibold text-[var(--color-primary)] hover:underline">
            Lihat peta lengkap
          </Link>
        </div>

        {hotspotsLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Memuat titik panas…</p>
        ) : recentMarkers.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-7 text-sm text-[var(--color-text-muted)]">
            {hotspotsUnavailable
              ? "Data belum tersedia — sumber NASA FIRMS sedang tidak dapat diakses."
              : "Tidak ada deteksi titik panas aktif saat ini."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {recentMarkers.map((marker) => (
              <div key={marker.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
                <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-1">{marker.id}</p>
                <p className="text-sm font-bold text-[var(--color-text-main)] mb-2">
                  {marker.label || `${marker.lat.toFixed(3)}, ${marker.lng.toFixed(3)}`}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Sumber: {marker.source ?? marker.sensor ?? "Tidak tercatat"}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Diambil: {formatDateTime(marker.acquiredAt)}
                </p>
                <p className="mt-2 text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
                  Tingkat: {marker.severity}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Citizen report preview — adapts the Figma reference's photo-card pattern with real
          reports from /api/reports (or an honest empty state if none exist yet). */}
      <section className="max-w-[1280px] mx-auto px-6 sm:px-10 py-14 sm:py-16 border-t border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text-main)]">Laporan warga terbaru</h2>
          <Link href="/community" className="text-sm font-semibold text-[var(--color-primary)] hover:underline">
            Lihat semua laporan
          </Link>
        </div>

        {reportsLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Memuat laporan warga…</p>
        ) : reportsError ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-7 text-sm text-[var(--color-text-muted)]">
            {reportsError}
          </div>
        ) : recentReports.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-7 text-sm text-[var(--color-text-muted)]">
            Belum ada laporan warga yang masuk.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {recentReports.map((report) => (
              <div key={report.id} className="rounded-2xl border border-[var(--color-border)] bg-white overflow-hidden flex flex-col">
                {report.photoFilename ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/reports/${report.id}/photo`}
                    alt="Foto lampiran laporan warga"
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
                  <p className="text-xs text-[var(--color-text-muted)] mb-1">{formatDateTime(report.observedAt)}</p>
                  <p className="text-sm text-[var(--color-text-main)] leading-relaxed mb-3 flex-1">
                    {report.description}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {report.lat.toFixed(3)}, {report.lon.toFixed(3)}
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
            <strong className="font-semibold">
              Titik panas satelit adalah indikator anomali termal, bukan konfirmasi kebakaran.
            </strong>{" "}
            Setiap deteksi — baik dari satelit maupun laporan komunitas — tetap memerlukan
            verifikasi lapangan sebelum dijadikan dasar tindakan. Ini bukan konfirmasi kebakaran.
          </p>
        </div>
      </section>

      <footer className="border-t border-[var(--color-border)] py-8 px-6 sm:px-10 text-center text-xs text-[var(--color-text-muted)]">
        AGNIBHŪMI — Intelijen satelit &amp; komunitas untuk pemantauan kebakaran lahan dan hutan di
        Indonesia.
      </footer>
    </main>
  );
}
