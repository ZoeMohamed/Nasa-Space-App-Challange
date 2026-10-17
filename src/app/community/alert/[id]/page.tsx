"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocationState } from "../../lib/useLocation";
import { haversineKm, formatDistanceKm } from "../../lib/geo";
import type { HotspotApiResponse, HotspotMarker } from "@/types";

export default function AlertDetailPage() {
  const params = useParams<{ id: string }>();
  const location = useLocationState();
  const { fix } = location;

  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [marker, setMarker] = useState<HotspotMarker | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hotspots", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat data titik panas.");
        return (await res.json()) as HotspotApiResponse;
      })
      .then((body) => {
        if (cancelled) return;
        const found = body.markers.find((m) => m.id === params.id) ?? body.markers[0] ?? null;
        setMarker(found);
        setState("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback demo marker if network or ID not found
        setMarker({
          id: params.id || "demo-01",
          lat: -3.125 + 0.015,
          lng: 114.15 + 0.018,
          label: "Titik Panas Peatland Bahaur",
          severity: "HIGH",
          sensor: "VIIRS",
          satellite: "Suomi-NPP",
          confidenceLabel: "Tinggi (94%)",
          matchStatus: "MATCHED",
          frp: 38.4,
          acquiredAt: new Date().toISOString(),
        });
        setState("loaded");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const distanceKm = fix && marker ? haversineKm(fix, { lat: marker.lat, lon: marker.lng }) : 2.4;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Peringatan Siaga Titik Api - AGNIBHŪMI",
          text: `Titik api ${formatDistanceKm(distanceKm)} dari lokasi Desa Bahaur, Pulang Pisau. Angin berhembus ke pemukiman. Harap siaga dan pakai masker.`,
          url: typeof window !== "undefined" ? window.location.href : "",
        });
      } catch {
        /* user cancelled */
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2500);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Top Bar with Back and Share */}
      <div className="flex items-center justify-between">
        <Link
          href="/community"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#123027] hover:text-[var(--community-accent)] py-1 pr-2 transition"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>Detail peringatan</span>
        </Link>
        <button
          type="button"
          onClick={handleShare}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white border border-[var(--community-border)] text-[#123027] hover:bg-emerald-50 transition active:scale-95 shadow-xs"
          title="Bagikan ke keluarga"
        >
          <span className="material-symbols-outlined text-[18px]">
            {shareSuccess ? "check" : "share"}
          </span>
        </button>
      </div>

      {state === "loading" && (
        <div className="py-12 text-center">
          <span className="text-sm font-semibold text-[var(--community-ink-muted)] animate-pulse">
            Memuat detail peringatan…
          </span>
        </div>
      )}

      {state === "loaded" && (
        <div className="space-y-4">
          
          {/* Status Badges Row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold px-3 py-1 rounded-full">
              <span className="h-2 w-2 rounded-full bg-rose-600 animate-ping" />
              Siaga · Dekat lokasimu
            </span>
            <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold px-3 py-1 rounded-full">
              <span className="material-symbols-outlined text-[14px]">verified</span>
              Tervalidasi petugas
            </span>
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-2xl font-black text-[#123027] tracking-tight">
              Titik api {formatDistanceKm(distanceKm)} dari lokasimu
            </h1>
            <p className="text-xs text-[var(--community-ink-muted)] mt-1 font-medium">
              Timur laut Desa Bahaur, Pulang Pisau
            </p>
            <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">
              17 Okt 2026 · terdeteksi 07.12 WIB
            </p>
          </div>

          {/* Trajectory / Distance Visual Diagram Card */}
          <div className="rounded-3xl border border-[var(--community-border)] bg-gradient-to-br from-[#e8f2ec] to-[#ddead2] p-5 relative overflow-hidden shadow-xs">
            <div className="text-[11px] font-bold text-emerald-900/70 mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">navigation</span>
              <span>Lokasimu + titik api</span>
            </div>

            {/* Visual Route Line */}
            <div className="relative py-6 flex items-center justify-between px-6">
              {/* Point 1: Lokasimu */}
              <div className="flex flex-col items-center z-10">
                <span className="h-5 w-5 rounded-full bg-blue-600 ring-4 ring-white shadow-md flex items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-white" />
                </span>
                <span className="mt-1.5 text-[10px] font-bold text-blue-900 bg-white/90 px-2 py-0.5 rounded-full shadow-xs">
                  Lokasimu
                </span>
              </div>

              {/* Connecting trajectory dashed line with distance tag */}
              <div className="flex-1 mx-3 relative flex items-center justify-center">
                <div className="w-full border-t-2 border-dashed border-red-500/70" />
                <span className="absolute -top-3.5 bg-red-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-xs">
                  {formatDistanceKm(distanceKm)}
                </span>
              </div>

              {/* Point 2: Titik Api */}
              <div className="flex flex-col items-center z-10">
                <span className="h-5 w-5 rounded-full bg-red-600 ring-4 ring-white shadow-md flex items-center justify-center animate-pulse">
                  <span className="material-symbols-outlined text-[13px] text-white">local_fire_department</span>
                </span>
                <span className="mt-1.5 text-[10px] font-bold text-red-900 bg-white/90 px-2 py-0.5 rounded-full shadow-xs">
                  Titik Api
                </span>
              </div>
            </div>

            {/* Wind Trajectory Banner */}
            <div className="mt-2 flex items-center justify-center gap-2 bg-white/80 backdrop-blur-xs py-1.5 px-3 rounded-xl border border-emerald-200/60 shadow-2xs">
              <span className="material-symbols-outlined text-[16px] text-teal-800 animate-pulse">air</span>
              <span className="text-[11px] font-bold text-teal-950">
                Angin ke barat daya (mengarah ke pemukiman)
              </span>
            </div>
          </div>

          {/* 3 Metric Stats */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3 text-center shadow-xs">
              <span className="text-[10px] font-semibold text-[var(--community-ink-muted)]">Jarak</span>
              <div className="text-base font-black text-[#123027] mt-0.5">{formatDistanceKm(distanceKm)}</div>
            </div>
            <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3 text-center shadow-xs">
              <span className="text-[10px] font-semibold text-[var(--community-ink-muted)]">Arah</span>
              <div className="text-base font-black text-[#123027] mt-0.5">T. Laut</div>
            </div>
            <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3 text-center shadow-xs">
              <span className="text-[10px] font-semibold text-[var(--community-ink-muted)]">Keyakinan</span>
              <div className="text-base font-black text-emerald-800 mt-0.5">
                {marker?.confidenceLabel ?? "Tinggi"}
              </div>
            </div>
          </div>

          {/* Alert Callout Box */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] text-amber-700 shrink-0 mt-0.5">
              warning
            </span>
            <p className="text-xs text-amber-950 font-medium leading-relaxed">
              Angin 12 km/j bertiup ke arah desamu. Asap diperkirakan tiba dalam 1-2 jam.
            </p>
          </div>

          {/* Safety Checklist Card */}
          <section className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-3 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--community-ink-muted)]">
              Yang perlu kamu lakukan
            </h2>
            <ul className="space-y-2.5 text-xs text-[#123027] font-medium">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[12px] font-bold">
                  ✓
                </span>
                <span>Gunakan masker N95 saat keluar rumah</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[12px] font-bold">
                  ✓
                </span>
                <span>Tutup jendela dan ventilasi rumah</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[12px] font-bold">
                  ✓
                </span>
                <span>Siapkan tas siaga: dokumen, obat, air minum</span>
              </li>
              <li className="flex items-start gap-2.5 text-rose-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-800 text-[12px] font-bold">
                  !
                </span>
                <span>Jangan mendekat atau memadamkan api besar sendiri</span>
              </li>
            </ul>
          </section>

          {/* Emergency Contacts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3.5 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <span className="material-symbols-outlined text-[18px]">phone_in_talk</span>
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#123027] truncate">Darurat 112</div>
                  <div className="text-[10px] text-[var(--community-ink-muted)] truncate">Panggilan gratis 24 jam</div>
                </div>
              </div>
              <a
                href="tel:112"
                className="shrink-0 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition"
              >
                Telepon
              </a>
            </div>

            <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3.5 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[var(--community-accent)]">
                  <span className="material-symbols-outlined text-[18px]">verified_user</span>
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#123027] truncate">BPBD Pulang Pisau</div>
                  <div className="text-[10px] text-[var(--community-ink-muted)] truncate">Posko siaga karhutla</div>
                </div>
              </div>
              <a
                href="tel:0536322111"
                className="shrink-0 text-xs font-bold text-[var(--community-accent)] bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition"
              >
                Telepon
              </a>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 space-y-2.5">
            <Link
              href={`/community/report?lat=${marker?.lat ?? -3.125}&lon=${marker?.lng ?? 114.15}&source=manual-coords`}
              className="flex items-center justify-center gap-2 w-full text-center rounded-xl bg-[#0c2e22] hover:bg-[#071f16] py-3.5 text-xs md:text-sm font-bold text-white shadow-sm transition active:scale-[0.99]"
            >
              <span className="material-symbols-outlined text-[18px]">photo_camera</span>
              <span>Saya melihat api / asap — Lapor</span>
            </Link>

            <button
              type="button"
              onClick={handleShare}
              className="flex items-center justify-center gap-2 w-full text-center rounded-xl border border-[var(--community-border)] bg-white hover:bg-gray-50 py-3 text-xs md:text-sm font-bold text-[#123027] transition active:scale-[0.99]"
            >
              <span className="material-symbols-outlined text-[18px]">share</span>
              <span>Bagikan ke keluarga</span>
            </button>
          </div>

          {/* Caption */}
          <p className="text-[10px] text-[var(--community-ink-muted)] text-center leading-relaxed pt-2">
            Sumber: VIIRS (S-NPP) 07.12 WIB + 2 laporan warga, divalidasi petugas 07.40 WIB. Deteksi satelit adalah indikasi dan dapat berbeda dengan kondisi lapangan.
          </p>

        </div>
      )}
    </div>
  );
}
