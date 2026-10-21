"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import LocationPicker from "../components/LocationPicker";
import type { LocationSource } from "../lib/geo";
import { getOrCreateSubmitterToken } from "../lib/submitterToken";
import { useLocationState } from "../lib/useLocation";
import { useRegion } from "@/lib/useRegion";
import { formatAdminFull } from "@/lib/adminRegion";
import type { ReportCreateResponse } from "@/types";
import { useTranslation, type Language } from "@/lib/i18n/LanguageContext";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/gif"];
const VALID_SOURCES: LocationSource[] = ["gps", "manual-coords", "manual-area"];

// label = [Indonesian, English]. The Indonesian label is what gets stored in the report text, so
// officers see one consistent prefix whatever language the reporter's UI was in.
const REPORT_CATEGORIES = [
  { id: "api", label: ["Api terlihat", "Visible fire"], icon: "local_fire_department" },
  { id: "asap", label: ["Asap", "Smoke"], icon: "cloud" },
  { id: "bekas", label: ["Lahan bekas terbakar", "Burned land"], icon: "landscape" },
  { id: "lainnya", label: ["Lainnya", "Other"], icon: "more_horiz" },
] as const;

const DISTANCE_OPTIONS = ["< 100 m", "100–500 m", "> 500 m"];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(""));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error(""));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function formatClock(iso: string, language: Language): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleString(language === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`;
}

/** Timeline built only from what the backend actually returned for this report. */
function SubmittedView({ report }: { report: ReportCreateResponse }) {
  const { tr, language } = useTranslation();
  const links = report.satelliteLinks ?? [];
  const nearestLink = [...links].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))[0];
  const place = formatAdminFull(report.admin) ?? `${report.lat.toFixed(4)}, ${report.lon.toFixed(4)}`;

  const steps = [
    {
      done: true,
      title: tr("Laporan terkirim", "Report sent"),
      time: formatClock(report.createdAt, language),
      body: tr(
        `Tersimpan dengan lokasi ${place}${report.photoFilename ? " dan 1 foto" : " tanpa foto"}.`,
        `Saved with location ${place}${report.photoFilename ? " and 1 photo" : ", no photo"}.`
      ),
    },
    {
      done: !report.correlationWarning,
      title: tr("Dicocokkan otomatis dengan data satelit", "Automatically matched with satellite data"),
      time: null,
      body: report.correlationWarning
        ? tr(
            "Data satelit sedang tidak tersedia. Laporan tetap tersimpan.",
            "Satellite data is unavailable. Your report is still saved."
          )
        : links.length > 0
          ? tr(
              `${links.length} deteksi satelit dalam 5 km & 24 jam${nearestLink?.distanceKm != null ? ` (terdekat ${nearestLink.distanceKm.toFixed(1)} km)` : ""}. Belum tentu kebakaran.`,
              `${links.length} satellite detections within 5 km & 24 h${nearestLink?.distanceKm != null ? ` (nearest ${nearestLink.distanceKm.toFixed(1)} km)` : ""}. Not yet a confirmed fire.`
            )
          : tr(
              "Belum ada deteksi satelit di dekatmu. Laporan tetap dikirim ke petugas.",
              "No satellite detection nearby yet. Your report still goes to officers."
            ),
    },
    {
      done: false,
      title: tr("Ditinjau petugas", "Officer review"),
      time: null,
      body: tr("Menunggu petugas memeriksa bukti & lokasi.", "Waiting for an officer to check the evidence & location."),
    },
    {
      done: false,
      title: tr("Tindak lanjut", "Follow-up"),
      time: null,
      body: tr("Patroli / pemadaman jika laporan terverifikasi.", "Patrol / firefighting if the report is verified."),
    },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fadeIn">
      <div className="rounded-3xl bg-gradient-to-br from-[#0c2e22] to-[#12382c] text-white p-5 md:p-6 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[14px] font-bold">✓</span>
          <span className="text-sm md:text-base font-bold">{tr("Terima kasih, laporan terkirim!", "Thank you, your report was sent!")}</span>
        </div>
        <p className="text-xs text-emerald-100/90 pl-8 leading-relaxed">
          {tr(
            "Status laporanmu akan muncul di halaman Notifikasi setiap kali berubah.",
            "Your report's status will appear on the Notifications page whenever it changes."
          )}
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4">
        <p className="text-[11px] text-[var(--community-ink-muted)]">{tr("ID laporan", "Report ID")} {report.id.slice(0, 8).toUpperCase()}</p>
        <h2 className="text-sm font-bold text-[#123027] mt-0.5">{report.description}</h2>
        <p className="text-[11px] text-[var(--community-ink-muted)] mt-1">{place}</p>
      </div>

      <section className="rounded-3xl border border-[var(--community-border)] bg-white p-5 space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--community-ink-muted)]">{tr("Perjalanan laporanmu", "Your report's journey")}</h2>
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
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href={`/community/reports/${report.id}`}
          className="block text-center rounded-xl border border-[var(--community-border)] bg-white py-3 text-sm font-bold text-[#123027]"
        >
          {tr("Lihat detail laporan", "View report details")}
        </Link>
        <Link href="/community" className="block text-center rounded-xl bg-[#0c2e22] text-white py-3 text-sm font-bold">
          {tr("Kembali ke Beranda", "Back to Home")}
        </Link>
      </div>
    </div>
  );
}

function ReportPageContent() {
  const { tr } = useTranslation();
  const searchParams = useSearchParams();
  const location = useLocationState();
  const { fix } = location;
  const didInitFromQuery = useRef(false);
  const fixRegionLabel = formatAdminFull(useRegion(fix?.lat, fix?.lon));

  const [selectedCategory, setSelectedCategory] = useState("asap");
  const [distanceEstimate, setDistanceEstimate] = useState(DISTANCE_OPTIONS[1]);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedReport, setSubmittedReport] = useState<ReportCreateResponse | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Prefill from ?lat=&lon= (e.g. "Laporkan" from an alert page).
  useEffect(() => {
    if (didInitFromQuery.current) return;
    didInitFromQuery.current = true;
    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));
    if (!searchParams.get("lat") || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const sourceParam = searchParams.get("source") as LocationSource | null;
    location.setManualFix({ lat, lon, source: sourceParam && VALID_SOURCES.includes(sourceParam) ? sourceParam : "manual-coords" });
  }, [searchParams, location]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
  }, [photo]);

  function handlePhotoAdd(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError(tr("Format foto harus JPEG, PNG, atau GIF.", "The photo must be JPEG, PNG, or GIF."));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(tr("Ukuran foto maksimal 5 MB.", "The photo can be at most 5 MB."));
      return;
    }
    setPhoto({ file, previewUrl: URL.createObjectURL(file) });
    setPhotoError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!fix) {
      setSubmitError(tr("Atur lokasi kejadian dulu sebelum mengirim laporan.", "Set the incident location before sending the report."));
      setShowLocationPicker(true);
      return;
    }
    setSubmitError(null);
    const categoryLabel = REPORT_CATEGORIES.find((c) => c.id === selectedCategory)?.label[0] ?? "Laporan";
    const prefix = `[${categoryLabel} · Jarak ${distanceEstimate}]`;
    const finalDescription = description.trim() ? `${prefix} ${description.trim()}` : prefix;

    setSubmitting(true);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: fix.lat,
          lon: fix.lon,
          description: finalDescription,
          observedAt: new Date().toISOString(),
          submitterToken: getOrCreateSubmitterToken(),
          photoBase64: photo ? await readFileAsBase64(photo.file) : undefined,
        }),
      });
      const body = (await response.json()) as ReportCreateResponse & { detail?: string; error?: string };
      if (!response.ok) throw new Error(body.detail ?? body.error ?? tr("Gagal mengirim laporan.", "Failed to send the report."));
      setSubmittedReport(body);
      window.scrollTo({ top: 0 });
    } catch (error) {
      setSubmitError(error instanceof Error && error.message ? error.message : tr("Gagal mengirim laporan.", "Failed to send the report."));
    } finally {
      setSubmitting(false);
    }
  }

  if (submittedReport) return <SubmittedView report={submittedReport} />;

  return (
    <form onSubmit={handleSubmit} className="max-w-md md:max-w-5xl mx-auto pb-8">
      <div className="flex items-center gap-3 pb-4 md:pb-6">
        <Link
          href="/community"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5 text-[#123027] transition"
          aria-label={tr("Tutup", "Close")}
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </Link>
        <div>
          <h1 className="text-base md:text-xl font-black text-[#123027]">{tr("Lapor kebakaran", "Report a fire")}</h1>
          <p className="text-[11px] md:text-xs text-[var(--community-ink-muted)]">
            {tr("Isi yang kamu tahu saja. Lokasi wajib, sisanya opsional.", "Fill in only what you know. Location is required, the rest is optional.")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr] gap-5 md:gap-8 items-start">
        {/* Left: what happened */}
        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-[#123027] mb-2">{tr("Apa yang kamu lihat?", "What did you see?")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {REPORT_CATEGORIES.map((cat) => {
                const selected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    aria-pressed={selected}
                    className={`flex items-center gap-2 px-3.5 py-3 rounded-xl text-xs md:text-sm font-bold transition ${
                      selected
                        ? "bg-[#075640] text-white"
                        : "bg-white border border-[var(--community-border)] text-[#123027] hover:bg-gray-50"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{cat.icon}</span>
                    {tr(cat.label[0], cat.label[1])}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <span className="text-xs font-bold text-[#123027]">{tr("Foto bukti (opsional, 1 foto)", "Photo evidence (optional, 1 photo)")}</span>
            {photo ? (
              <div className="relative overflow-hidden rounded-2xl border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt={tr("Pratinjau foto bukti", "Evidence photo preview")} className="h-48 md:h-64 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-600"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                  {tr("Hapus", "Remove")}
                </button>
              </div>
            ) : (
              <label className="flex h-32 md:h-44 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 text-[var(--community-accent)] hover:bg-emerald-50 transition">
                <span className="material-symbols-outlined text-[28px]">add_a_photo</span>
                <span className="text-xs font-bold">{tr("Tambah foto", "Add photo")}</span>
                <span className="text-[11px] text-[var(--community-ink-muted)]">{tr("JPEG / PNG / GIF, maks. 5 MB", "JPEG / PNG / GIF, max 5 MB")}</span>
                <input type="file" accept="image/jpeg,image/png,image/gif" onChange={handlePhotoAdd} className="sr-only" />
              </label>
            )}
            <p className="text-[11px] text-[var(--community-ink-muted)]">{tr("Ambil foto dari jarak aman. Jangan mendekati api.", "Take the photo from a safe distance. Don't approach the fire.")}</p>
            {photoError && <p className="text-xs text-rose-600 font-medium">{photoError}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#123027]" htmlFor="keterangan">
              {tr("Keterangan (opsional)", "Details (optional)")}
            </label>
            <textarea
              id="keterangan"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tr(
                "Contoh: asap putih tebal dari arah lahan gambut belakang kebun, sejak sekitar jam 9 pagi.",
                "e.g. thick white smoke from the peatland behind the garden, since about 9 am."
              )}
              rows={4}
              className="w-full rounded-2xl border border-[var(--community-border)] bg-white p-3 text-sm text-[#123027] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Right: where + send (sticky on desktop) */}
        <div className="space-y-5 md:sticky md:top-24">
          <div className="space-y-2">
            <span className="text-xs font-bold text-[#123027]">{tr("Lokasi kejadian", "Incident location")}</span>
            <div
              className={`rounded-2xl border bg-white p-3.5 flex items-center justify-between gap-3 ${
                fix ? "border-[var(--community-border)]" : "border-amber-300 bg-amber-50/50"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <span className="material-symbols-outlined text-[20px]">location_on</span>
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#123027] truncate">
                    {fix ? (fix.label ?? fixRegionLabel ?? `${fix.lat.toFixed(4)}, ${fix.lon.toFixed(4)}`) : tr("Lokasi belum diatur", "Location not set")}
                  </div>
                  <div className="text-[11px] text-[var(--community-ink-muted)] truncate mt-0.5">
                    {fix
                      ? fix.source === "gps"
                        ? `GPS · ${tr("akurasi", "accuracy")} ±${Math.round(fix.accuracyMeters ?? 0)} m`
                        : tr("Dipilih manual. Titik perkiraan", "Picked manually. Approximate point")
                      : tr("Wajib diisi sebelum mengirim", "Required before sending")}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationPicker((open) => !open)}
                className="shrink-0 text-xs font-bold text-[var(--community-accent)] hover:underline"
              >
                {showLocationPicker ? tr("Tutup", "Close") : fix ? tr("Ubah", "Change") : tr("Atur", "Set")}
              </button>
            </div>
            {(showLocationPicker || !fix) && (
              <div className="animate-fadeIn">
                <LocationPicker location={location} onDone={() => setShowLocationPicker(false)} />
              </div>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-[#123027] mb-2">{tr("Perkiraan jarak dari kamu", "Approximate distance from you")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {DISTANCE_OPTIONS.map((dist) => {
                const selected = distanceEstimate === dist;
                return (
                  <button
                    key={dist}
                    type="button"
                    onClick={() => setDistanceEstimate(dist)}
                    aria-pressed={selected}
                    className={`py-2.5 rounded-xl text-xs font-bold transition ${
                      selected
                        ? "bg-[#075640] text-white"
                        : "bg-white border border-[var(--community-border)] text-[#123027] hover:bg-gray-50"
                    }`}
                  >
                    {dist}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5 flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] text-[var(--community-accent)] shrink-0 mt-0.5">verified_user</span>
            <p className="text-[11px] text-emerald-950 leading-relaxed">
              {tr(
                "Tanpa nama atau nomor HP. Laporan dicocokkan dengan data satelit, lalu dicek petugas.",
                "No name or phone number. Your report is matched with satellite data, then checked by an officer."
              )}
            </p>
          </div>

          {submitError && (
            <p className="text-xs rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 font-medium" role="alert">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#ba1a1a] hover:bg-[#a01616] py-3.5 text-sm font-bold text-white transition active:scale-[0.99] disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
            {submitting ? tr("Mengirim laporan…", "Sending report…") : tr("Kirim Laporan", "Send Report")}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function LaporPage() {
  const { tr } = useTranslation();
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs animate-pulse">{tr("Memuat form…", "Loading form…")}</div>}>
      <ReportPageContent />
    </Suspense>
  );
}
