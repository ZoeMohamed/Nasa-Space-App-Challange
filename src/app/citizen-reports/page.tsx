"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import StatTile from "@/components/ui/StatTile";
import type { HotspotMarker } from "@/types";

const FireMap = dynamic(() => import("@/components/map/FireMap"), { ssr: false });

/**
 * Citizen / Community Report — officer-side validation dashboard.
 * Source: Figma file wasTTtlmYfsjK1ZkH1Kzim, node 169:16247 ("Citizen / Community Report",
 * a sub-frame inside node 169:12248 "Desktop - 16"), fetched via get_design_context.
 *
 * This is the OFFICER-FACING review/validation screen only — not the public citizen mobile
 * reporting app (submitting a report from a phone), which is a separate, unbuilt flow.
 *
 * IMPORTANT — this whole feature has ZERO backend support today:
 *   - no report-submission endpoint exists
 *   - no photo/evidence storage exists
 *   - no officer validation/moderation workflow or persistence exists
 * Unlike the satellite hotspot data (which has a real NASA FIRMS -> Python pipeline -> /api/hotspots
 * path), citizen reporting is a net-new feature with nothing to "go fetch" — it needs real
 * endpoints built from scratch (report submission, evidence storage, a validation workflow).
 * Everything on this page is illustrative demo data for layout/UX purposes only, per Figma's own
 * "DATA DEMO" / "Mode demonstrasi" labelling on this screen.
 */

type ReportStatus = "Perlu ditinjau" | "Tervalidasi" | "Tidak valid";

interface DemoReport {
  id: string;
  time: string;
  dateLabel: string;
  title: string;
  location: string;
  reporter: string;
  photoCount: number;
  satelliteStatus: string;
  aiCheckLabel: string;
  aiConfidencePercent: number | null;
  aiDescription: string;
  status: ReportStatus;
  /** Approximate demo coordinates used to place the report on the real basemap. */
  coordinates: { lat: number; lng: number };
}

/**
 * Demo-only citizen reports. Numbers, locations, photo counts and AI read-outs are invented to
 * match the shape and tone of Figma's own example data (which itself is explicitly labelled
 * illustrative, e.g. "Kalimantan Tengah · Ilustrasi peta, bukan koordinat aktual"). Nothing here
 * is backed by a real submission, a real photo, or a real AI inference — see file header.
 */
const DEMO_REPORTS: DemoReport[] = [
  {
    id: "CR-024",
    time: "09.42",
    dateLabel: "10 Okt 2026, 09.42 WIB",
    title: "Asap di lahan gambut",
    location: "Pulang Pisau",
    reporter: "Warga #082",
    photoCount: 2,
    satelliteStatus: "Belum terdeteksi",
    aiCheckLabel: "Indikasi api · 92%",
    aiConfidencePercent: 92,
    aiDescription:
      "Asap teridentifikasi pada foto. Lokasi belum memiliki deteksi MODIS atau VIIRS pada periode yang sama.",
    status: "Perlu ditinjau",
    coordinates: { lat: -2.75, lng: 113.95 },
  },
  {
    id: "CR-023",
    time: "09.18",
    dateLabel: "10 Okt 2026, 09.18 WIB",
    title: "Api dekat perkebunan",
    location: "Kapuas",
    reporter: "Warga #061",
    photoCount: 3,
    satelliteStatus: "VIIRS",
    aiCheckLabel: "Indikasi api · 96%",
    aiConfidencePercent: 96,
    aiDescription: "Titik api cocok dengan deteksi VIIRS pada koordinat dan waktu yang berdekatan.",
    status: "Tervalidasi",
    coordinates: { lat: -2.35, lng: 114.35 },
  },
  {
    id: "CR-022",
    time: "08.56",
    dateLabel: "10 Okt 2026, 08.56 WIB",
    title: "Asap tebal di tepi jalan",
    location: "Palangka Raya",
    reporter: "Warga #047",
    photoCount: 1,
    satelliteStatus: "Belum terdeteksi",
    aiCheckLabel: "Perlu bukti lagi",
    aiConfidencePercent: null,
    aiDescription: "Foto buram, sudut pengambilan gambar tidak menunjukkan sumber asap secara jelas.",
    status: "Perlu ditinjau",
    coordinates: { lat: -2.22, lng: 113.92 },
  },
  {
    id: "CR-021",
    time: "08.31",
    dateLabel: "10 Okt 2026, 08.31 WIB",
    title: "Pembakaran sampah",
    location: "Katingan",
    reporter: "Warga #019",
    photoCount: 2,
    satelliteStatus: "MODIS",
    aiCheckLabel: "Bukan karhutla",
    aiConfidencePercent: null,
    aiDescription: "Pola asap dan lokasi konsisten dengan pembakaran sampah skala kecil, bukan kebakaran lahan.",
    status: "Tidak valid",
    coordinates: { lat: -2.05, lng: 113.72 },
  },
  {
    id: "CR-020",
    time: "21.05",
    dateLabel: "9 Okt 2026, 21.05 WIB",
    title: "Titik panas kecil, padam sendiri",
    location: "Seruyan",
    reporter: "Warga #103",
    photoCount: 1,
    satelliteStatus: "MODIS",
    aiCheckLabel: "Indikasi api · 81%",
    aiConfidencePercent: 81,
    aiDescription: "Indikasi panas rendah, kemungkinan sisa bakar lahan kecil yang sudah padam.",
    status: "Tervalidasi",
    coordinates: { lat: -2.45, lng: 112.35 },
  },
];

const STATUS_STYLE: Record<ReportStatus, { bg: string; text: string; dot: string }> = {
  "Perlu ditinjau": { bg: "bg-[#fff0dd]", text: "text-[#b96016]", dot: "#b96016" },
  Tervalidasi: { bg: "bg-[#eef5f1]", text: "text-[#075640]", dot: "#075640" },
  "Tidak valid": { bg: "bg-blue-50", text: "text-blue-700", dot: "#2563eb" },
};

const STATUS_FILTERS: ("all" | ReportStatus)[] = ["all", "Perlu ditinjau", "Tervalidasi", "Tidak valid"];

const FLOW_STEPS = [
  { n: "01", label: "Laporan & bukti masuk" },
  { n: "02", label: "Pemeriksaan awal AI" },
  { n: "03", label: "Validasi petugas" },
  { n: "04", label: "Tindak lanjut" },
];

function DemoBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#f5d9b0] bg-[#fff7ec] p-4">
      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-[#b96016]">science</span>
      <div>
        <p className="text-sm font-bold text-[#8a4b0f]">Mode demonstrasi — fitur laporan warga belum punya backend</p>
        <p className="mt-1 text-xs leading-relaxed text-[#8a4b0f]/90">
          Semua angka, lokasi, laporan, dan hasil pemeriksaan AI pada halaman ini adalah data contoh untuk
          menunjukkan rancangan alur kerja. Belum ada endpoint pengiriman laporan, penyimpanan foto bukti, maupun
          alur validasi petugas yang terhubung ke sistem ini — tombol aksi di halaman ini sengaja dinonaktifkan.
        </p>
      </div>
    </div>
  );
}

function LegendItem({ color, label, shape = "circle" }: { color: string; label: string; shape?: "circle" | "square" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <span
        className={shape === "circle" ? "inline-block h-2.5 w-2.5 rounded-full" : "inline-block h-2.5 w-2.5 rounded-[2px]"}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function StatusPill({ status, className = "" }: { status: ReportStatus; className?: string }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex w-fit items-center rounded-md px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text} ${className}`}>
      {status}
    </span>
  );
}

export default function CitizenReportsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>("all");
  const [selectedId, setSelectedId] = useState(DEMO_REPORTS[0].id);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return DEMO_REPORTS.filter((report) => {
      const matchesQuery =
        !query ||
        report.id.toLowerCase().includes(query) ||
        report.location.toLowerCase().includes(query) ||
        report.title.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || report.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [search, statusFilter]);

  const selected = DEMO_REPORTS.find((report) => report.id === selectedId) ?? DEMO_REPORTS[0];
  const reportMarkers = useMemo<HotspotMarker[]>(
    () =>
      filteredReports.map((report) => ({
        id: report.id,
        lat: report.coordinates.lat,
        lng: report.coordinates.lng,
        label: `${report.id} · ${report.title}`,
        frp: report.status === "Perlu ditinjau" ? 80 : report.status === "Tervalidasi" ? 40 : 10,
        severity: report.status === "Perlu ditinjau" ? "HIGH" : report.status === "Tervalidasi" ? "MEDIUM" : "LOW",
      })),
    [filteredReports]
  );

  return (
    <WorkstationLayout activeTab="Citizen Reports">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <DemoBanner />

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-[#075640]">
              Pemantauan Partisipatif
            </span>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Citizen / Community Report</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Laporan warga melengkapi deteksi satelit. AI membantu pemeriksaan awal, petugas menentukan validasi
              akhir.
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-[#fff0dd] px-3 py-1.5 text-xs font-semibold text-[#b96016]">
            DATA DEMO
          </span>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total laporan" value={128} caption="Seluruh laporan warga" />
          <StatTile
            label="Perlu ditinjau"
            value={<span className="text-[#b96016]">24</span>}
            caption="Menunggu keputusan petugas"
          />
          <StatTile label="Tervalidasi" value={86} caption="Telah dikonfirmasi petugas" />
          <StatTile label="Melengkapi celah satelit" value={18} caption="Belum terdeteksi MODIS / VIIRS" />
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
              placeholder="Cari lokasi atau ID laporan…"
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
                {status === "all" ? "Semua status" : status}
              </button>
            ))}
            <span
              className="rounded-md bg-[#eef5f1] px-3 py-1.5 text-xs font-medium text-[#075640]/70"
              title="Tampilan contoh — kategori laporan belum ada di data demo ini."
            >
              Semua kategori
            </span>
            <span
              className="rounded-md bg-[#eef5f1] px-3 py-1.5 text-xs font-medium text-[#075640]/70"
              title="Tampilan contoh — belum terhubung ke rentang waktu sungguhan."
            >
              7 hari terakhir
            </span>
          </div>
        </Card>

        {/* Map + detail panel */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.9fr_1fr]">
          {/* Map */}
          <Card className="p-5">
            <h2 className="text-lg font-bold text-gray-900">Sebaran laporan warga</h2>
            <p className="text-xs text-gray-500">Kalimantan Tengah · basemap nyata, koordinat laporan masih demo</p>

            <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-lg border border-[#dfe8e2] bg-[#e4eddf]">
              <FireMap
                markers={reportMarkers}
                center={[-2.2, 113.8]}
                zoom={7}
                className="h-full w-full"
                showSeverityLegend={false}
                onMarkerSelect={(marker) => setSelectedId(marker.id)}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4">
              <LegendItem color={STATUS_STYLE["Perlu ditinjau"].dot} label="Perlu ditinjau" />
              <LegendItem color={STATUS_STYLE.Tervalidasi.dot} label="Tervalidasi" />
              <LegendItem color={STATUS_STYLE["Tidak valid"].dot} label="Tidak valid" />
              <LegendItem color="#756a82" label="MODIS / VIIRS" shape="square" />
            </div>
          </Card>

          {/* Detail / validation panel */}
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-lg font-bold text-gray-900">Laporan terpilih</h2>
            <StatusPill status={selected.status} />

            <div>
              <p className="text-xs font-semibold text-gray-500">{selected.id}</p>
              <h3 className="text-xl font-semibold text-gray-900">{selected.title}</h3>
              <p className="mt-1 text-xs text-gray-500">
                {selected.location} · {selected.dateLabel}
              </p>
              <p className="text-xs text-gray-500">
                Pelapor: {selected.reporter} · {selected.photoCount} foto terlampir
              </p>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-sm font-semibold text-gray-900">Pemeriksaan awal AI</h4>
              {selected.aiConfidencePercent !== null ? (
                <span className="mt-2 inline-flex items-center rounded-md bg-[#eef5f1] px-2.5 py-1 text-xs font-medium text-[#075640]">
                  Indikasi kebakaran · {selected.aiConfidencePercent}%
                </span>
              ) : (
                <span className="mt-2 inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  {selected.aiCheckLabel}
                </span>
              )}
              <p className="mt-3 text-sm text-gray-700">{selected.aiDescription}</p>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
                <span className="material-symbols-outlined mt-0.5 text-[14px]">info</span>
                AI bukan keputusan akhir. Periksa bukti dan lokasi.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled
                title="Belum terhubung — alur validasi petugas belum dibangun di backend."
                className="flex-1 cursor-not-allowed rounded-md bg-[#075640] px-4 py-2 text-sm font-medium text-white opacity-50"
              >
                Validasi laporan
              </button>
              <button
                type="button"
                disabled
                title="Belum terhubung — penyimpanan foto bukti belum dibangun di backend."
                className="flex-1 cursor-not-allowed rounded-md bg-[#eef5f1] px-4 py-2 text-sm font-medium text-[#075640] opacity-60"
              >
                Tinjau bukti
              </button>
            </div>
          </Card>
        </div>

        {/* Reports table */}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4">
            <h2 className="text-lg font-bold text-gray-900">Laporan terbaru</h2>
            <button
              type="button"
              disabled
              title="Belum terhubung — ekspor data memerlukan backend laporan warga."
              className="cursor-not-allowed rounded-md bg-[#eef5f1] px-4 py-1.5 text-xs font-medium text-[#075640] opacity-60"
            >
              Ekspor laporan
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#eef5f1] text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">ID / Waktu</th>
                  <th className="px-5 py-3 font-semibold">Laporan & lokasi</th>
                  <th className="px-5 py-3 font-semibold">Satelit</th>
                  <th className="px-5 py-3 font-semibold">Pemeriksaan AI</th>
                  <th className="px-5 py-3 font-semibold">Status petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredReports.map((report) => (
                  <tr
                    key={report.id}
                    onClick={() => setSelectedId(report.id)}
                    className={`cursor-pointer transition-colors ${
                      report.id === selected.id ? "bg-[#f3f8f4]" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {report.id} · {report.time}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{report.title}</div>
                      <div className="text-gray-500">{report.location}</div>
                    </td>
                    <td className={`px-5 py-3 ${report.satelliteStatus === "Belum terdeteksi" ? "text-[#b96016]" : "text-gray-700"}`}>
                      {report.satelliteStatus}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{report.aiCheckLabel}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={report.status} />
                    </td>
                  </tr>
                ))}
                {filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                      Tidak ada laporan contoh yang cocok dengan pencarian/filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-gray-500">
            <span>Menampilkan {filteredReports.length} dari 128 laporan (contoh)</span>
            <span className="text-gray-400">‹ 1 2 3 … 32 ›</span>
          </div>
        </Card>

        {/* Follow-up flow explainer */}
        <div className="rounded-xl border border-[#dfe8e2] bg-[#eef5f1] p-6">
          <h2 className="text-lg font-bold text-gray-900">Dari warga, untuk respons yang lebih cepat</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-medium text-gray-800">
            {FLOW_STEPS.map((step, index) => (
              <span key={step.n} className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 shadow-sm">
                  <span className="font-semibold text-[#075640]">{step.n}</span> {step.label}
                </span>
                {index < FLOW_STEPS.length - 1 && <span className="text-gray-400">→</span>}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Laporan warga adalah data pelengkap, bukan pengganti MODIS / VIIRS. Laporan belum tervalidasi tetap
            diberi penanda berbeda.
          </p>
        </div>

        <p className="pb-2 text-center text-xs text-gray-400">
          Mode demonstrasi · Semua angka, lokasi, dan hasil AI pada halaman ini merupakan contoh.
        </p>
      </div>
    </WorkstationLayout>
  );
}
