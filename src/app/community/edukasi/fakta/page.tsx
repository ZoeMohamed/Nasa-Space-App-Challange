"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import {
  factText,
  HIGHLIGHT_FACTS,
  ISPU_CATEGORIES,
  MORE_FACTS,
  REFERENCES,
  referenceText,
  TONE_CLASSES,
  type Fact,
} from "../facts";

function RefMarks({ refs }: { refs: number[] }) {
  return (
    <span className="text-[11px] font-semibold text-[var(--community-accent)]">
      {refs.map((ref) => (
        <a key={ref} href={`#ref-${ref}`} className="hover:underline">
          [{ref}]
        </a>
      ))}
    </span>
  );
}

function FactCard({ fact }: { fact: Fact }) {
  const { language } = useTranslation();
  const text = factText(fact, language);
  return (
    <article className="rounded-2xl border border-[var(--community-border)] bg-white p-4 md:p-5 space-y-2">
      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${TONE_CLASSES[fact.tone]}`}>
        <span className="material-symbols-outlined text-[20px]">{fact.icon}</span>
      </span>
      <p className="text-xl md:text-2xl font-extrabold text-[#123027] leading-tight">{text.value}</p>
      <h3 className="text-sm font-bold text-[#123027]">{text.title}</h3>
      <p className="text-xs md:text-[13px] text-[var(--community-ink-muted)] leading-relaxed">
        {text.body} <RefMarks refs={fact.refs} />
      </p>
    </article>
  );
}

export default function FaktaPage() {
  const { tr, language } = useTranslation();
  return (
    <div className="space-y-7 max-w-4xl mx-auto">
      <div>
        <Link href="/community/edukasi" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--community-accent)]">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          {tr("Edukasi", "Learn")}
        </Link>
        <h1 className="text-xl md:text-2xl font-extrabold text-[#123027] mt-2">
          {tr("Fakta & Data Karhutla", "Forest & Land Fire Facts")}
        </h1>
        <p className="text-sm text-[var(--community-ink-muted)] mt-1 leading-relaxed">
          {tr(
            "Angka penting soal kebakaran hutan dan lahan di Indonesia beserta dampaknya. Setiap angka punya nomor rujukan. Klik untuk melihat sumbernya di daftar pustaka di bawah.",
            "Key numbers on Indonesia's forest and land fires and their impact. Every number has a reference number. Click it to see the source in the reference list below."
          )}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[#123027]">{tr("Dampak & penyebab", "Impact & causes")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...HIGHLIGHT_FACTS, ...MORE_FACTS].map((fact) => (
            <FactCard key={fact.title} fact={fact} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--community-border)] bg-white p-4 md:p-5 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-[#123027]">
            {tr("Membaca ISPU (Indeks Standar Pencemar Udara)", "Reading ISPU (Indonesia's Air Pollutant Standard Index)")}{" "}
            <RefMarks refs={[7]} />
          </h2>
          <p className="text-xs text-[var(--community-ink-muted)] mt-1 leading-relaxed">
            {tr(
              "ISPU adalah skala resmi Indonesia. Catatan: halaman Kualitas Udara di aplikasi ini memakai skala US AQI dari Open-Meteo. Angkanya tidak sama dengan ISPU, jadi jangan dibandingkan langsung.",
              "ISPU is Indonesia's official scale. Note: this app's Air Quality page uses the US AQI scale from Open-Meteo. Its numbers differ from ISPU, so don't compare them directly."
            )}
          </p>
        </div>
        <ul className="divide-y divide-[var(--community-border)]">
          {ISPU_CATEGORIES.map((cat) => (
            <li key={cat.label} className="flex items-center gap-3 py-2.5">
              <span className={`h-3 w-3 shrink-0 rounded-full ${cat.color}`} />
              <span className="w-16 shrink-0 text-xs font-bold text-[#123027] tabular-nums">{cat.range}</span>
              <span className="w-32 shrink-0 text-xs font-semibold text-[#123027]">{tr(cat.label, cat.labelEn)}</span>
              <span className="text-xs text-[var(--community-ink-muted)]">{tr(cat.meaning, cat.meaningEn)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 md:p-5 space-y-2">
        <h2 className="text-sm font-bold text-sky-950">
          {tr("Soal masker saat kabut asap", "Masks during haze")} <RefMarks refs={[8]} />
        </h2>
        <ul className="list-disc pl-5 space-y-1 text-xs md:text-[13px] text-sky-950/90 leading-relaxed">
          <li>
            {tr(
              "Respirator N95 dan P100 menyaring partikel asap karena menempel rapat di wajah dan memaksa udara melewati filter.",
              "N95 and P100 respirators filter smoke particles because they seal tightly to the face and force air through the filter."
            )}
          </li>
          <li>
            {tr(
              "Masker kain, masker bedah, bandana (basah maupun kering), dan tisu tidak dirancang menempel rapat dan tidak menyaring partikel asap halus.",
              "Cloth masks, surgical masks, bandanas (wet or dry) and tissues aren't designed to seal and don't filter fine smoke particles."
            )}
          </li>
          <li>{tr("Respirator hanya bekerja jika ukurannya pas dan dipakai dengan benar.", "A respirator only works if it fits and is worn correctly.")}</li>
        </ul>
        <Link href="/community/edukasi/asap" className="inline-flex items-center gap-1 pt-1 text-xs font-bold text-sky-800 hover:underline">
          {tr("Panduan melindungi keluarga dari asap", "Guide to protecting your family from smoke")}
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[#123027]">{tr("Daftar Pustaka", "References")}</h2>
        <ol className="space-y-3">
          {REFERENCES.map((ref) => {
            const text = referenceText(ref, language);
            return (
            <li key={ref.id} id={`ref-${ref.id}`} className="flex gap-3 scroll-mt-24 text-xs leading-relaxed">
              <span className="w-6 shrink-0 font-bold text-[var(--community-accent)]">[{ref.id}]</span>
              <div className="min-w-0">
                <p className="text-[#123027]">{text.citation}</p>
                <a href={ref.url} target="_blank" rel="noopener noreferrer" className="break-all text-[var(--community-accent)] hover:underline">
                  {ref.url}
                </a>
                {text.note && <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">{text.note}</p>}
              </div>
            </li>
            );
          })}
        </ol>
        <p className="text-[11px] text-[var(--community-ink-muted)]">{tr("Sumber diakses 20 Oktober 2026.", "Sources accessed 20 October 2026.")}</p>
      </section>
    </div>
  );
}
