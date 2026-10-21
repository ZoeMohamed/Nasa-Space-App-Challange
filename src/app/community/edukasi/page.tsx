"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadCheckedItems } from "../lib/checklistProgress";
import { TOTAL_CHECKLIST_ITEMS } from "./siaga/checklistData";
import { factText, HIGHLIGHT_FACTS, TONE_CLASSES } from "./facts";
import {
  BagIllustration,
  SmokeEntryIllustration,
  SimulationEntryIllustration,
  LocalHelpEntryIllustration,
} from "@/components/community/illustrations";
import { useTranslation } from "@/lib/i18n/LanguageContext";

/**
 * Rebuilt Edukasi hub ("Siap Sebelum Asap Datang"). Replaces the old
 * article-only landing with 4 real sub-experiences (A–D). The 3 original
 * articles (articles.ts) are kept and surfaced as a "Baca lebih lanjut" list
 * on /community/edukasi/sekitar rather than deleted.
 */

interface EntryCard {
  href: string;
  title: readonly [string, string];
  subtitle: readonly [string, string];
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
}

const ENTRY_CARDS: EntryCard[] = [
  {
    href: "/community/edukasi/siaga",
    title: ["Siapkan Tas Siaga", "Pack a Go-Bag"],
    subtitle: ["Checklist dokumen, tas darurat, dan rencana keluarga", "Checklist for documents, an emergency bag, and a family plan"],
    icon: BagIllustration,
    tint: "bg-emerald-50",
  },
  {
    href: "/community/edukasi/asap",
    title: ["Lindungi Keluarga", "Protect Your Family"],
    subtitle: ["Cara praktis melindungi diri dari asap kebakaran", "Practical ways to protect yourself from fire smoke"],
    icon: SmokeEntryIllustration,
    tint: "bg-orange-50",
  },
  {
    href: "/community/edukasi/simulasi",
    title: ["Simulasi Keadaan Darurat", "Emergency Drill"],
    subtitle: ["Latihan “apa yang harus saya lakukan?” lewat skenario", "Practise “what should I do?” through scenarios"],
    icon: SimulationEntryIllustration,
    tint: "bg-amber-50",
  },
  {
    href: "/community/edukasi/sekitar",
    title: ["Bantuan di Sekitarku", "Help Near Me"],
    subtitle: ["Kanal pelaporan warga dan sumber resmi terdekat", "Citizen reporting channels and official sources"],
    icon: LocalHelpEntryIllustration,
    tint: "bg-emerald-50",
  },
];

export default function EdukasiPage() {
  const { tr, language } = useTranslation();
  const [checked, setChecked] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => setChecked(loadCheckedItems()));
  }, []);

  const doneCount = checked ? Object.values(checked).filter(Boolean).length : 0;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-lg font-extrabold text-[#123027]">{tr("Siap Sebelum Asap Datang", "Ready Before the Smoke Arrives")}</h1>
        <p className="text-sm text-[var(--community-ink-muted)] mt-1 leading-relaxed">
          {tr(
            "Kesiapan kecil hari ini membuat keluarga Anda lebih tenang saat musim kabut asap tiba. Pilih salah satu di bawah untuk mulai. Semua progres tersimpan otomatis di perangkat ini.",
            "A little preparation today keeps your family calmer when haze season comes. Pick one below to start. All progress is saved automatically on this device."
          )}
        </p>
      </section>

      {/* Emergency safety notice banner */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white">
          <span className="material-symbols-outlined text-[18px]">emergency</span>
        </span>
        <p className="text-[11px] text-rose-900 leading-relaxed">
          {tr(
            "Jika Anda dalam bahaya langsung, segera hubungi layanan darurat setempat atau ikuti instruksi evakuasi resmi (BNPB/BMKG/aparat desa). Aplikasi ini adalah alat bantu edukasi dan bukan pengganti layanan darurat.",
            "If you are in immediate danger, call local emergency services right away or follow official evacuation instructions (BNPB/BMKG/village officials). This app is an education aid, not a replacement for emergency services."
          )}
        </p>
      </div>

      {/* Checklist progress indicator */}
      <Link
        href="/community/edukasi/siaga"
        className="block rounded-2xl border border-[var(--community-border)] bg-white p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[var(--community-ink-muted)]">{tr("Progres checklist siaga", "Preparedness checklist progress")}</p>
            <p className="text-sm font-bold text-[#123027] mt-0.5">
              {checked === null
                ? tr("Memuat…", "Loading…")
                : tr(`${doneCount} dari ${TOTAL_CHECKLIST_ITEMS} selesai`, `${doneCount} of ${TOTAL_CHECKLIST_ITEMS} done`)}
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

      {/* Sourced facts — numbers link to the reference list on /community/edukasi/fakta */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#123027]">{tr("Fakta karhutla yang perlu kamu tahu", "Fire facts you should know")}</h2>
            <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">
              {tr("Dari World Bank, jurnal ilmiah, BNPB, dan CDC.", "From the World Bank, scientific journals, BNPB, and the CDC.")}
            </p>
          </div>
          <Link href="/community/edukasi/fakta" className="shrink-0 text-xs font-bold text-[var(--community-accent)] hover:underline">
            {tr("Semua fakta & pustaka", "All facts & references")}
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {HIGHLIGHT_FACTS.map((fact) => {
            const text = factText(fact, language);
            return (
            <Link
              key={fact.title}
              href="/community/edukasi/fakta"
              className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-1.5 hover:border-emerald-300 transition"
            >
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${TONE_CLASSES[fact.tone]}`}>
                <span className="material-symbols-outlined text-[18px]">{fact.icon}</span>
              </span>
              <p className="text-lg font-extrabold text-[#123027] leading-tight">{text.value}</p>
              <p className="text-xs font-semibold text-[#123027]">{text.title}</p>
              <p className="text-[11px] text-[var(--community-ink-muted)]">
                {tr("Sumber", "Source")} [{fact.refs.join(", ")}]
              </p>
            </Link>
            );
          })}
        </div>
      </section>

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
                <h2 className="text-sm font-bold text-[#123027]">{tr(...card.title)}</h2>
                <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5 leading-relaxed">
                  {tr(...card.subtitle)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
