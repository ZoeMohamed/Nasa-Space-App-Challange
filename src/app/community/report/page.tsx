"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import LocationPicker from "../components/LocationPicker";
import type { LocationSource } from "../lib/geo";
import { getOrCreateSubmitterToken } from "../lib/submitterToken";
import { useLocationState } from "../lib/useLocation";
import type { ReportCreateResponse } from "@/types";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/gif"];
const VALID_SOURCES: LocationSource[] = ["gps", "manual-coords", "manual-area"];

const REPORT_CATEGORIES = [
  { id: "api", label: "Api terlihat" },
  { id: "asap", label: "Asap" },
  { id: "bekas", label: "Lahan bekas terbakar" },
  { id: "lainnya", label: "Lainnya" },
];

const DISTANCE_OPTIONS = ["< 100 m", "100-500 m", "> 500 m"];

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

function ReportPageContent() {
  const searchParams = useSearchParams();
  const location = useLocationState();
  const didInitFromQuery = useRef(false);

  // Form State
  const [selectedCategory, setSelectedCategory] = useState("asap");
  const [distanceEstimate, setDistanceEstimate] = useState("100-500 m");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [photos, setPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedReport, setSubmittedReport] = useState<ReportCreateResponse | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Prefill from coordinates query parameter if present
  useEffect(() => {
    if (didInitFromQuery.current) return;
    didInitFromQuery.current = true;

    const latParam = searchParams.get("lat");
    const lonParam = searchParams.get("lon");
    const sourceParam = searchParams.get("source");
    if (!latParam || !lonParam) return;

    const lat = Number(latParam);
    const lon = Number(lonParam);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const source: LocationSource = VALID_SOURCES.includes(sourceParam as LocationSource)
      ? (sourceParam as LocationSource)
      : "manual-coords";

    location.setManualFix({ lat, lon, source });
  }, [searchParams, location]);

  // Default coordinate if none picked yet
  const displayLat = location.fix ? location.fix.lat : -2.9681;
  const displayLon = location.fix ? location.fix.lon : 114.2153;
  const accuracyText = location.fix?.accuracyMeters
    ? `Akurasi ±${Math.round(location.fix.accuracyMeters)} m`
    : "GPS otomatis · akurasi ±15 m";

  function handlePhotoAdd(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError("Format foto harus JPEG, PNG, atau GIF.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("Ukuran foto maksimal 5MB.");
      return;
    }
    if (photos.length >= 4) {
      setPhotoError("Maksimal 4 foto per laporan.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPhotos((prev) => [...prev, { file, previewUrl }]);
    setPhotoError(null);
    event.target.value = "";
  }

  function handleRemovePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    const categoryLabel = REPORT_CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? "Laporan";
    const finalDescription = description.trim()
      ? `[${categoryLabel} · Jarak ${distanceEstimate}] ${description.trim()}`
      : `[${categoryLabel} · Jarak ${distanceEstimate}] Terpantau di sekitar Desa Bahaur / Pulang Pisau`;

    setSubmitting(true);
    try {
      let photoBase64: string | undefined;
      if (photos.length > 0) {
        photoBase64 = await readFileAsBase64(photos[0].file);
      }

      const token = getOrCreateSubmitterToken();

      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: displayLat,
          lon: displayLon,
          description: finalDescription,
          observedAt: new Date().toISOString(),
          submitterToken: token,
          photoBase64,
        }),
      });

      const body = (await response.json()) as ReportCreateResponse & { detail?: string; error?: string };

      if (!response.ok) {
        throw new Error(body.detail ?? body.error ?? "Gagal mengirim laporan.");
      }

      setSubmittedReport(body);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Gagal mengirim laporan.");
    } finally {
      setSubmitting(false);
    }
  }

  // If report submitted, show Screen 05: Status Laporan
  if (submittedReport) {
    return (
      <div className="max-w-xl mx-auto space-y-5 animate-fadeIn">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/community/saya"
            className="inline-flex items-center gap-1 text-xs font-bold text-[#123027] hover:text-[var(--community-accent)] transition"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Laporan saya</span>
          </Link>
        </div>

        {/* Success Banner (Figma Screen 05) */}
        <div className="rounded-3xl bg-gradient-to-br from-[#0c2e22] to-[#12382c] text-white p-5 space-y-1.5 shadow-md">
          <div className="flex items-center gap-2 text-emerald-200">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-[14px] font-bold">
              ✓
            </span>
            <span className="text-sm font-bold text-white">Terima kasih, laporan terkirim!</span>
          </div>
          <p className="text-xs text-emerald-100/90 pl-8 leading-relaxed">
            Kamu akan mendapat notifikasi setiap kali status laporanmu berubah.
          </p>
        </div>

        {/* Current Report Summary Card */}
        <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 flex items-center gap-3.5 shadow-xs">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-amber-800 to-amber-950 flex items-center justify-center text-white shrink-0 overflow-hidden shadow-xs">
            <span className="material-symbols-outlined text-[24px]">cloud</span>
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-mono text-[var(--community-ink-muted)]">
              {submittedReport.id.slice(0, 8).toUpperCase()}
            </span>
            <h3 className="text-xs md:text-sm font-bold text-[#123027] truncate">
              {submittedReport.description}
            </h3>
            <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">
              Pulang Pisau · Baru saja
            </p>
          </div>
        </div>

        {/* Perjalanan Laporanmu (Timeline) */}
        <section className="rounded-3xl border border-[var(--community-border)] bg-white p-5 space-y-4 shadow-xs">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--community-ink-muted)]">
            Perjalanan laporanmu
          </h2>

          <div className="space-y-4 text-xs">
            {/* Step 1 */}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="h-5 w-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[12px] font-bold shrink-0">
                  ✓
                </span>
                <span className="w-0.5 h-10 bg-emerald-600 my-0.5" />
              </div>
              <div className="pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#123027]">01 Laporan &amp; bukti masuk</span>
                  <span className="text-[10px] text-[var(--community-ink-muted)]">09.42 WIB</span>
                </div>
                <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">
                  Foto &amp; lokasi GPS ±15 m tersimpan
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="h-5 w-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[12px] font-bold shrink-0">
                  ✓
                </span>
                <span className="w-0.5 h-10 bg-emerald-600 my-0.5" />
              </div>
              <div className="pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#123027]">02 Pemeriksaan awal AI</span>
                  <span className="text-[10px] text-[var(--community-ink-muted)]">09.43 WIB</span>
                </div>
                <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">
                  Asap teridentifikasi pada laporan. Dipetakan ke sistem monitoring.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="h-5 w-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0 ring-4 ring-amber-100 animate-pulse">
                  03
                </span>
                <span className="w-0.5 h-10 bg-gray-200 my-0.5" />
              </div>
              <div className="pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#123027]">03 Validasi petugas</span>
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                    Sedang ditinjau
                  </span>
                </div>
                <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">
                  Petugas Manggala Agni memeriksa bukti &amp; lokasi
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-3 opacity-50">
              <div className="flex flex-col items-center">
                <span className="h-5 w-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[11px] font-bold shrink-0">
                  04
                </span>
              </div>
              <div className="pt-0.5">
                <span className="font-bold text-gray-600">04 Tindak lanjut</span>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Patroli / pemadaman jika tervalidasi
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Appreciation card */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-center gap-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white font-extrabold text-sm">
            2
          </span>
          <p className="text-xs text-emerald-950 font-medium leading-relaxed">
            Laporanmu sudah membantu petugas menemukan kebakaran lebih cepat. Terima kasih sudah menjaga hutan.
          </p>
        </div>

        <Link
          href="/community"
          className="block w-full text-center rounded-xl bg-[#0c2e22] text-white py-3 text-xs md:text-sm font-bold shadow-xs transition active:scale-[0.99]"
        >
          Kembali ke Beranda
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-5 pb-8">
      {/* Top Bar (Figma Screen 04: Lapor Kebakaran) */}
      <div className="flex items-center justify-between pb-1">
        <Link
          href="/community"
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5 text-[#123027] transition"
          aria-label="Tutup"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </Link>
        <div className="text-center">
          <h1 className="text-sm font-black text-[#123027]">Lapor kebakaran</h1>
          <p className="text-[11px] text-[var(--community-ink-muted)]">Langkah 1 dari 2 · Bukti &amp; lokasi</p>
        </div>
        <div className="w-8" />
      </div>

      {/* Apa yang kamu lihat? */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-[#123027]">Apa yang kamu lihat?</label>
        <div className="flex flex-wrap gap-2">
          {REPORT_CATEGORIES.map((cat) => {
            const selected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  selected
                    ? "bg-[#075640] text-white shadow-xs"
                    : "bg-white border border-[var(--community-border)] text-[#123027] hover:bg-gray-50"
                }`}
              >
                {selected && <span className="material-symbols-outlined text-[15px]">check</span>}
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Foto bukti */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-[#123027]">Foto bukti</label>
          <span className="text-[11px] text-[var(--community-ink-muted)]">
            {photos.length} / 4 foto
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Photo Previews */}
          {photos.map((item, idx) => (
            <div key={idx} className="relative h-20 w-20 rounded-2xl overflow-hidden border border-gray-200 shadow-2xs group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.previewUrl} alt="Preview" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemovePhoto(idx)}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 text-white flex items-center justify-center text-[12px] hover:bg-rose-600 transition"
              >
                ✕
              </button>
            </div>
          ))}

          {/* Add Photo Button */}
          {photos.length < 4 && (
            <label className="h-20 w-20 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 text-[var(--community-accent)] flex flex-col items-center justify-center cursor-pointer transition active:scale-95">
              <span className="material-symbols-outlined text-[24px]">add_a_photo</span>
              <span className="text-[10px] font-bold mt-1">+ Tambah</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif"
                onChange={handlePhotoAdd}
                className="hidden"
              />
            </label>
          )}
        </div>

        <p className="text-[11px] text-[var(--community-ink-muted)] leading-relaxed">
          Ambil foto dari jarak aman. Waktu &amp; GPS foto dipakai untuk verifikasi.
        </p>
        {photoError && <p className="text-xs text-rose-600 font-medium">{photoError}</p>}
      </div>

      {/* Lokasi kejadian */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-[#123027]">Lokasi kejadian</label>
        <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3.5 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <span className="material-symbols-outlined text-[20px]">location_on</span>
            </span>
            <div className="min-w-0">
              <div className="text-xs font-mono font-bold text-[#123027]">
                {displayLat.toFixed(4)}, {displayLon.toFixed(4)}
              </div>
              <div className="text-[10px] text-[var(--community-ink-muted)] truncate mt-0.5">
                {accuracyText}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowLocationPicker(!showLocationPicker)}
            className="shrink-0 text-xs font-bold text-[var(--community-accent)] hover:underline"
          >
            {showLocationPicker ? "Tutup" : "Geser pin"}
          </button>
        </div>

        {showLocationPicker && (
          <div className="animate-fadeIn pt-1">
            <LocationPicker location={location} />
          </div>
        )}
      </div>

      {/* Perkiraan jarak dari kamu */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-[#123027]">Perkiraan jarak dari kamu</label>
        <div className="grid grid-cols-3 gap-2">
          {DISTANCE_OPTIONS.map((dist) => {
            const selected = distanceEstimate === dist;
            return (
              <button
                key={dist}
                type="button"
                onClick={() => setDistanceEstimate(dist)}
                className={`py-2 rounded-xl text-xs font-bold transition-all ${
                  selected
                    ? "bg-[#075640] text-white shadow-xs"
                    : "bg-white border border-[var(--community-border)] text-[#123027] hover:bg-gray-50"
                }`}
              >
                {dist}
              </button>
            );
          })}
        </div>
      </div>

      {/* Keterangan (opsional) */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-[#123027]" htmlFor="keterangan">
          Keterangan (opsional)
        </label>
        <textarea
          id="keterangan"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Asap putih tebal dari arah lahan gambut belakang kebun, sejak sekitar jam 9 pagi."
          rows={3}
          className="w-full rounded-2xl border border-[var(--community-border)] bg-white p-3 text-xs md:text-sm text-[#123027] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
        />
      </div>

      {/* Kirim secara anonim */}
      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3.5 flex items-center justify-between gap-3 shadow-xs">
        <div>
          <div className="text-xs font-bold text-[#123027]">Kirim secara anonim</div>
          <div className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">
            Nomor HP tetap dipakai untuk konfirmasi petugas
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsAnonymous(!isAnonymous)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            isAnonymous ? "bg-[#075640]" : "bg-gray-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              isAnonymous ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* AI & Officer Verification Trust Card */}
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5 flex items-start gap-3">
        <span className="material-symbols-outlined text-[20px] text-[var(--community-accent)] shrink-0 mt-0.5">
          verified_user
        </span>
        <p className="text-[11px] text-emerald-950 leading-relaxed font-medium">
          Laporanmu diperiksa awal oleh AI, lalu divalidasi petugas Manggala Agni memeriksa bukti &amp; lokasi. Laporan melengkapi data satelit MODIS / VIIRS.
        </p>
      </div>

      {submitError && (
        <p className="text-xs rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 font-medium">
          {submitError}
        </p>
      )}

      {/* Primary Submit Button */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-[#0c2e22] hover:bg-[#071e16] py-3.5 text-xs md:text-sm font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
      >
        {submitting ? "Mengirim laporan…" : "Lanjut"}
      </button>
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
