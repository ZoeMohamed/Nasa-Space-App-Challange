"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadCheckedItems } from "../lib/checklistProgress";
import { TOTAL_CHECKLIST_ITEMS } from "./siaga/checklistData";
import {
  BagIllustration,
  SmokeEntryIllustration,
  SimulationEntryIllustration,
  LocalHelpEntryIllustration,
} from "@/components/community/illustrations";

/**
 * Rebuilt Edukasi hub ("Siap Sebelum Asap Datang"). Replaces the old
 * article-only landing with 4 real sub-experiences (A–D). The 3 original
 * articles (articles.ts) are kept and surfaced as a "Baca lebih lanjut" list
 * on /community/edukasi/sekitar rather than deleted.
 */

interface EntryCard {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
}

const ENTRY_CARDS: EntryCard[] = [
  {
    href: "/community/edukasi/siaga",
    title: "Siapkan Tas Siaga",
    subtitle: "Checklist dokumen, tas darurat, dan rencana keluarga",
    icon: BagIllustration,
    tint: "bg-emerald-50",
  },
  {
    href: "/community/edukasi/asap",
    title: "Lindungi Keluarga",
    subtitle: "Cara praktis melindungi diri dari asap kebakaran",
    icon: SmokeEntryIllustration,
    tint: "bg-orange-50",
  },
  {
    href: "/community/edukasi/simulasi",
    title: "Simulasi Keadaan Darurat",
    subtitle: "Latihan \"apa yang harus saya lakukan?\" lewat skenario",
    icon: SimulationEntryIllustration,
    tint: "bg-amber-50",
  },
  {
    href: "/community/edukasi/sekitar",
    title: "Bantuan di Sekitarku",
    subtitle: "Kanal pelaporan warga dan sumber resmi terdekat",
    icon: LocalHelpEntryIllustration,
    tint: "bg-emerald-50",
  },
];

export default function EdukasiPage() {
  const [checked, setChecked] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => setChecked(loadCheckedItems()));
  }, []);

  const doneCount = checked ? Object.values(checked).filter(Boolean).length : 0;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-lg font-extrabold text-[#123027]">Siap Sebelum Asap Datang</h1>
        <p className="text-sm text-[var(--community-ink-muted)] mt-1 leading-relaxed">
          Kesiapan kecil hari ini membuat keluarga Anda lebih tenang saat musim kabut asap tiba. Pilih salah
          satu di bawah untuk mulai — semua progres tersimpan otomatis di perangkat ini.
        </p>
      </section>

      {/* Emergency safety notice banner */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white">
          <span className="material-symbols-outlined text-[18px]">emergency</span>
        </span>
        <p className="text-[11px] text-rose-900 leading-relaxed">
          Jika Anda dalam bahaya langsung, segera hubungi layanan darurat setempat atau ikuti instruksi
          evakuasi resmi (BNPB/BMKG/aparat desa) — aplikasi ini adalah alat bantu edukasi dan bukan
          pengganti layanan darurat.
        </p>
      </div>

      {/* Checklist progress indicator */}
      <Link
        href="/community/edukasi/siaga"
        className="block rounded-2xl border border-[var(--community-border)] bg-white p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[var(--community-ink-muted)]">Progres checklist siaga</p>
            <p className="text-sm font-bold text-[#123027] mt-0.5">
              {checked === null ? "Memuat…" : `${doneCount} dari ${TOTAL_CHECKLIST_ITEMS} selesai`}
            </p>
          </div>
          <div className="h-2.5 w-20 rounded-full bg-gray-100 overflow-hidden shrink-0">
            <div
              className="h-full rounded-full bg-[var(--community-accent)] transition-all"
              style={{ width: `${checked === null ? 0 : Math.round((doneCount / TOTAL_CHECKLIST_ITEMS) * 100)}%` }}
            />
          </div>
        </div>
      </Link>

      {/* 4 entry cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {ENTRY_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-2xl border border-[var(--community-border)] bg-white p-4 flex items-start gap-3.5 hover:border-emerald-300 transition shadow-xs"
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${card.tint}`}>
                <Icon className="h-8 w-8" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#123027]">{card.title}</h2>
                <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5 leading-relaxed">
                  {card.subtitle}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
