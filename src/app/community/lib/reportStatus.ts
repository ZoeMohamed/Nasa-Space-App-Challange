import type { ReportStatus } from "@/types";

/**
 * Indonesian labels + tone for the backend's ALLOWED_STATUSES
 * (python-service/fire_pipeline/reports.py). Every label keeps the same
 * "satellite match / verified != confirmed fire in the field" honesty used
 * elsewhere in this app — "Cocok dengan Satelit" explicitly isn't phrased as
 * "fire confirmed".
 */
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  submitted: "Terkirim",
  under_review: "Sedang Ditinjau",
  satellite_matched: "Cocok dengan Deteksi Satelit",
  verified: "Terverifikasi Petugas",
  rejected: "Ditolak",
};

export const REPORT_STATUS_DESCRIPTION: Record<ReportStatus, string> = {
  submitted: "Laporan Anda sudah masuk dan menunggu diproses.",
  under_review: "Petugas sedang memeriksa laporan ini.",
  satellite_matched:
    "Lokasi dan waktu laporan Anda berdekatan dengan deteksi satelit — ini belum berarti kebakaran sudah dikonfirmasi di lapangan.",
  verified: "Petugas telah memverifikasi laporan ini.",
  rejected: "Laporan ini ditandai tidak valid oleh petugas setelah ditinjau.",
};

export const REPORT_STATUS_TONE: Record<ReportStatus, "neutral" | "info" | "warn" | "good" | "bad"> = {
  submitted: "neutral",
  under_review: "warn",
  satellite_matched: "info",
  verified: "good",
  rejected: "bad",
};

export const REPORT_STATUS_TONE_CLASSES: Record<"neutral" | "info" | "warn" | "good" | "bad", string> = {
  neutral: "bg-gray-100 text-gray-600 border-gray-200",
  info: "bg-sky-100 text-sky-700 border-sky-200",
  warn: "bg-amber-100 text-amber-700 border-amber-200",
  good: "bg-emerald-100 text-emerald-700 border-emerald-200",
  bad: "bg-rose-100 text-rose-700 border-rose-200",
};
