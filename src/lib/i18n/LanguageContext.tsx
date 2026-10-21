"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translations, type Language, type TranslationKey } from "./translations";

const STORAGE_KEY = "agnibhumi-language";
const DEFAULT_LANGUAGE: Language = "id";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey) => string;
  /** Inline bilingual text: tr("Teks Indonesia", "English text"). */
  tr: (id: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === "id" || stored === "en") setLanguageState(stored);
      } catch {
        /* localStorage unavailable (private mode, etc.) — keep default */
      }
    });
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* best-effort persistence only */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "id" ? "en" : "id");
  }, [language, setLanguage]);

  const t = useCallback(
    (key: TranslationKey) => translations[language][key] ?? translations.id[key] ?? key,
    [language]
  );

  const tr = useCallback((id: string, en: string) => (language === "en" ? en : id), [language]);

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, t, tr }),
    [language, setLanguage, toggleLanguage, t, tr]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation must be used within LanguageProvider");
  return ctx;
}

/** For module-level helpers that receive the language explicitly. */
export function pick(language: Language, id: string, en: string): string {
  return language === "en" ? en : id;
}

export type { Language };
