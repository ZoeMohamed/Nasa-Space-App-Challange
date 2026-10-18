"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import { getRegionOption, isDemoRange, isWithinBounds } from "@/lib/filters";
import type { AreaSummary, CommunityReport, HotspotApiResponse, HotspotMarker } from "@/types";

/**
 * Dashboard / Overview — rebuilt from Figma file wasTTtlmYfsjK1ZkH1Kzim, node 169:3496
 * ("Desktop - 7"), specifically the flat sibling node group starting at 169:7480
 * (Sidebar instance) through 169:7783 (Ground Patrol Dispatch Card), which is the
 * shipped Dashboard content on that canvas (confirmed against the local screenshot
 * "Desktop - 7.png" and the provenance notes already in globals.css referencing the
 * same node IDs for the sidebar/top bar/card tokens).
 *
 * Two kinds of content from the Figma source were deliberately NOT ported verbatim:
 *  - The "1. Time Series Chart" panel (node 169:7699) is a fabricated 7-day line chart
 *    ("1 Sep – 7 Sep 2026"). The live pipeline only has a rolling 24h NRT window with no
 *    stored history (see python-service/fire_pipeline/live.py), so this panel keeps the
 *    Figma shell (title, sensor legend swatches) but shows an honest empty state instead
 *    of inventing a trend line.
 *  - The "Sensor Confidence Harmonization Summary Note" (node 169:7770, "Harmonisasi
 *    Aktif") in Figma reads "...Keyakinan lapangan: 89,4%..." — an invented confidence
 *    number with no backing computation. It is replaced with a sentence built from real
 *    matchStatus counts on the current markers.
 * The "Ground Patrol Dispatch Card" (node 169:7783, "Tanah Laut: Prioritas Verifikasi")
 * is replaced with the actual #1 priorityRank area from the live /api/hotspots response.
 */

const FireMap = dynamic(() => import("@/components/map/FireMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100">
      <span className="font-medium text-sm text-gray-500 animate-pulse">
        Loading map…
      </span>
    </div>
  ),
});

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Illustrative-only bar heights for the Time Series demo state (non-24h ranges). A real
// implementation would source this from the NASA FIRMS Archive Download API (historical,
// not NRT) — not built here. Not derived from any real detection counts.
const DEMO_TREND_BARS = [38, 52, 44, 61, 70, 58, 66, 74, 60, 48, 55, 69, 72, 64];

async function requestHotspots(signal?: AbortSignal) {
  const response = await fetch("/api/hotspots", { signal, cache: "no-store" });
  const body = (await response.json()) as HotspotApiResponse & { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to load NASA FIRMS data.");
  }

  return body;
}

function requestErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load NASA FIRMS data.";
}

function countByMatchStatus(markers: HotspotMarker[]) {
  const counts = { MATCHED: 0, MODIS_ONLY: 0, VIIRS_ONLY: 0, UNMATCHED: 0 };
  for (const marker of markers) {
    const key = marker.matchStatus ?? "UNMATCHED";
    if (key in counts) counts[key as keyof typeof counts] += 1;
  }
  return counts;
}

function countBySeverity(markers: HotspotMarker[]) {
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const marker of markers) {
    counts[marker.severity] += 1;
  }
  return counts;
}

function DashboardPageContent() {
  const searchParams = useSearchParams();
  const activeRegion = getRegionOption(searchParams.get("region"));
  const demoRange = isDemoRange(searchParams.get("range"));

  const [allMarkers, setAllMarkers] = useState<HotspotMarker[]>([]);
  const [allAreas, setAllAreas] = useState<AreaSummary[]>([]);
  const [meta, setMeta] = useState<HotspotApiResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<CommunityReport[]>([]);

  // Citizen reports, shown as person-pin markers on the dashboard map alongside
  // satellite detections — same shared backend as /map and /citizen-reports.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !body?.reports) return;
        setReports(body.reports);
      })
      .catch(() => {
        /* best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Region filter — client-side bbox check against the already-fetched live markers/areas.
  // Bounding boxes are approximate (see src/lib/filters.ts), "Seluruh Indonesia" is a no-op.
  const markers = useMemo(
    () => allMarkers.filter((marker) => isWithinBounds(marker.lat, marker.lng, activeRegion.bounds)),
    [allMarkers, activeRegion]
  );
  const areas = useMemo(
    () => allAreas.filter((area) => isWithinBounds(area.gridLat, area.gridLon, activeRegion.bounds)),
    [allAreas, activeRegion]
  );

  useEffect(() => {
    const controller = new AbortController();

    const load = () => {
      requestHotspots(controller.signal)
        .then((body) => {
          setAllMarkers(body.markers);
          setAllAreas(body.areas);
          setMeta(body.meta);
          setError(null);
        })
        .catch((requestError: unknown) => {
          if (requestError instanceof DOMException && requestError.name === "AbortError") return;
          setError(requestErrorMessage(requestError));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    };

    load();
    const interval = window.setInterval(load, REFRESH_INTERVAL_MS);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  async function refreshHotspots() {
    setLoading(true);
    setError(null);

    try {
      const body = await requestHotspots();
      setAllMarkers(body.markers);
      setAllAreas(body.areas);
      setMeta(body.meta);
    } catch (requestError) {
      setError(requestErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  const matchCounts = useMemo(() => countByMatchStatus(markers), [markers]);
  const severityCounts = useMemo(() => countBySeverity(markers), [markers]);
  const highPriorityAreaCount = useMemo(
    () => areas.filter((area) => area.priorityTier === "high").length,
    [areas]
  );
  const topArea = useMemo(() => {
    const ranked = areas.filter((area) => area.priorityRank !== null);
    if (ranked.length === 0) return null;
    return ranked.reduce((best, area) =>
      (area.priorityRank ?? Infinity) < (best.priorityRank ?? Infinity) ? area : best
    );
  }, [areas]);

  const harmonizationSentence = useMemo(() => {
    const total = markers.length;
    if (total === 0) return null;
    const { MATCHED, MODIS_ONLY, VIIRS_ONLY, UNMATCHED } = matchCounts;
    return `Dari ${total.toLocaleString()} deteksi pada jendela 24 jam terakhir, ${MATCHED.toLocaleString()} cocok di dua sensor (MODIS + VIIRS), ${MODIS_ONLY.toLocaleString()} hanya terdeteksi MODIS, ${VIIRS_ONLY.toLocaleString()} hanya terdeteksi VIIRS, dan ${UNMATCHED.toLocaleString()} belum tertandai. Harmonisasi mengurangi penghitungan ganda, bukan mengonfirmasi kejadian kebakaran.`;
  }, [markers, matchCounts]);

  return (
    <WorkstationLayout activeTab="Dashboard">
      <div className="max-w-[1400px] mx-auto space-y-6">

        {/* Field verification notice — consistent wording with src/app/priority-areas/page.tsx */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900">
          <span className="material-symbols-outlined text-amber-600 text-base shrink-0">info</span>
          <p>
            Deteksi satelit adalah indikasi, bukan konfirmasi kebakaran. Perlu verifikasi lapangan sebelum tindak lanjut.
          </p>
        </div>

        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-main)] mb-2">Dashboard</h1>
            <p className="text-sm text-[var(--color-text-muted)] max-w-2xl">
              Pantau aktivitas kebakaran terkini, data sensor yang diharmonisasi, dan area yang memerlukan perhatian lebih lanjut.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshHotspots()}
            disabled={loading}
            className="h-9 px-4 bg-white border border-[var(--color-border)] rounded-lg text-sm font-medium text-blue-600 shadow-sm hover:bg-gray-50 disabled:text-gray-400 shrink-0"
          >
            Refresh
          </button>
        </div>

        <div className="min-h-6 flex items-center gap-2 text-xs" aria-live="polite">
          <span
            className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : loading ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`}
          />
          <span className={error ? "text-red-600" : "text-[var(--color-text-muted)]"}>
            {error
              ? error
              : loading
                ? "NASA live → Python processing…"
                : meta
                  ? `Wilayah: ${meta.area} • Jendela: ${meta.windowHours} jam terakhir • Diperbarui ${new Date(meta.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
          </span>
          {!loading && !error && meta && (
            <span
              className={meta.degraded ? "text-amber-600" : "text-gray-400"}
              title="Jumlah ini berasal langsung dari NASA FIRMS dan bisa naik-turun antar pemuatan karena jadwal lintasan satelit yang sesungguhnya — bukan bug."
            >
              •{" "}
              {Object.entries(
                meta.sources.reduce<Record<string, { count: number; allAvailable: boolean }>>((acc, source) => {
                  const entry = acc[source.sensor] ?? { count: 0, allAvailable: true };
                  entry.count += source.available ? source.highConfidenceCount : 0;
                  entry.allAvailable = entry.allAvailable && source.available;
                  acc[source.sensor] = entry;
                  return acc;
                }, {})
              )
                .map(([sensor, { count, allAvailable }]) => `${sensor} ${count}${allAvailable ? "" : " (sebagian gagal)"}`)
                .join(" · ")}
            </span>
          )}
        </div>

        {/* Map panel */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-4 pb-0">
            <div>
              <h3 className="font-bold text-[var(--color-text-main)]">Peta Deteksi</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Titik panas langsung dari NASA FIRMS, diproses oleh Python fire pipeline.
              </p>
            </div>
          </div>
          <div className="relative h-[420px] m-4 rounded-lg overflow-hidden border border-[var(--color-border)]">
            <FireMap
              markers={markers}
              center={[-2.2, 118]}
              zoom={5}
              className="h-full w-full"
              reports={reports.map((r) => ({
                id: r.id,
                lat: r.lat,
                lng: r.lon,
                status: r.status,
                description: r.description,
                createdAt: r.createdAt,
              }))}
            />

            {/* Detection legend — real matchStatus counts, mirrors Figma's floating
                "Bottom-Right Floating Quick Legend" (node 169:7619) panel layout */}
            <div className="absolute top-3 right-3 z-[1000] w-64 bg-white border border-[var(--color-border)] rounded-lg shadow-lg p-4 text-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-[var(--color-text-main)] tracking-wide text-[11px]">
                  DETECTION LEGEND
                </span>
                <Badge tone="neutral">EPSG:4326</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Harmonized (MODIS + VIIRS)</span>
                  <span className="font-semibold text-[var(--color-text-main)]">{matchCounts.MATCHED}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">MODIS only</span>
                  <span className="font-semibold text-[var(--color-text-main)]">{matchCounts.MODIS_ONLY}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">VIIRS only</span>
                  <span className="font-semibold text-[var(--color-text-main)]">{matchCounts.VIIRS_ONLY}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Unmatched telemetry</span>
                  <span className="font-semibold text-[var(--color-text-main)]">{matchCounts.UNMATCHED}</span>
                </div>
              </div>
              <div className="h-px bg-[var(--color-border)] my-3" />
              <div className="font-bold text-[11px] tracking-wide text-[var(--color-text-main)] mb-2">SEVERITY</div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                    <span className="w-2 h-2 rounded-full bg-red-600" /> High
                  </span>
                  <span className="font-semibold text-[var(--color-text-main)]">{severityCounts.HIGH}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                    <span className="w-2 h-2 rounded-full bg-orange-400" /> Medium
                  </span>
                  <span className="font-semibold text-[var(--color-text-main)]">{severityCounts.MEDIUM}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                    <span className="w-2 h-2 rounded-full bg-yellow-400" /> Low
                  </span>
                  <span className="font-semibold text-[var(--color-text-main)]">{severityCounts.LOW}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Map Summary */}
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-main)] mb-4">Map Summary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              icon="local_fire_department"
              iconTone="red"
              label="Total Hotspots"
              value={markers.length.toLocaleString()}
              caption={`Jendela ${meta?.windowHours ?? 24} jam terakhir`}
            />
            <StatTile
              icon="location_on"
              iconTone="blue"
              label="Areas Affected"
              value={areas.length.toLocaleString()}
              caption="Grid 0.25° dengan deteksi aktif"
            />
            <StatTile
              icon="warning"
              iconTone="amber"
              label="High-Priority Areas"
              value={highPriorityAreaCount.toLocaleString()}
              caption="Menyarankan verifikasi lapangan segera"
            />
            <StatTile
              icon="verified"
              iconTone="green"
              label="Sensor Harmonization"
              value={`${matchCounts.MATCHED.toLocaleString()} / ${markers.length.toLocaleString()}`}
              caption="Terverifikasi dua sensor (MODIS + VIIRS)"
            />
          </div>
        </div>

        {/* Analytic Insights */}
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-main)] mb-4">Analytic Insights</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Time Series — honest empty state when range=24h (the only live-backed range);
                demo-labeled illustrative bars for any other range selection. A real implementation
                of the non-24h ranges would source this from NASA FIRMS Archive Download API
                (historical, not NRT) — not built here, see python-service/fire_pipeline/live.py. */}
            <Card className="p-5 flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-[var(--color-text-main)] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[var(--color-text-muted)]">show_chart</span>
                  Time Series
                  {demoRange && (
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
                      Contoh data
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-3 text-[11px] font-medium text-[var(--color-text-muted)]">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-emerald-600 inline-block" /> Harmonized</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-blue-500 inline-block" /> MODIS</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-orange-500 inline-block" /> VIIRS</span>
                </div>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">
                Tren deteksi harian terharmonisasi (MODIS + VIIRS)
              </p>
              {demoRange ? (
                <div className="flex-1 min-h-[176px] flex flex-col gap-3 rounded-lg border border-dashed border-amber-200 bg-amber-50/50 p-4">
                  <p className="text-xs text-amber-800">
                    Rentang waktu ini memerlukan data historis — menampilkan contoh ilustratif, bukan data langsung.
                  </p>
                  <div className="flex-1 flex items-end gap-1.5 px-1">
                    {DEMO_TREND_BARS.map((height, index) => (
                      <div
                        key={index}
                        className="flex-1 rounded-t bg-emerald-300/70"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-[176px] flex items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-gray-50 p-6 text-center">
                  <p className="text-xs text-[var(--color-text-muted)] max-w-xs">
                    Grafik tren memerlukan data historis multi-hari yang belum tersedia. Pipeline saat ini hanya menyediakan jendela NRT 24 jam terakhir, tanpa penyimpanan riwayat.
                  </p>
                </div>
              )}
            </Card>

            {/* Harmonisasi Aktif — replaces Figma's fabricated "Keyakinan lapangan: 89,4%" copy
                with a sentence computed from real matchStatus counts. */}
            <Card className="p-5 bg-emerald-50/60 border-emerald-100 flex flex-col">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-emerald-600 bg-white rounded-lg p-2 text-xl shrink-0">verified</span>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-[var(--color-text-main)]">Harmonisasi Aktif</h3>
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--color-text-main)]/80">
                    {harmonizationSentence ?? "Belum ada deteksi pada jendela saat ini untuk dihitung harmonisasinya."}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Priority area teaser — replaces Figma's fabricated "Tanah Laut: Prioritas
            Verifikasi" example with the real #1 priorityRank area, or an honest empty state. */}
        {topArea ? (
          <Card className="p-5 bg-red-50 border-red-100">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[#f04438] bg-white rounded-lg p-2 text-xl shrink-0">crisis_alert</span>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-[var(--color-text-main)]">
                      Grid {topArea.gridLat.toFixed(2)}, {topArea.gridLon.toFixed(2)} — Prioritas Verifikasi
                    </h3>
                    <Badge tone="high">#{topArea.priorityRank}</Badge>
                  </div>
                  <p className="text-xs text-[var(--color-text-main)]/70">
                    {topArea.consecutiveActiveDays !== null && topArea.consecutiveActiveDays > 0
                      ? `${topArea.consecutiveActiveDays} hari berturut-turut aktif`
                      : "Baru terdeteksi pada jendela ini"}
                    {topArea.frpSum !== null ? ` • FRP ${topArea.frpSum.toFixed(1)} MW` : ""}
                    {" — rekomendasi: prioritaskan verifikasi lapangan."}
                  </p>
                </div>
              </div>
              <Link
                href="/priority-areas"
                className="shrink-0 px-5 py-2 bg-[#f04438] text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-red-600 transition-colors"
              >
                Tinjau
              </Link>
            </div>
          </Card>
        ) : (
          <Card className="p-5 text-center text-sm text-[var(--color-text-muted)]">
            {loading
              ? "Memuat area prioritas…"
              : "Tidak ada area prioritas pada jendela ini — belum ada deteksi yang memenuhi kriteria penilaian, atau sumber data belum dikonfigurasi."}
          </Card>
        )}

      </div>
    </WorkstationLayout>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardPageContent />
    </Suspense>
  );
}
