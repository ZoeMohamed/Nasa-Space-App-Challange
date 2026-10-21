"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadQuizProgress, saveQuizProgress } from "../../lib/checklistProgress";
import { SCENARIOS, scenarioText } from "./scenarios";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export default function SimulasiPage() {
  const { tr, language } = useTranslation();
  const [progress, setProgress] = useState<Record<string, boolean> | null>(null);
  const [activeId, setActiveId] = useState<string>(SCENARIOS[0].id);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => setProgress(loadQuizProgress()));
  }, []);

  const activeScenario = scenarioText(SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0], language);
  const completedCount = progress ? Object.values(progress).filter(Boolean).length : 0;

  const chooseOption = (optionId: string) => {
    setSelectedOption(optionId);
    const option = activeScenario.options.find((o) => o.id === optionId);
    if (option?.isSafe) {
      setProgress((prev) => {
        const next = { ...(prev ?? {}), [activeScenario.id]: true };
        saveQuizProgress(next);
        return next;
      });
    }
  };

  const goToScenario = (id: string) => {
    setActiveId(id);
    setSelectedOption(null);
  };

  const selected = selectedOption
    ? activeScenario.options.find((o) => o.id === selectedOption) ?? null
    : null;

  return (
    <div className="space-y-6">
      <Link href="/community/edukasi" className="text-xs font-semibold text-[var(--community-ink-muted)]">
        ← {tr("Kembali ke Edukasi", "Back to Learn")}
      </Link>

      <section>
        <h1 className="text-lg font-extrabold text-[#123027]">{tr("Simulasi Keadaan Darurat", "Emergency Drill")}</h1>
        <p className="text-sm text-[var(--community-ink-muted)] mt-1 leading-relaxed">
          {tr(
            "Pilih tindakan untuk setiap skenario, lalu lihat penjelasannya. Anda bisa mencoba ulang kapan saja. Tujuannya belajar, bukan menguji.",
            "Pick an action for each scenario, then read the explanation. You can try again any time. The goal is to learn, not to test."
          )}
        </p>
      </section>

      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 flex items-center justify-between">
        <p className="text-sm font-bold text-[#123027]">
          {progress === null
            ? tr("Memuat progres…", "Loading progress…")
            : tr(`${completedCount}/${SCENARIOS.length} skenario selesai`, `${completedCount}/${SCENARIOS.length} scenarios done`)}
        </p>
        <div className="h-2.5 w-24 rounded-full bg-gray-100 overflow-hidden shrink-0">
          <div
            className="h-full rounded-full bg-[var(--community-accent)] transition-all"
            style={{ width: `${progress === null ? 0 : Math.round((completedCount / SCENARIOS.length) * 100)}%` }}
          />
        </div>
      </div>

      {/* Scenario tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {SCENARIOS.map((s, i) => {
          const done = progress?.[s.id];
          const isActive = s.id === activeId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => goToScenario(s.id)}
              className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold border transition ${
                isActive
                  ? "bg-[var(--community-accent)] text-white border-[var(--community-accent)]"
                  : "bg-white text-[var(--community-ink-muted)] border-[var(--community-border)]"
              }`}
            >
              {done && <span className="text-emerald-400">✓</span>}
              {i + 1}. {scenarioText(s, language).title}
            </button>
          );
        })}
      </div>

      {/* Active scenario */}
      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-[#123027]">{activeScenario.title}</h2>
          <p className="text-xs text-[var(--community-ink-muted)] mt-1 leading-relaxed">{activeScenario.prompt}</p>
        </div>

        <div className="space-y-2">
          {activeScenario.options.map((option) => {
            const isChosen = selectedOption === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseOption(option.id)}
                className={`block w-full text-left rounded-xl border p-3 text-xs transition ${
                  isChosen
                    ? option.isSafe
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-rose-300 bg-rose-50"
                    : "border-[var(--community-border)] bg-white hover:border-emerald-300"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {selected && (
          <div
            className={`rounded-xl p-3 border ${
              selected.isSafe ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"
            }`}
          >
            <p className={`text-xs font-bold ${selected.isSafe ? "text-emerald-900" : "text-rose-900"}`}>
              {selected.isSafe ? tr("Tindakan ini relatif lebih aman", "This is the safer choice") : tr("Tindakan ini lebih berisiko", "This choice is riskier")}
            </p>
            <p className="text-[11px] text-[var(--community-ink-muted)] mt-1 leading-relaxed">{selected.feedback}</p>
            <button
              type="button"
              onClick={() => setSelectedOption(null)}
              className="mt-2 text-[11px] font-semibold text-[var(--community-accent)] underline"
            >
              {tr("Coba pilihan lain", "Try another option")}
            </button>
          </div>
        )}

        {/* Safety guidance is always visible, regardless of the chosen option */}
        <div className="rounded-xl border border-[var(--community-border)] bg-gray-50 p-3">
          <p className="text-[11px] font-bold text-[#123027]">{tr("Tindakan yang disarankan", "Recommended action")}</p>
          <p className="text-[11px] text-[var(--community-ink-muted)] mt-1 leading-relaxed">{activeScenario.safeAction}</p>
        </div>
      </div>
    </div>
  );
}
