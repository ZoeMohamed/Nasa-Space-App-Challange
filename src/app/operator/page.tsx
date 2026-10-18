"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import { getRegionOption, getRangeOption, isDemoRange, isWithinBounds } from "@/lib/filters";
import type { AreaSummary, CommunityReport, HistoricalCalendarResponse, HistoricalMonth, HotspotApiResponse, HotspotMarker } from "@/types";


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
  const activeRange = getRangeOption(searchParams.get("range"));
  const demoRange = isDemoRange(searchParams.get("range"));

  const [allMarkers, setAllMarkers] = useState<HotspotMarker[]>([]);
  const [allAreas, setAllAreas] = useState<AreaSummary[]>([]);
  const [meta, setMeta] = useState<HotspotApiResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [historicalMonths, setHistoricalMonths] = useState<HistoricalMonth[]>([]);
  const [historicalLoading, setHistoricalLoading] = useState(false);


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

  // Fetch real multi-year monthly historical data when a non-24h demoRange is selected
  useEffect(() => {
    if (!demoRange) return;
    const controller = new AbortController();
    // Avoid calling setState synchronously in the effect body (react-hooks/set-state-in-effect)
    // — same pattern used elsewhere in this app (see src/app/priority-areas/page.tsx): defer
    // the "started loading" flip into a microtask instead of setting it inline here.
    queueMicrotask(() => {
      if (!controller.signal.aborted) setHistoricalLoading(true);
    });

    const params = new URLSearchParams();
    if (activeRegion.bounds) {
      params.set("min_lat", activeRegion.bounds.minLat.toString());
      params.set("max_lat", activeRegion.bounds.maxLat.toString());
      params.set("min_lon", activeRegion.bounds.minLon.toString());
      params.set("max_lon", activeRegion.bounds.maxLon.toString());
    }

    fetch(`/api/historical${params.toString() ? `?${params.toString()}` : ""}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: HistoricalCalendarResponse | null) => {
        if (!body?.months) return;
        setHistoricalMonths(body.months.slice(-10));
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => {
        setHistoricalLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [demoRange, activeRegion]);

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

  const timeSeriesData = useMemo(() => {
    if (demoRange && historicalMonths.length > 0) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
      return historicalMonths.map((m) => ({
        label: `${monthNames[m.month - 1]} '${String(m.year).slice(2)}`,
        fullLabel: `${monthNames[m.month - 1]} ${m.year}`,
        harmonized: m.detections,
        modis: m.modisDetections,
        viirs: m.viirsDetections,
        overlap: m.modisDetections > 0 && m.viirsDetections > 0
          ? Math.max(0, (m.modisDetections + m.viirsDetections) - m.detections)
          : 0,
      }));
    }

    // 24h NRT Live Satellite Overpass Bins (8 x 3-hour windows in UTC)
    const bins = [
      { start: 0, end: 3, label: "00-03", fullLabel: "00:00 - 03:00 UTC", harmonized: 0, modis: 0, viirs: 0, matched: 0 },
      { start: 3, end: 6, label: "03-06", fullLabel: "03:00 - 06:00 UTC", harmonized: 0, modis: 0, viirs: 0, matched: 0 },
      { start: 6, end: 9, label: "06-09", fullLabel: "06:00 - 09:00 UTC", harmonized: 0, modis: 0, viirs: 0, matched: 0 },
      { start: 9, end: 12, label: "09-12", fullLabel: "09:00 - 12:00 UTC", harmonized: 0, modis: 0, viirs: 0, matched: 0 },
      { start: 12, end: 15, label: "12-15", fullLabel: "12:00 - 15:00 UTC", harmonized: 0, modis: 0, viirs: 0, matched: 0 },
      { start: 15, end: 18, label: "15-18", fullLabel: "15:00 - 18:00 UTC", harmonized: 0, modis: 0, viirs: 0, matched: 0 },
      { start: 18, end: 21, label: "18-21", fullLabel: "18:00 - 21:00 UTC", harmonized: 0, modis: 0, viirs: 0, matched: 0 },
      { start: 21, end: 24, label: "21-24", fullLabel: "21:00 - 24:00 UTC", harmonized: 0, modis: 0, viirs: 0, matched: 0 },
    ];

    for (const marker of markers) {
      if (!marker.acquiredAt) continue;
      const hour = new Date(marker.acquiredAt).getUTCHours();
      const binIdx = Math.min(7, Math.max(0, Math.floor(hour / 3)));
      const bin = bins[binIdx];

      if (marker.sensor === "MODIS") bin.modis += 1;
      if (marker.sensor === "VIIRS") bin.viirs += 1;
      if (marker.matchStatus === "MATCHED") bin.matched += 1;
    }

    return bins.map((bin) => {
      const matchedPairs = Math.round(bin.matched / 2);
      const unmatched = (bin.modis + bin.viirs) - bin.matched;
      const harmonized = matchedPairs + Math.max(0, unmatched);
      return {
        label: bin.label,
        fullLabel: bin.fullLabel,
        harmonized: Math.max(harmonized, Math.max(bin.modis, bin.viirs) > 0 ? Math.max(bin.modis, bin.viirs) : 0),
        modis: bin.modis,
        viirs: bin.viirs,
        overlap: bin.matched > 0 ? matchedPairs : 0,
      };
    });
  }, [demoRange, historicalMonths, markers]);

  const timeSeriesSummary = useMemo(() => {
    let maxVal = 0;
    let peakLabel = "-";
    let totalHarmonized = 0;
    let totalModis = 0;
    let totalViirs = 0;

    for (const item of timeSeriesData) {
      totalHarmonized += item.harmonized;
      totalModis += item.modis;
      totalViirs += item.viirs;
      const localMax = Math.max(item.harmonized, item.modis, item.viirs);
      if (localMax > maxVal) {
        maxVal = localMax;
        peakLabel = item.fullLabel;
      }
    }

    return {
      maxVal: maxVal > 0 ? maxVal : 1,
      peakLabel,
      totalHarmonized,
      totalModis,
      totalViirs,
    };
  }, [timeSeriesData]);

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

            {/* Time Series — Interactive Multi-Series Harmonized + MODIS + VIIRS Visualizer */}
            <Card className="p-5 flex flex-col bg-white border border-[var(--color-border)] shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0 shadow-xs">
                    <svg
                      className="w-4.5 h-4.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 3v18h18" />
                      <path d="m19 9-5 5-4-4-3 3" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-[var(--color-text-main)] text-sm md:text-base flex items-center gap-2">
                      Time Series
                      <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                        {demoRange ? "Arsip Historis" : "NRT 24 Jam"}
                      </span>
                      {demoRange && historicalLoading && (
                        <span className="text-[10px] font-medium normal-case text-[var(--color-text-muted)] animate-pulse">
                          Memuat arsip…
                        </span>
                      )}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[11px] font-medium text-[var(--color-text-muted)]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
                    <span className="text-[var(--color-text-main)] font-semibold">Harmonized</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
                    <span>MODIS</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" />
                    <span>VIIRS</span>
                  </span>
                </div>
              </div>

              <p className="text-xs text-[var(--color-text-muted)] mb-3">
                Tren deteksi harian terharmonisasi (MODIS + VIIRS) • {demoRange ? `Agregasi bulanan ${activeRange.label}` : "Per jendela orbit satelit (UTC)"}
              </p>

              {/* Chart Canvas Area */}
              <div className="relative flex-1 min-h-[190px] pt-4 pb-1 flex flex-col justify-end bg-gradient-to-b from-gray-50/60 to-white rounded-lg border border-[var(--color-border)] px-2 sm:px-4">
                {/* Background horizontal guideline lines */}
                <div className="absolute inset-x-2 sm:inset-x-4 top-4 bottom-7 flex flex-col justify-between pointer-events-none select-none opacity-40">
                  <div className="border-b border-dashed border-gray-300 w-full flex justify-end">
                    <span className="text-[9px] text-gray-500 -mt-3.5 bg-white/80 px-1 rounded">
                      {timeSeriesSummary.maxVal}
                    </span>
                  </div>
                  <div className="border-b border-dashed border-gray-200 w-full flex justify-end">
                    <span className="text-[9px] text-gray-400 -mt-3.5 bg-white/80 px-1 rounded">
                      {Math.round(timeSeriesSummary.maxVal * 0.5)}
                    </span>
                  </div>
                  <div className="border-b border-gray-200 w-full" />
                </div>

                {/* Bars columns */}
                <div className="relative z-10 flex-1 flex items-end justify-between gap-1 sm:gap-2 pb-6">
                  {timeSeriesData.map((slot, idx) => {
                    const isHovered = hoveredIndex === idx;
                    const max = timeSeriesSummary.maxVal;
                    const harmHeight = slot.harmonized > 0 ? Math.max(6, (slot.harmonized / max) * 100) : 0;
                    const modisHeight = slot.modis > 0 ? Math.max(6, (slot.modis / max) * 100) : 0;
                    const viirsHeight = slot.viirs > 0 ? Math.max(6, (slot.viirs / max) * 100) : 0;

                    return (
                      <div
                        key={idx}
                        onMouseEnter={() => setHoveredIndex(idx)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        className={`group relative flex-1 h-full flex flex-col justify-end items-center cursor-pointer rounded-t transition-colors ${
                          isHovered ? "bg-emerald-50/70" : "hover:bg-gray-50/60"
                        }`}
                      >
                        {/* Hover Tooltip */}
                        {isHovered && (
                          <div className="absolute bottom-[calc(100%+8px)] z-30 pointer-events-none -translate-x-1/2 left-1/2 min-w-[150px] bg-gray-900/95 text-white text-[11px] rounded-lg p-2.5 shadow-xl backdrop-blur-xs border border-gray-700 animate-in fade-in duration-150">
                            <div className="font-semibold text-gray-200 border-b border-gray-700/80 pb-1 mb-1.5 flex justify-between items-center">
                              <span>{slot.fullLabel}</span>
                              <span className="text-[10px] text-emerald-400">
                                {slot.overlap > 0 ? `${slot.overlap} cocok` : "NRT"}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-emerald-300 font-medium">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                  Harmonized:
                                </span>
                                <span>{slot.harmonized.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center text-blue-300">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                                  MODIS:
                                </span>
                                <span>{slot.modis.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center text-orange-300">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                                  VIIRS:
                                </span>
                                <span>{slot.viirs.toLocaleString()}</span>
                              </div>
                            </div>
                            <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                          </div>
                        )}

                        {/* 3 Grouped Bars: Harmonized, MODIS, VIIRS */}
                        <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 px-0.5 h-full">
                          {/* Harmonized Bar */}
                          <div
                            className="flex-1 max-w-[14px] bg-emerald-600 rounded-t transition-all duration-300 group-hover:brightness-110 shadow-xs"
                            style={{ height: `${harmHeight}%` }}
                            title={`Harmonized: ${slot.harmonized}`}
                          />
                          {/* MODIS Bar */}
                          <div
                            className="flex-1 max-w-[14px] bg-blue-500/85 rounded-t transition-all duration-300 group-hover:brightness-110 shadow-xs"
                            style={{ height: `${modisHeight}%` }}
                            title={`MODIS: ${slot.modis}`}
                          />
                          {/* VIIRS Bar */}
                          <div
                            className="flex-1 max-w-[14px] bg-orange-500/85 rounded-t transition-all duration-300 group-hover:brightness-110 shadow-xs"
                            style={{ height: `${viirsHeight}%` }}
                            title={`VIIRS: ${slot.viirs}`}
                          />
                        </div>

                        {/* X-axis Label */}
                        <span
                          className={`absolute -bottom-5 text-[10px] truncate max-w-full font-medium transition-colors ${
                            isHovered
                              ? "text-emerald-700 font-bold scale-105"
                              : "text-[var(--color-text-muted)]"
                          }`}
                        >
                          {slot.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Quick Metric Chips */}
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-emerald-800 font-medium">Harmonisasi Total</div>
                  <div className="text-sm font-bold text-emerald-700">
                    {timeSeriesSummary.totalHarmonized.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-emerald-600/80">deduplikasi sensor</div>
                </div>

                <div className="bg-gray-50 border border-gray-200/80 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-[var(--color-text-muted)] font-medium">Puncak Deteksi</div>
                  <div className="text-xs font-bold text-[var(--color-text-main)] truncate" title={timeSeriesSummary.peakLabel}>
                    {timeSeriesSummary.peakLabel}
                  </div>
                  <div className="text-[9px] text-[var(--color-text-muted)]">jendela teraktif</div>
                </div>

                <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-blue-900 font-medium">Rasio Sensor</div>
                  <div className="text-xs font-bold text-blue-800">
                    {timeSeriesSummary.totalModis} : {timeSeriesSummary.totalViirs}
                  </div>
                  <div className="text-[9px] text-blue-600/80">MODIS vs VIIRS</div>
                </div>
              </div>
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
