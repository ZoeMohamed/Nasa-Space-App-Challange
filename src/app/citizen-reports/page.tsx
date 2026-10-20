"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import StatTile from "@/components/ui/StatTile";
import type { CommunityReport, HotspotApiResponse, HotspotMarker, ReportStatus, ReportsListResponse } from "@/types";
import { formatAdminFull, placeLabel } from "@/lib/adminRegion";

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

const STATUS_LABEL: Record<ReportStatus, string> = {
  submitted: "Baru masuk",
  under_review: "Sedang ditinjau",
  satellite_matched: "Cocok dengan satelit",
  verified: "Terverifikasi",
  rejected: "Ditolak",
};

const STATUS_STYLE: Record<ReportStatus, { bg: string; text: string; dot: string }> = {
  submitted: { bg: "bg-[#fff0dd]", text: "text-[#b96016]", dot: "#b96016" },
  under_review: { bg: "bg-blue-50", text: "text-blue-700", dot: "#2563eb" },
  satellite_matched: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "#4338ca" },
  verified: { bg: "bg-[#eef5f1]", text: "text-[#075640]", dot: "#075640" },
  rejected: { bg: "bg-gray-100", text: "text-gray-600", dot: "#6b7280" },
};

const STATUS_FILTERS: ("all" | ReportStatus)[] = ["all", ...STATUS_ORDER];


function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Tidak tercatat";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tidak tercatat";
  return `${date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`;
}

async function fetchReports(signal?: AbortSignal): Promise<CommunityReport[]> {
  const response = await fetch("/api/reports", { cache: "no-store", signal });
  const body = (await response.json()) as ReportsListResponse & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Gagal memuat laporan warga.");
  }
  return body.reports;
}

async function fetchReportDetail(id: string, signal?: AbortSignal): Promise<CommunityReport> {
  const response = await fetch(`/api/reports/${id}`, { cache: "no-store", signal });
  const body = (await response.json()) as CommunityReport & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Gagal memuat detail laporan.");
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
    throw new Error(body.error ?? "Gagal memperbarui status laporan.");
  }
  return body;
}

function NoAccessControlBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#f5d9b0] bg-[#fff7ec] p-4">
      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-[#b96016]">lock_open</span>
      <div>
        <p className="text-sm font-bold text-[#8a4b0f]">Belum ada proteksi akses pada aksi ubah status</p>
        <p className="mt-1 text-xs leading-relaxed text-[#8a4b0f]/90">
          Laporan di halaman ini sudah data sungguhan dari backend, dan tombol di bawah benar-benar mengubah status
          laporan tersebut. Namun endpoint pembaruan status belum punya autentikasi atau kontrol akses apa pun —
          siapa pun yang memiliki tautan halaman ini bisa memanggil API yang sama dan mengubah status laporan warga.
          Ini keputusan sadar untuk tahap proyek saat ini, bukan kelalaian — tambahkan proteksi akses sebelum
          dipakai di luar lingkungan tepercaya.
        </p>
      </div>
    </div>
  );
}

function StatusPill({ status, className = "" }: { status: ReportStatus; className?: string }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex w-fit items-center rounded-md px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text} ${className}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function CitizenReportsPage() {
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
      setListError(error instanceof Error ? error.message : "Gagal memuat laporan warga.");
    } finally {
      setListLoading(false);
    }
  }, []);

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
        setListError(error instanceof Error ? error.message : "Gagal memuat laporan warga.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });
    fetchHotspotMarkers(controller.signal).then(setHotspotMarkers);
    return () => controller.abort();
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
        setDetailError(error instanceof Error ? error.message : "Gagal memuat detail laporan.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
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
      setUpdateSuccess(`Status diperbarui menjadi "${STATUS_LABEL[updated.status]}".`);
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "Gagal memperbarui status laporan.");
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
              Pemantauan Partisipatif
            </span>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Citizen / Community Report</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Laporan warga melengkapi deteksi satelit. Petugas meninjau tiap laporan dan menentukan status
              validasi akhir.
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-[#eef5f1] px-3 py-1.5 text-xs font-semibold text-[#075640]">
            DATA LANGSUNG
          </span>
        </div>

        {listError && (
          <Card className="flex items-start gap-3 border-red-200 bg-red-50 p-4">
            <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-red-600">error</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">Gagal memuat laporan warga</p>
              <p className="mt-1 text-xs text-red-600">{listError}</p>
            </div>
            <button
              type="button"
              onClick={() => refreshReports()}
              className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              Coba lagi
            </button>
          </Card>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total laporan" value={listLoading ? "…" : total} caption="Seluruh laporan warga" />
          <StatTile
            label="Perlu ditinjau"
            value={<span className="text-[#b96016]">{listLoading ? "…" : needsReview}</span>}
            caption="Baru masuk / sedang ditinjau"
          />
          <StatTile label="Cocok dengan satelit" value={listLoading ? "…" : satelliteMatched} caption="Terkait deteksi MODIS / VIIRS" />
          <StatTile label="Terverifikasi" value={listLoading ? "…" : verified} caption="Telah dikonfirmasi petugas" />
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
              placeholder="Cari ID, deskripsi, atau token pelapor…"
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
                {status === "all" ? "Semua status" : STATUS_LABEL[status]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => refreshReports()}
            className="rounded-md bg-[#eef5f1] px-3 py-1.5 text-xs font-medium text-[#075640] hover:bg-[#dfe8e2]"
          >
            Segarkan
          </button>
        </Card>

        {/* Map + detail panel */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.9fr_1fr]">
          {/* Map */}
          <Card className="p-5">
            <h2 className="text-lg font-bold text-gray-900">Sebaran laporan warga</h2>
            <p className="text-xs text-gray-500">Koordinat sungguhan dari laporan warga — belum ada data nama tempat/batas administratif, titik ditampilkan sebagai koordinat.</p>

            <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-lg border border-[#dfe8e2] bg-[#e4eddf]">
              {listLoading ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">Memuat peta…</div>
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
              Simbol peta (satelit &amp; laporan warga) ada di tombol &quot;Legenda&quot; pada peta di atas.
            </p>
          </Card>

          {/* Detail / validation panel */}
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-lg font-bold text-gray-900">Laporan terpilih</h2>

            {!selectedId && (
              <p className="text-sm text-gray-500">Pilih laporan dari peta atau tabel di bawah untuk melihat detailnya.</p>
            )}

            {selectedId && detailLoading && <p className="text-sm text-gray-500">Memuat detail laporan…</p>}

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
                    {formatAdminFull(detail.admin) ? `${formatAdminFull(detail.admin)} · ` : ""}Koordinat: {detail.lat.toFixed(4)}, {detail.lon.toFixed(4)}
                  </p>
                  <p className="text-xs text-gray-500">Dilaporkan: {formatDateTime(detail.observedAt)}</p>
                  <p className="text-xs text-gray-500">Diterima sistem: {formatDateTime(detail.createdAt)}</p>
                  <p className="text-xs text-gray-500">Token pelapor: {detail.submitterToken}</p>
                  {detail.photoFilename ? (
                    <a
                      href={`/api/reports/${detail.id}/photo`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#075640] underline"
                    >
                      <span className="material-symbols-outlined text-[14px]">image</span>
                      Ada foto terlampir — lihat foto
                    </a>
                  ) : (
                    <p className="mt-2 text-xs text-gray-400">Tidak ada foto terlampir.</p>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-sm font-semibold text-gray-900">Deteksi satelit yang berkorelasi</h4>
                  {detail.satelliteLinks && detail.satelliteLinks.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {detail.satelliteLinks.map((link) => {
                        const marker = hotspotById.get(link.markerId);
                        return (
                          <li key={link.markerId} className="rounded-md bg-[#eef5f1] p-2.5 text-xs text-gray-700">
                            <div className="font-medium text-[#075640]">{link.markerId}</div>
                            <div className="mt-0.5 text-gray-600">
                              {link.distanceKm !== null ? `${link.distanceKm.toFixed(2)} km` : "Jarak tidak tercatat"}
                              {" · "}
                              {link.timeDiffMin !== null ? `selisih ${link.timeDiffMin.toFixed(0)} menit` : "selisih waktu tidak tercatat"}
                            </div>
                            {marker && (
                              <div className="mt-0.5 text-gray-500">
                                Sensor {marker.sensor ?? "tidak diketahui"} · Tingkat {marker.severity}
                                {typeof marker.frp === "number" ? ` · FRP ${marker.frp.toFixed(1)}` : ""}
                              </div>
                            )}
                            <div className="mt-0.5 text-gray-400">Tertaut: {formatDateTime(link.createdAt)}</div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">
                      Belum ada deteksi satelit (MODIS/VIIRS) yang berkorelasi dengan laporan ini pada jendela waktu
                      yang relevan.
                    </p>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-sm font-semibold text-gray-900">Perbarui status</h4>
                  <select
                    value={pendingStatus}
                    onChange={(event) => setPendingStatus(event.target.value as ReportStatus)}
                    className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-400/40"
                  >
                    {STATUS_ORDER.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABEL[status]}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="Catatan tinjauan (opsional)…"
                    rows={2}
                    className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-400/40"
                  />
                  <button
                    type="button"
                    onClick={handleUpdateStatus}
                    disabled={updateLoading}
                    className="mt-2 w-full rounded-md bg-[#075640] px-4 py-2 text-sm font-medium text-white hover:bg-[#064a36] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updateLoading ? "Menyimpan…" : "Simpan status"}
                  </button>
                  {updateError && <p className="mt-2 text-xs text-red-600">{updateError}</p>}
                  {updateSuccess && <p className="mt-2 text-xs text-[#075640]">{updateSuccess}</p>}
                  {detail.reviewedAt && (
                    <p className="mt-2 text-xs text-gray-400">Terakhir ditinjau: {formatDateTime(detail.reviewedAt)}</p>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Reports table */}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4">
            <h2 className="text-lg font-bold text-gray-900">Laporan terbaru</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#eef5f1] text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">ID / Waktu</th>
                  <th className="px-5 py-3 font-semibold">Deskripsi & lokasi</th>
                  <th className="px-5 py-3 font-semibold">Foto</th>
                  <th className="px-5 py-3 font-semibold">Status petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {listLoading && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                      Memuat laporan warga…
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
                        {report.id.slice(0, 8)} · {formatDateTime(report.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="max-w-xs truncate font-medium text-gray-900">{report.description}</div>
                        <div className="text-gray-500">{placeLabel(report.admin, report.lat, report.lon)}</div>
                      </td>
                      <td className="px-5 py-3 text-gray-700">{report.photoFilename ? "Ada" : "Tidak ada"}</td>
                      <td className="px-5 py-3">
                        <StatusPill status={report.status} />
                      </td>
                    </tr>
                  ))}
                {!listLoading && !listError && reports.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                      Belum ada laporan warga yang masuk.
                    </td>
                  </tr>
                )}
                {!listLoading && reports.length > 0 && filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                      Tidak ada laporan yang cocok dengan pencarian/filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-gray-500">
            <span>Menampilkan {filteredReports.length} dari {total} laporan</span>
          </div>
        </Card>

        <p className="pb-2 text-center text-xs text-gray-400">
          Laporan warga adalah data pelengkap, bukan pengganti deteksi MODIS / VIIRS.
        </p>
      </div>
    </WorkstationLayout>
  );
}
