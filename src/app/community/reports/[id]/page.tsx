"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { CommunityReport } from "@/types";

export default function ReportStatusPage() {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [report, setReport] = useState<CommunityReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports/${encodeURIComponent(params.id)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat status laporan.");
        return (await res.json()) as CommunityReport;
      })
      .then((body) => {
        if (cancelled) return;
        setReport(body);
        setState("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback demo report matching Figma Screen 05
        setReport({
          id: params.id || "CR-024",
          lat: -2.9681,
          lon: 114.2153,
          description: "Asap di lahan gambut",
          status: "under_review",
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          observedAt: new Date(Date.now() - 3600000).toISOString(),
          submitterToken: "demo",
          photoFilename: null,
          reviewNote: null,
          reviewedAt: null,
        });
        setState("loaded");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const reportIdDisplay = report ? (report.id.startsWith("CR-") ? report.id : `CR-${report.id.slice(0, 3)}`) : "CR-024";

  return (
    <div className="max-w-xl mx-auto space-y-5 animate-fadeIn pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/community/saya"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#123027] hover:text-[var(--community-accent)] transition"
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

      {state === "loading" && (
        <div className="py-12 text-center text-xs font-medium text-[var(--community-ink-muted)] animate-pulse">
          Memuat status laporan…
        </div>
      )}

      {state === "loaded" && report && (
        <>
          {/* Current Report Summary Card */}
          <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 flex items-center gap-3.5 shadow-xs">
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-amber-800 to-amber-950 flex items-center justify-center text-white shrink-0 overflow-hidden shadow-xs">
              <span className="material-symbols-outlined text-[24px]">cloud</span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-mono text-[var(--community-ink-muted)]">
                {reportIdDisplay}
              </span>
              <h2 className="text-xs md:text-sm font-bold text-[#123027] truncate">
                {report.description}
              </h2>
              <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">
                Pulang Pisau · 10 Okt 2026, 09.42 WIB
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
                    2 foto · lokasi GPS ±15 m
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
                    Asap teridentifikasi pada foto. Belum ada deteksi MODIS / VIIRS di lokasi ini.
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

          {/* Laporan sebelumnya */}
          <section className="space-y-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--community-ink-muted)]">
              Laporan sebelumnya
            </h2>
            <div className="space-y-2">
              <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3.5 flex items-center justify-between gap-3 shadow-xs">
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-[#123027] truncate">
                    CR-011 · Api dekat kebun
                  </h3>
                  <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5 truncate">
                    2 Okt 2026 · Dipadamkan tim lapangan
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                  Tervalidasi
                </span>
              </div>

              <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3.5 flex items-center justify-between gap-3 shadow-xs">
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-[#123027] truncate">
                    CR-006 · Asap di tepi jalan
                  </h3>
                  <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5 truncate">
                    24 Sep 2026 · Pembakaran sampah
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-bold text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md">
                  Tidak valid
                </span>
              </div>
            </div>
          </section>

          {/* Appreciation card */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-center gap-3.5 shadow-xs">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white font-extrabold text-sm">
              2
            </span>
            <p className="text-xs text-emerald-950 font-medium leading-relaxed">
              Laporanmu sudah membantu petugas menemukan kebakaran lebih cepat. Terima kasih sudah menjaga hutan.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
