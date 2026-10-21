"use client";

import { useTranslation } from "@/lib/i18n/LanguageContext";

export default function MapLoadingText() {
  const { tr } = useTranslation();
  return <>{tr("Memuat peta…", "Loading map…")}</>;
}
