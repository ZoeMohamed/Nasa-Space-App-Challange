"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import StatTile from "@/components/ui/StatTile";
import type { CommunityReport, HotspotApiResponse, HotspotMarker, ReportStatus, ReportsListResponse } from "@/types";
import { formatAdminFull, placeLabel } from "@/lib/adminRegion";
import MapLoadingText from "@/components/map/MapLoadingText";
import { useTranslation, pick, type Language } from "@/lib/i18n/LanguageContext";

const FireMap = dynamic(() => import("@/components/map/FireMap"), { ssr: false });

/**
 * Citizen / Community Report — officer-side validation dashboard.
 *
 * This now talks to the REAL community-reports backend (python-service/fire_pipeline/reports.py,
 * proxied via src/app/api/reports/route.ts and src/app/api/reports/[id]/route.ts) instead of the
 * illustrative DEMO_REPORTS this page previously shipped with. Report submission and photo
 * capture happen on the separate public Community View (src/app/community/) — this screen is
 * the officer-facing review/validation surface: list real reports, drill into one, see which
 * live satellite detections it correlates with, and update its review status.
 *
 * Dropped vs. the old demo version (intentionally, not an oversight):
 *   - the fake "AI pre-check" confidence percentages (e.g. "Indikasi api · 92%") — the real
 *     backend has no AI inference step over report photos, so showing a number here would be
 *     fabricated data dressed up as a real signal.
 *   - the fake reporter handles ("Warga #082") — the backend only stores an opaque
 *     `submitterToken`, which is what's shown instead.
 *   - the "Semua kategori" / "7 hari terakhir" filter chips — purely decorative in the demo;
 *     the real API only supports filtering by status (and submitterToken), so only real filters
 *     are offered now.
 *   - per-row "Satelit" / sensor column in the table — the list endpoint deliberately omits
 *     `satelliteLinks` (only the single-report detail fetch includes it), so that correlation is
 *     now shown in the detail panel once a report is selected, not guessed at in the table.
 *
 * IMPORTANT — the backend's PATCH /api/reports/{id} endpoint (status updates) has NO
 * authentication or access control at all. That's a deliberate, approved decision for this
 * project stage, not a bug — but it means anyone with this page's URL can change a report's
 * status. See <NoAccessControlBanner /> below, which says so plainly to the operator.
 */

const STATUS_ORDER: ReportStatus[] = ["submitted", "under_review", "satellite_matched", "verified", "rejected"];

const STATUS_LABEL: Record<ReportStatus, readonly [string, string]> = {
  submitted: ["Baru masuk", "New"],
  under_review: ["Sedang ditinjau", "Under review"],
  satellite_matched: ["Cocok dengan satelit", "Satellite match"],
  verified: ["Terverifikasi", "Verified"],
  rejected: ["Ditolak", "Rejected"],
};

const STATUS_STYLE: Record<ReportStatus, { bg: string; text: string; dot: string }> = {
  submitted: { bg: "bg-[#fff0dd]", text: "text-[#b96016]", dot: "#b96016" },
  under_review: { bg: "bg-blue-50", text: "text-blue-700", dot: "#2563eb" },
  satellite_matched: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "#4338ca" },
  verified: { bg: "bg-[#eef5f1]", text: "text-[#075640]", dot: "#075640" },
  rejected: { bg: "bg-gray-100", text: "text-gray-600", dot: "#6b7280" },
};

const STATUS_FILTERS: ("all" | ReportStatus)[] = ["all", ...STATUS_ORDER];


function formatDateTime(value: string | null | undefined, language: Language): string {
  if (!value) return pick(language, "Tidak tercatat", "Not recorded");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return pick(language, "Tidak tercatat", "Not recorded");
  return `${date.toLocaleString(language === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`;
}

async function fetchReports(signal?: AbortSignal): Promise<CommunityReport[]> {
  const response = await fetch("/api/reports", { cache: "no-store", signal });
  const body = (await response.json()) as ReportsListResponse & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "");
  }
  return body.reports;
}

async function fetchReportDetail(id: string, signal?: AbortSignal): Promise<CommunityReport> {
  const response = await fetch(`/api/reports/${id}`, { cache: "no-store", signal });
  const body = (await response.json()) as CommunityReport & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "");
  }
  return body;
}

async function fetchHotspotMarkers(signal?: AbortSignal, near?: { lat: number; lon: number }): Promise<HotspotMarker[]> {
  try {
    // Near a report: every detection within 10 km (the correlation radius is 5 km), not the
    // FRP-capped national list, so the report's linked detections are always resolvable.
    const query = near ? `?nearLat=${near.lat}&nearLon=${near.lon}&nearKm=10&limit=5000` : "";
    const response = await fetch(`/api/hotspots${query}`, { cache: "no-store", signal });
    if (!response.ok) return [];
    const body = (await response.json()) as HotspotApiResponse;
    return body.markers ?? [];
  } catch {
    return [];
  }
}

async function patchReportStatus(
  id: string,
  status: ReportStatus,
  reviewNote: string
): Promise<CommunityReport> {
  const response = await fetch(`/api/reports/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, reviewNote: reviewNote.trim() || undefined }),
  });
  const body = (await response.json()) as CommunityReport & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "");
  }
  return body;
}

function NoAccessControlBanner() {
  const { tr } = useTranslation();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#f5d9b0] bg-[#fff7ec] p-4">
      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-[#b96016]">lock_open</span>
      <div>
        <p className="text-sm font-bold text-[#8a4b0f]">
          {tr("Belum ada proteksi akses pada aksi ubah status", "Status changes are not access-protected yet")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[#8a4b0f]/90">
          {tr(
            "Laporan di halaman ini sudah data sungguhan dari backend, dan tombol di bawah benar-benar mengubah status laporan tersebut. Namun endpoint pembaruan status belum punya autentikasi atau kontrol akses apa pun — siapa pun yang memiliki tautan halaman ini bisa memanggil API yang sama dan mengubah status laporan warga. Ini keputusan sadar untuk tahap proyek saat ini, bukan kelalaian — tambahkan proteksi akses sebelum dipakai di luar lingkungan tepercaya.",
            "The reports on this page are real backend data, and the buttons below really change a report's status. But the status-update endpoint has no authentication or access control yet — anyone with this page's link could call the same API and change a citizen report's status. This is a deliberate choice for the current project stage, not an oversight — add access protection before using it outside a trusted environment."
          )}
        </p>
      </div>
    </div>
  );
}

function StatusPill({ status, className = "" }: { status: ReportStatus; className?: string }) {
  const { tr } = useTranslation();
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex w-fit items-center rounded-md px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text} ${className}`}>
      {tr(...STATUS_LABEL[status])}
    </span>
  );
}

export default function CitizenReportsPage() {
  const { tr, language } = useTranslation();
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [hotspotMarkers, setHotspotMarkers] = useState<HotspotMarker[]>([]);
  const [nearDetailMarkers, setNearDetailMarkers] = useState<HotspotMarker[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [detail, setDetail] = useState<CommunityReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [pendingStatus, setPendingStatus] = useState<ReportStatus>("under_review");
  const [reviewNote, setReviewNote] = useState("");
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  // Manual (re)load, used by the "Segarkan" / "Coba lagi" buttons — a plain event-handler
  // function, not an effect, so it's fine for it to set state synchronously.
  const refreshReports = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const fetched = await fetchReports();
      setReports(fetched);
      setSelectedId((current) => current ?? (fetched.length > 0 ? fetched[0].id : null));
    } catch (error) {
      setListError(error instanceof Error && error.message ? error.message : tr("Gagal memuat laporan warga.", "Failed to load citizen reports."));
    } finally {
      setListLoading(false);
    }
  }, [tr]);

  // Select a report for the detail panel. A plain event-handler function (called from the map
  // marker click / table row click), not an effect, so it can set state synchronously.
  const selectReport = useCallback(
    (id: string) => {
      if (id !== selectedId) {
        setDetailLoading(true);
        setDetailError(null);
        setUpdateError(null);
        setUpdateSuccess(null);
      }
      setSelectedId(id);
    },
    [selectedId]
  );

  // Initial load on mount. All state updates happen inside the promise's .then/.catch/.finally
  // callbacks (not synchronously in the effect body) to avoid cascading renders during the
  // effect itself — same pattern as src/app/priority-areas/page.tsx.
  useEffect(() => {
    const controller = new AbortController();
    fetchReports(controller.signal)
      .then((fetched) => {
        setReports(fetched);
        setListError(null);
        setSelectedId((current) => current ?? (fetched.length > 0 ? fetched[0].id : null));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setListError(error instanceof Error && error.message ? error.message : pick(language, "Gagal memuat laporan warga.", "Failed to load citizen reports."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });
    fetchHotspotMarkers(controller.signal).then(setHotspotMarkers);
    return () => controller.abort();
    // Initial load only; the error text language is whatever was active at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetchReportDetail(selectedId, controller.signal)
      .then((data) => {
        setDetail(data);
        fetchHotspotMarkers(controller.signal, { lat: data.lat, lon: data.lon }).then(setNearDetailMarkers);
        setDetailError(null);
        setPendingStatus(data.status);
        setReviewNote(data.reviewNote ?? "");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDetailError(error instanceof Error && error.message ? error.message : pick(language, "Gagal memuat detail laporan.", "Failed to load report details."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const hotspotById = useMemo(() => {
    const map = new Map<string, HotspotMarker>();
    hotspotMarkers.forEach((marker) => map.set(marker.id, marker));
    nearDetailMarkers.forEach((marker) => map.set(marker.id, marker));
    return map;
  }, [hotspotMarkers, nearDetailMarkers]);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter((report) => {
      const matchesQuery =
        !query ||
        report.id.toLowerCase().includes(query) ||
        report.description.toLowerCase().includes(query) ||
        report.submitterToken.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || report.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [reports, search, statusFilter]);

  // Citizen reports render as real person-pin markers (same shape/legend as
  // Community View and the operator map), not disguised as fake satellite
  // detections — a triangle "unknown sensor" marker would have misleadingly
  // implied these came from MODIS/VIIRS. Real nearby satellite detections
  // (hotspotMarkers, already fetched) are shown alongside for context.
  const reportPins = useMemo(
    () =>
      filteredReports.map((report) => ({
        id: report.id,
        lat: report.lat,
        lng: report.lon,
        status: report.status,
        description: report.description,
        createdAt: report.createdAt,
      })),
    [filteredReports]
  );

  const total = reports.length;
  const needsReview = reports.filter((r) => r.status === "submitted" || r.status === "under_review").length;
  const satelliteMatched = reports.filter((r) => r.status === "satellite_matched").length;
  const verified = reports.filter((r) => r.status === "verified").length;

  async function handleUpdateStatus() {
    if (!detail) return;
    setUpdateLoading(true);
    setUpdateError(null);
    setUpdateSuccess(null);
    try {
      const updated = await patchReportStatus(detail.id, pendingStatus, reviewNote);
      setDetail(updated);
      setReports((current) => current.map((r) => (r.id === updated.id ? { ...r, ...updated, satelliteLinks: r.satelliteLinks } : r)));
      setUpdateSuccess(tr(`Status diperbarui menjadi "${STATUS_LABEL[updated.status][0]}".`, `Status updated to "${STATUS_LABEL[updated.status][1]}".`));
    } catch (error) {
      setUpdateError(error instanceof Error && error.message ? error.message : tr("Gagal memperbarui status laporan.", "Failed to update the report status."));
    } finally {
      setUpdateLoading(false);
    }
  }

  return (
    <WorkstationLayout activeTab="Citizen Reports">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <NoAccessControlBanner />

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-[#075640]">
              {tr("Pemantauan Partisipatif", "Participatory Monitoring")}
            </span>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">{tr("Laporan Warga", "Citizen / Community Reports")}</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              {tr(
                "Laporan warga melengkapi deteksi satelit. Petugas meninjau tiap laporan dan menentukan status validasi akhir.",
                "Citizen reports complement satellite detections. Officers review each report and decide its final validation status."
              )}
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-[#eef5f1] px-3 py-1.5 text-xs font-semibold text-[#075640]">
            {tr("DATA LANGSUNG", "LIVE DATA")}
          </span>
        </div>

        {listError && (
          <Card className="flex items-start gap-3 border-red-200 bg-red-50 p-4">
            <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-red-600">error</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">{tr("Gagal memuat laporan warga", "Failed to load citizen reports")}</p>
              <p className="mt-1 text-xs text-red-600">{listError}</p>
            </div>
            <button
              type="button"
              onClick={() => refreshReports()}
              className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              {tr("Coba lagi", "Try again")}
            </button>
          </Card>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label={tr("Total laporan", "Total reports")} value={listLoading ? "…" : total} caption={tr("Seluruh laporan warga", "All citizen reports")} />
          <StatTile
            label={tr("Perlu ditinjau", "Needs review")}
            value={<span className="text-[#b96016]">{listLoading ? "…" : needsReview}</span>}
            caption={tr("Baru masuk / sedang ditinjau", "New / under review")}
          />
          <StatTile label={tr("Cocok dengan satelit", "Satellite match")} value={listLoading ? "…" : satelliteMatched} caption={tr("Terkait deteksi MODIS / VIIRS", "Linked to MODIS / VIIRS detections")} />
          <StatTile label={tr("Terverifikasi", "Verified")} value={listLoading ? "…" : verified} caption={tr("Telah dikonfirmasi petugas", "Confirmed by an officer")} />
        </div>

        {/* Filter / search bar */}
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tr("Cari ID, deskripsi, atau token pelapor…", "Search ID, description, or reporter token…")}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-400/40"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === status ? "bg-[#075640] text-white" : "bg-[#eef5f1] text-[#075640] hover:bg-[#dfe8e2]"
                }`}
              >
                {status === "all" ? tr("Semua status", "All statuses") : tr(...STATUS_LABEL[status])}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => refreshReports()}
            className="rounded-md bg-[#eef5f1] px-3 py-1.5 text-xs font-medium text-[#075640] hover:bg-[#dfe8e2]"
          >
            {tr("Segarkan", "Refresh")}
          </button>
        </Card>

        {/* Map + detail panel */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.9fr_1fr]">
          {/* Map */}
          <Card className="p-5">
            <h2 className="text-lg font-bold text-gray-900">{tr("Sebaran laporan warga", "Where reports come from")}</h2>
            <p className="text-xs text-gray-500">
              {tr(
                "Koordinat asli dari laporan warga, ditampilkan bersama deteksi satelit di sekitarnya.",
                "Real coordinates from citizen reports, shown together with nearby satellite detections."
              )}
            </p>

            <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-lg border border-[#dfe8e2] bg-[#e4eddf]">
              {listLoading ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-gray-400"><MapLoadingText /></div>
              ) : (
                <FireMap
                  markers={hotspotMarkers}
                  reports={reportPins}
                  center={[-2.2, 113.8]}
                  zoom={7}
                  className="h-full w-full"
                  showSeverityLegend={false}
                  showDetailPanel={false}
                  onReportSelect={(report) => (report ? selectReport(report.id) : null)}
                />
              )}
            </div>

            <p className="mt-3 text-[11px] text-gray-400">
              {tr(
                "Simbol peta (satelit & laporan warga) ada di tombol “Legenda” pada peta di atas.",
                "Map symbols (satellite & citizen reports) are under the “Legend” button on the map above."
              )}
            </p>
          </Card>

          {/* Detail / validation panel */}
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-lg font-bold text-gray-900">{tr("Laporan terpilih", "Selected report")}</h2>

            {!selectedId && (
              <p className="text-sm text-gray-500">{tr("Pilih laporan dari peta atau tabel di bawah untuk melihat detailnya.", "Pick a report from the map or the table below to see its details.")}</p>
            )}

            {selectedId && detailLoading && <p className="text-sm text-gray-500">{tr("Memuat detail laporan…", "Loading report details…")}</p>}

            {selectedId && detailError && (
              <p className="text-sm text-red-600">{detailError}</p>
            )}

            {selectedId && !detailLoading && detail && (
              <>
                <StatusPill status={detail.status} />

                <div>
                  <p className="text-xs font-semibold text-gray-500">{detail.id}</p>
                  <h3 className="text-sm leading-relaxed text-gray-900">{detail.description}</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatAdminFull(detail.admin) ? `${formatAdminFull(detail.admin)} · ` : ""}{tr("Koordinat", "Coordinates")}: {detail.lat.toFixed(4)}, {detail.lon.toFixed(4)}
                  </p>
                  <p className="text-xs text-gray-500">{tr("Dilaporkan", "Observed")}: {formatDateTime(detail.observedAt, language)}</p>
                  <p className="text-xs text-gray-500">{tr("Diterima sistem", "Received")}: {formatDateTime(detail.createdAt, language)}</p>
                  <p className="text-xs text-gray-500">{tr("Token pelapor", "Reporter token")}: {detail.submitterToken}</p>
                  {detail.photoFilename ? (
                    <a
                      href={`/api/reports/${detail.id}/photo`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#075640] underline"
                    >
                      <span className="material-symbols-outlined text-[14px]">image</span>
                      {tr("Ada foto terlampir — lihat foto", "Photo attached — view photo")}
                    </a>
                  ) : (
                    <p className="mt-2 text-xs text-gray-400">{tr("Tidak ada foto terlampir.", "No photo attached.")}</p>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-sm font-semibold text-gray-900">{tr("Deteksi satelit yang berkorelasi", "Correlated satellite detections")}</h4>
                  {detail.satelliteLinks && detail.satelliteLinks.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {detail.satelliteLinks.map((link) => {
                        const marker = hotspotById.get(link.markerId);
                        return (
                          <li key={link.markerId} className="rounded-md bg-[#eef5f1] p-2.5 text-xs text-gray-700">
                            <div className="font-medium text-[#075640]">{link.markerId}</div>
                            <div className="mt-0.5 text-gray-600">
                              {link.distanceKm !== null ? `${link.distanceKm.toFixed(2)} km` : tr("Jarak tidak tercatat", "Distance not recorded")}
                              {" · "}
                              {link.timeDiffMin !== null
                                ? tr(`selisih ${link.timeDiffMin.toFixed(0)} menit`, `${link.timeDiffMin.toFixed(0)} min apart`)
                                : tr("selisih waktu tidak tercatat", "time difference not recorded")}
                            </div>
                            {marker && (
                              <div className="mt-0.5 text-gray-500">
                                Sensor {marker.sensor ?? tr("tidak diketahui", "unknown")} · {tr("Tingkat", "Level")} {marker.severity}
                                {typeof marker.frp === "number" ? ` · FRP ${marker.frp.toFixed(1)}` : ""}
                              </div>
                            )}
                            <div className="mt-0.5 text-gray-400">{tr("Tertaut", "Linked")}: {formatDateTime(link.createdAt, language)}</div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">
                      {tr(
                        "Belum ada deteksi satelit (MODIS/VIIRS) yang berkorelasi dengan laporan ini pada jendela waktu yang relevan.",
                        "No satellite detection (MODIS/VIIRS) correlates with this report within the relevant time window yet."
                      )}
                    </p>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-sm font-semibold text-gray-900">{tr("Perbarui status", "Update status")}</h4>
                  <select
                    value={pendingStatus}
                    onChange={(event) => setPendingStatus(event.target.value as ReportStatus)}
                    className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-400/40"
                  >
                    {STATUS_ORDER.map((status) => (
                      <option key={status} value={status}>
                        {tr(...STATUS_LABEL[status])}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder={tr("Catatan tinjauan (opsional)…", "Review note (optional)…")}
                    rows={2}
                    className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-400/40"
                  />
                  <button
                    type="button"
                    onClick={handleUpdateStatus}
                    disabled={updateLoading}
                    className="mt-2 w-full rounded-md bg-[#075640] px-4 py-2 text-sm font-medium text-white hover:bg-[#064a36] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updateLoading ? tr("Menyimpan…", "Saving…") : tr("Simpan status", "Save status")}
                  </button>
                  {updateError && <p className="mt-2 text-xs text-red-600">{updateError}</p>}
                  {updateSuccess && <p className="mt-2 text-xs text-[#075640]">{updateSuccess}</p>}
                  {detail.reviewedAt && (
                    <p className="mt-2 text-xs text-gray-400">{tr("Terakhir ditinjau", "Last reviewed")}: {formatDateTime(detail.reviewedAt, language)}</p>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Reports table */}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4">
            <h2 className="text-lg font-bold text-gray-900">{tr("Laporan terbaru", "Latest reports")}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#eef5f1] text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">{tr("ID / Waktu", "ID / Time")}</th>
                  <th className="px-5 py-3 font-semibold">{tr("Deskripsi & lokasi", "Description & location")}</th>
                  <th className="px-5 py-3 font-semibold">{tr("Foto", "Photo")}</th>
                  <th className="px-5 py-3 font-semibold">{tr("Status petugas", "Officer status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {listLoading && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                      {tr("Memuat laporan warga…", "Loading citizen reports…")}
                    </td>
                  </tr>
                )}
                {!listLoading &&
                  filteredReports.map((report) => (
                    <tr
                      key={report.id}
                      onClick={() => selectReport(report.id)}
                      className={`cursor-pointer transition-colors ${
                        report.id === selectedId ? "bg-[#f3f8f4]" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {report.id.slice(0, 8)} · {formatDateTime(report.createdAt, language)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="max-w-xs truncate font-medium text-gray-900">{report.description}</div>
                        <div className="text-gray-500">{placeLabel(report.admin, report.lat, report.lon)}</div>
                      </td>
                      <td className="px-5 py-3 text-gray-700">{report.photoFilename ? tr("Ada", "Yes") : tr("Tidak ada", "No")}</td>
                      <td className="px-5 py-3">
                        <StatusPill status={report.status} />
                      </td>
                    </tr>
                  ))}
                {!listLoading && !listError && reports.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                      {tr("Belum ada laporan warga yang masuk.", "No citizen reports yet.")}
                    </td>
                  </tr>
                )}
                {!listLoading && reports.length > 0 && filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                      {tr("Tidak ada laporan yang cocok dengan pencarian/filter ini.", "No reports match this search/filter.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-gray-500">
            <span>{tr(`Menampilkan ${filteredReports.length} dari ${total} laporan`, `Showing ${filteredReports.length} of ${total} reports`)}</span>
          </div>
        </Card>

        <p className="pb-2 text-center text-xs text-gray-400">
          {tr("Laporan warga adalah data pelengkap, bukan pengganti deteksi MODIS / VIIRS.", "Citizen reports complement MODIS / VIIRS detections; they don't replace them.")}
        </p>
      </div>
    </WorkstationLayout>
  );
}
