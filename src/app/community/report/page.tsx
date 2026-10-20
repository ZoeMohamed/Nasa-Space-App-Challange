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

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/gif"];
const VALID_SOURCES: LocationSource[] = ["gps", "manual-coords", "manual-area"];

const REPORT_CATEGORIES = [
  { id: "api", label: "Api terlihat", icon: "local_fire_department" },
  { id: "asap", label: "Asap", icon: "cloud" },
  { id: "bekas", label: "Lahan bekas terbakar", icon: "landscape" },
  { id: "lainnya", label: "Lainnya", icon: "more_horiz" },
];

const DISTANCE_OPTIONS = ["< 100 m", "100–500 m", "> 500 m"];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file foto."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Gagal membaca file foto."));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`;
}

/** Timeline built only from what the backend actually returned for this report. */
function SubmittedView({ report }: { report: ReportCreateResponse }) {
  const links = report.satelliteLinks ?? [];
  const nearestLink = [...links].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))[0];
  const place = formatAdminFull(report.admin) ?? `${report.lat.toFixed(4)}, ${report.lon.toFixed(4)}`;

  const steps = [
    {
      done: true,
      title: "Laporan terkirim",
      time: formatClock(report.createdAt),
      body: `Tersimpan dengan lokasi ${place}${report.photoFilename ? " dan 1 foto" : " tanpa foto"}.`,
    },
    {
      done: !report.correlationWarning,
      title: "Dicocokkan otomatis dengan data satelit",
      time: null,
      body: report.correlationWarning
        ? "Pencocokan otomatis belum bisa dijalankan (data satelit live sedang tidak tersedia). Laporan tetap tersimpan."
        : links.length > 0
          ? `${links.length} deteksi satelit dalam 5 km & 24 jam dari laporanmu${nearestLink?.distanceKm != null ? ` (terdekat ${nearestLink.distanceKm.toFixed(1)} km)` : ""}. Ini belum berarti kebakaran terkonfirmasi.`
          : "Belum ada deteksi satelit dalam 5 km & 24 jam dari laporanmu. Laporan tetap diteruskan ke petugas.",
    },
    { done: false, title: "Ditinjau petugas", time: null, body: "Menunggu petugas memeriksa bukti & lokasi." },
    { done: false, title: "Tindak lanjut", time: null, body: "Patroli / pemadaman jika laporan terverifikasi." },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fadeIn">
      <div className="rounded-3xl bg-gradient-to-br from-[#0c2e22] to-[#12382c] text-white p-5 md:p-6 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[14px] font-bold">✓</span>
          <span className="text-sm md:text-base font-bold">Terima kasih, laporan terkirim!</span>
        </div>
        <p className="text-xs text-emerald-100/90 pl-8 leading-relaxed">
          Status laporanmu akan muncul di halaman Notifikasi setiap kali berubah.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4">
        <p className="text-[11px] text-[var(--community-ink-muted)]">ID laporan {report.id.slice(0, 8).toUpperCase()}</p>
        <h2 className="text-sm font-bold text-[#123027] mt-0.5">{report.description}</h2>
        <p className="text-[11px] text-[var(--community-ink-muted)] mt-1">{place}</p>
      </div>

      <section className="rounded-3xl border border-[var(--community-border)] bg-white p-5 space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--community-ink-muted)]">Perjalanan laporanmu</h2>
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
          Lihat detail laporan
        </Link>
        <Link href="/community" className="block text-center rounded-xl bg-[#0c2e22] text-white py-3 text-sm font-bold">
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}

function ReportPageContent() {
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
      setPhotoError("Format foto harus JPEG, PNG, atau GIF.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("Ukuran foto maksimal 5 MB.");
      return;
    }
    setPhoto({ file, previewUrl: URL.createObjectURL(file) });
    setPhotoError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!fix) {
      setSubmitError("Atur lokasi kejadian dulu sebelum mengirim laporan.");
      setShowLocationPicker(true);
      return;
    }
    setSubmitError(null);
    const categoryLabel = REPORT_CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? "Laporan";
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
      if (!response.ok) throw new Error(body.detail ?? body.error ?? "Gagal mengirim laporan.");
      setSubmittedReport(body);
      window.scrollTo({ top: 0 });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Gagal mengirim laporan.");
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
          aria-label="Tutup"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </Link>
        <div>
          <h1 className="text-base md:text-xl font-black text-[#123027]">Lapor kebakaran</h1>
          <p className="text-[11px] md:text-xs text-[var(--community-ink-muted)]">
            Isi yang kamu tahu saja — lokasi wajib, sisanya opsional.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr] gap-5 md:gap-8 items-start">
        {/* Left: what happened */}
        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-[#123027] mb-2">Apa yang kamu lihat?</legend>
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
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <span className="text-xs font-bold text-[#123027]">Foto bukti (opsional, 1 foto)</span>
            {photo ? (
              <div className="relative overflow-hidden rounded-2xl border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt="Pratinjau foto bukti" className="h-48 md:h-64 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-600"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                  Hapus
                </button>
              </div>
            ) : (
              <label className="flex h-32 md:h-44 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 text-[var(--community-accent)] hover:bg-emerald-50 transition">
                <span className="material-symbols-outlined text-[28px]">add_a_photo</span>
                <span className="text-xs font-bold">Tambah foto</span>
                <span className="text-[11px] text-[var(--community-ink-muted)]">JPEG / PNG / GIF, maks. 5 MB</span>
                <input type="file" accept="image/jpeg,image/png,image/gif" onChange={handlePhotoAdd} className="sr-only" />
              </label>
            )}
            <p className="text-[11px] text-[var(--community-ink-muted)]">Ambil foto dari jarak aman — jangan mendekati api.</p>
            {photoError && <p className="text-xs text-rose-600 font-medium">{photoError}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#123027]" htmlFor="keterangan">
              Keterangan (opsional)
            </label>
            <textarea
              id="keterangan"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contoh: asap putih tebal dari arah lahan gambut belakang kebun, sejak sekitar jam 9 pagi."
              rows={4}
              className="w-full rounded-2xl border border-[var(--community-border)] bg-white p-3 text-sm text-[#123027] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Right: where + send (sticky on desktop) */}
        <div className="space-y-5 md:sticky md:top-24">
          <div className="space-y-2">
            <span className="text-xs font-bold text-[#123027]">Lokasi kejadian</span>
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
                    {fix ? (fix.label ?? fixRegionLabel ?? `${fix.lat.toFixed(4)}, ${fix.lon.toFixed(4)}`) : "Lokasi belum diatur"}
                  </div>
                  <div className="text-[11px] text-[var(--community-ink-muted)] truncate mt-0.5">
                    {fix
                      ? fix.source === "gps"
                        ? `GPS · akurasi ±${Math.round(fix.accuracyMeters ?? 0)} m`
                        : "Dipilih manual — titik perkiraan"
                      : "Wajib diisi sebelum mengirim"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationPicker((open) => !open)}
                className="shrink-0 text-xs font-bold text-[var(--community-accent)] hover:underline"
              >
                {showLocationPicker ? "Tutup" : fix ? "Ubah" : "Atur"}
              </button>
            </div>
            {(showLocationPicker || !fix) && (
              <div className="animate-fadeIn">
                <LocationPicker location={location} onDone={() => setShowLocationPicker(false)} />
              </div>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-[#123027] mb-2">Perkiraan jarak dari kamu</legend>
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
              Laporan dikirim tanpa nama atau nomor HP — hanya ditandai per perangkat agar kamu bisa memantau statusnya.
              Lokasi & waktunya otomatis dicocokkan dengan deteksi satelit MODIS / VIIRS terdekat, lalu ditinjau petugas.
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
            {submitting ? "Mengirim laporan…" : "Kirim Laporan"}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function LaporPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs animate-pulse">Memuat form…</div>}>
      <ReportPageContent />
    </Suspense>
  );
}
