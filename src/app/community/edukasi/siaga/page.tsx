"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadCheckedItems, saveCheckedItems } from "../../lib/checklistProgress";
import { CHECKLIST_CATEGORIES, TOTAL_CHECKLIST_ITEMS } from "./checklistData";
import {
  BagIllustration,
  DocumentsIllustration,
  FamilyPlanIllustration,
} from "@/components/community/illustrations";

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  dokumen: DocumentsIllustration,
  tas: BagIllustration,
  rencana: FamilyPlanIllustration,
};

export default function SiagaChecklistPage() {
  // Initialize as "loading" (null) rather than reading localStorage synchronously
  // during render — avoids a setState-in-effect-body mismatch between server
  // and client render passes (same pattern as src/app/priority-areas/page.tsx).
  const [checked, setChecked] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => setChecked(loadCheckedItems()));
  }, []);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = { ...(prev ?? {}), [id]: !(prev?.[id] ?? false) };
      saveCheckedItems(next);
      return next;
    });
  };

  const doneCount = checked ? Object.values(checked).filter(Boolean).length : 0;

  return (
    <div className="space-y-6">
      <Link href="/community/edukasi" className="text-xs font-semibold text-[var(--community-ink-muted)]">
        ← Kembali ke Edukasi
      </Link>

      <section>
        <h1 className="text-lg font-extrabold text-[#123027]">Siapkan Tas Siaga</h1>
        <p className="text-sm text-[var(--community-ink-muted)] mt-1 leading-relaxed">
          Checklist ini membantu keluarga Anda siap sebelum kabut asap atau kebakaran terjadi. Tandai
          item yang sudah disiapkan — progres Anda disimpan otomatis di perangkat ini.
        </p>
      </section>

      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-[#123027]">
            {checked === null ? "Memuat progres…" : `${doneCount} dari ${TOTAL_CHECKLIST_ITEMS} selesai`}
          </p>
          <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5">
            Tersimpan secara lokal di perangkat ini saja — tidak dikirim ke server.
          </p>
        </div>
        <div className="h-2.5 w-24 rounded-full bg-gray-100 overflow-hidden shrink-0">
          <div
            className="h-full rounded-full bg-[var(--community-accent)] transition-all"
            style={{
              width: `${checked === null ? 0 : Math.round((doneCount / TOTAL_CHECKLIST_ITEMS) * 100)}%`,
            }}
          />
        </div>
      </div>

      {CHECKLIST_CATEGORIES.map((category) => {
        const Icon = CATEGORY_ICON[category.id];
        return (
          <section key={category.id} className="space-y-3">
            <div className="flex items-center gap-3">
              {Icon && (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                  <Icon className="h-6 w-6" />
                </span>
              )}
              <h2 className="text-sm font-bold text-[#123027]">{category.title}</h2>
            </div>

            <ul className="space-y-2">
              {category.items.map((item) => {
                const isChecked = checked?.[item.id] ?? false;
                return (
                  <li
                    key={item.id}
                    className={`rounded-xl border p-3.5 transition ${
                      isChecked
                        ? "border-emerald-300 bg-emerald-50/60"
                        : "border-[var(--community-border)] bg-white"
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(item.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--community-accent)]"
                      />
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${isChecked ? "line-through text-[var(--community-ink-muted)]" : "text-[#123027]"}`}>
                          {item.what}
                        </p>
                        <p className="text-[11px] text-[var(--community-ink-muted)] mt-1 leading-relaxed">
                          <span className="font-semibold">Kenapa: </span>
                          {item.why}
                        </p>
                        <p className="text-[11px] text-[var(--community-ink-muted)] mt-1 leading-relaxed">
                          <span className="font-semibold">Caranya: </span>
                          {item.how}
                        </p>
                        {item.caveat && (
                          <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                            <span className="font-semibold">Catatan: </span>
                            {item.caveat}
                          </p>
                        )}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
