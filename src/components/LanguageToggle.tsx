"use client";

import { useTranslation } from "@/lib/i18n/LanguageContext";

export default function LanguageToggle({ className = "" }: { className?: string }) {
  const { language, toggleLanguage, t } = useTranslation();

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-label={t("lang.toggleLabel")}
      title={t("lang.toggleLabel")}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-current/15 px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-black/5 ${className}`}
    >
      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
        translate
      </span>
      <span className={language === "id" ? "opacity-100" : "opacity-40"}>ID</span>
      <span aria-hidden="true">/</span>
      <span className={language === "en" ? "opacity-100" : "opacity-40"}>EN</span>
    </button>
  );
}
