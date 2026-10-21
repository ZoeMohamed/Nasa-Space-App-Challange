"use client";

import Link from "next/link";
import { useState } from "react";
import { labelOf, REGION_OPTIONS } from "@/lib/filters";
import { loadAlertPrefs, saveAlertPrefs, type AlertPrefs } from "../lib/alertPrefs";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const SEVERITY_OPTIONS: { value: AlertPrefs["minSeverity"]; label: readonly [string, string] }[] = [
  { value: "LOW", label: ["Semua tingkat (rendah, sedang, tinggi)", "All levels (low, medium, high)"] },
  { value: "MEDIUM", label: ["Sedang ke atas", "Medium and above"] },
  { value: "HIGH", label: ["Hanya tingkat tinggi", "High only"] },
];

/**
 * "07 Community — Atur Area Peringatan" (Figma node 185:3013). A real,
 * functioning local preference screen (see lib/alertPrefs.ts for why it's
 * local-only, not a server subscription) — region options reused from the
 * same REGION_OPTIONS already used by the Operator view's filters.
 */
export default function PengaturanPage() {
  const { tr, language } = useTranslation();
  // Lazy initializer (runs once on mount, client-only) rather than an effect
  // that calls setState — loadAlertPrefs() already guards for SSR internally.
  const [prefs, setPrefs] = useState<AlertPrefs>(() => loadAlertPrefs());
  const [saved, setSaved] = useState(false);

  function update(next: Partial<AlertPrefs>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveAlertPrefs(merged);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-5">
      <Link href="/community/saya" className="text-xs font-semibold text-[var(--community-ink-muted)]">
        ← {tr("Kembali ke Saya", "Back to Me")}
      </Link>

      <section>
        <h1 className="text-lg font-extrabold">{tr("Atur Area Peringatan", "Alert Area Settings")}</h1>
        <p className="text-sm text-[var(--community-ink-muted)] mt-0.5">
          {tr(
            "Preferensi ini tersimpan di perangkat ini saja dan digunakan untuk menyaring halaman Notifikasi — bukan langganan push notification berbasis server.",
            "These preferences are stored on this device only and filter the Notifications page — not a server-based push notification subscription."
          )}
        </p>
      </section>

      <div className="space-y-2">
        <label htmlFor="alert-region" className="text-sm font-bold">
          {tr("Wilayah pemantauan", "Area to watch")}
        </label>
        <select
          id="alert-region"
          value={prefs.region}
          onChange={(event) => update({ region: event.target.value })}
          className="w-full rounded-xl border border-[var(--community-border)] bg-white px-3 py-2.5 text-sm font-medium"
        >
          <option value="indonesia">{tr("Seluruh Indonesia", "All of Indonesia")}</option>
          <optgroup label={tr("Provinsi rawan karhutla", "Fire-prone provinces")}>
            {REGION_OPTIONS.filter((opt) => opt.fireProne).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {labelOf(opt, language)}
              </option>
            ))}
          </optgroup>
          <optgroup label={tr("Provinsi lainnya", "Other provinces")}>
            {REGION_OPTIONS.filter((opt) => opt.provinsi && !opt.fireProne).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {labelOf(opt, language)}
              </option>
            ))}
          </optgroup>
        </select>
        <p className="text-[11px] text-[var(--community-ink-muted)]">
          {tr(
            "Batas provinsi BPS 2020 (34 provinsi, sebelum pemekaran Papua 2022).",
            "BPS 2020 province boundaries (34 provinces, before the 2022 Papua split)."
          )}
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">{tr("Tingkat minimum", "Minimum level")}</h2>
        <div className="space-y-1.5">
          {SEVERITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ minSeverity: opt.value })}
              className={`w-full text-left rounded-xl border px-3 py-2.5 text-sm font-medium flex items-center justify-between ${
                prefs.minSeverity === opt.value
                  ? "border-[var(--community-accent)] bg-[var(--community-accent)]/10 text-[var(--community-accent)]"
                  : "border-[var(--community-border)] bg-white"
              }`}
            >
              {tr(...opt.label)}
              {prefs.minSeverity === opt.value && <span className="material-symbols-outlined text-[18px]">check</span>}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between rounded-xl border border-[var(--community-border)] bg-white px-3 py-3">
        <span className="text-sm font-medium pr-3">{tr("Beri tahu saat status laporan saya berubah", "Notify me when my report's status changes")}</span>
        <input
          type="checkbox"
          checked={prefs.notifyReportUpdates}
          onChange={(e) => update({ notifyReportUpdates: e.target.checked })}
          className="h-5 w-5 accent-[var(--community-accent)]"
        />
      </label>

      {saved && <p className="text-xs text-emerald-700 font-semibold">{tr("Preferensi disimpan.", "Preferences saved.")}</p>}
    </div>
  );
}
