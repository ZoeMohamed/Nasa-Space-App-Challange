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

const REPORT_STATUS_LABEL_EN: Record<ReportStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  satellite_matched: "Matches a Satellite Detection",
  verified: "Verified by Officer",
  rejected: "Rejected",
};

const REPORT_STATUS_DESCRIPTION_EN: Record<ReportStatus, string> = {
  submitted: "Your report has arrived and is waiting to be processed.",
  under_review: "An officer is checking this report.",
  satellite_matched:
    "Your report's place and time are close to a satellite detection — this does not yet mean a fire has been confirmed on the ground.",
  verified: "An officer has verified this report.",
  rejected: "An officer marked this report as invalid after review.",
};

export function reportStatusLabel(status: ReportStatus, language: "id" | "en"): string {
  return (language === "en" ? REPORT_STATUS_LABEL_EN : REPORT_STATUS_LABEL)[status] ?? status;
}

export function reportStatusDescription(status: ReportStatus, language: "id" | "en"): string {
  return (language === "en" ? REPORT_STATUS_DESCRIPTION_EN : REPORT_STATUS_DESCRIPTION)[status] ?? "";
}

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
