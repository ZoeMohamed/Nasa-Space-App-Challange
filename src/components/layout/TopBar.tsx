"use client";

/**
 * Visual structure taken from Figma's real Dashboard top bar (file wasTTtlmYfsjK1ZkH1Kzim,
 * node 169:7481), fetched via get_design_context: a dark-green bar (`bg-[#032b20]`, same fill as
 * the sidebar) holding a white rounded search pill on the left and a bell + profile cluster on
 * the right.
 *
 * The region selector and time-range selector below are NOT present in that exact top bar node —
 * Figma places them in a separate "Filters Ribbon" content block (node 169:7557, used on the
 * Explore Map / filtered dashboard views). Per the task brief they belong in the shared TopBar
 * here instead, so their pill styling (white bg, `border-[#e2e8f0]`, rounded-xl, bold 12px label
 * over a 10px slate-400 caption) is reused from that Filters Ribbon node to stay visually
 * consistent with the rest of the design system.
 *
 * FUNCTIONAL NOTES:
 * Region + Time Range are real dropdowns backed by the URL (`?region=`, `?range=`) — see
 * src/lib/filters.ts for what each option means. Sidebar links carry the query along, so the
 * selection persists across Operator pages.
 *
 * Search is still presentational/static — wiring it up is a separate follow-up task.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import LanguageToggle from "@/components/LanguageToggle";
import {
  DEFAULT_REGION,
  DEFAULT_RANGE,
  REGION_OPTIONS,
  TIME_RANGE_OPTIONS,
  getRegionOption,
  getRangeOption,
  labelOf,
} from "@/lib/filters";
import { useTranslation } from "@/lib/i18n/LanguageContext";

function useOutsideClick(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutside();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [ref, onOutside]);
}

interface DropdownOption {
  value: string;
  label: string;
}

function SelectorDropdown({
  icon,
  caption,
  activeLabel,
  options,
  activeValue,
  footnote,
  onSelect,
}: {
  icon: string;
  caption: string;
  activeLabel: string;
  options: DropdownOption[];
  activeValue: string;
  footnote?: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useOutsideClick(containerRef, () => setOpen(false));

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-left shrink-0 hover:bg-gray-50 transition-colors"
      >
        <span className="material-symbols-outlined text-[16px] text-[var(--color-text-muted)]">{icon}</span>
        <span className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-[var(--color-text-main)] leading-none">{activeLabel}</span>
          <span className="text-[10px] text-[var(--color-text-muted)] leading-none">{caption}</span>
        </span>
        <span className="material-symbols-outlined text-[16px] text-[var(--color-text-muted)]">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-[1300] w-64 max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white shadow-lg py-1.5"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === activeValue}
              onClick={() => {
                onSelect(option.value);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-xs font-medium flex items-center justify-between gap-2 hover:bg-gray-50 ${
                option.value === activeValue ? "text-emerald-700 bg-emerald-50/70" : "text-[var(--color-text-main)]"
              }`}
            >
              {option.label}
              {option.value === activeValue && (
                <span className="material-symbols-outlined text-[14px]">check</span>
              )}
            </button>
          ))}
          {footnote && (
            <p className="px-4 pt-1.5 pb-0.5 text-[10px] leading-snug text-[var(--color-text-muted)] border-t border-[var(--color-border)] mt-1">
              {footnote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MobileBrand({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { tr } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2 lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={tr("Buka navigasi", "Open navigation")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-sidebar-foreground)] hover:bg-white/10"
      >
        <span className="material-symbols-outlined">menu</span>
      </button>
      <span className="truncate text-sm font-semibold tracking-wide text-[var(--color-sidebar-foreground)]">AGNIBHUMI</span>
    </div>
  );
}

function TopBarFallback({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { tr } = useTranslation();
  return (
    <header className="h-[64px] lg:h-[78px] bg-[var(--color-sidebar)] px-3 sm:px-6 flex items-center justify-between gap-3 shrink-0">
      <MobileBrand onOpenMenu={onOpenMenu} />
      <div className="relative hidden w-[min(320px,36vw)] shrink-0 md:block">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base">
          search
        </span>
        <input
          type="text"
          placeholder={tr("Jelajahi area", "Explore an area")}
          disabled
          className="w-full bg-white rounded-[10px] pl-10 pr-4 py-3 text-sm text-[var(--color-text-main)] outline-none"
        />
      </div>
      <div className="hidden lg:flex items-center gap-3 flex-1" />
      <div className="flex items-center gap-4 shrink-0">
        <span className="hidden material-symbols-outlined text-[20px] text-[var(--color-sidebar-foreground)]/80 sm:inline">
          notifications
        </span>
        <div className="hidden items-center gap-3 border-l border-white/[0.12] pl-4 sm:flex">
          <div className="w-8 h-8 rounded-full bg-white/[0.26] text-[var(--color-sidebar-foreground)] flex items-center justify-center text-xs font-semibold shrink-0">
            PO
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-sm font-semibold text-[var(--color-sidebar-foreground)] leading-tight">Public Operator</span>
            <span className="text-xs text-[var(--color-sidebar-foreground)]/60 leading-tight">{tr("Akses Publik", "Public Access")}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function TopBarInner({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { tr, language } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeRegion = getRegionOption(searchParams.get("region"));
  const activeRange = getRangeOption(searchParams.get("range"));

  function updateParam(key: "region" | "range", value: string, defaultValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <header className="h-[64px] lg:h-[78px] bg-[var(--color-sidebar)] px-3 sm:px-6 flex items-center justify-between gap-3 lg:gap-4 shrink-0">
      <MobileBrand onOpenMenu={onOpenMenu} />
      {/* Search — not yet wired to filtering logic */}
      <div className="relative hidden w-[min(320px,36vw)] shrink-0 md:block">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base">
          search
        </span>
        <input
          type="text"
          placeholder={tr("Jelajahi area", "Explore an area")}
          className="w-full bg-white rounded-[10px] pl-10 pr-4 py-3 text-sm text-[var(--color-text-main)] outline-none focus:ring-2 focus:ring-emerald-400/50 transition-all"
        />
      </div>

      {/* Region + time-range selectors — real dropdowns, write to the URL */}
      <div className="hidden lg:flex items-center gap-3 flex-1 min-w-0">
        <SelectorDropdown
          icon="location_on"
          caption={tr("Wilayah", "Region")}
          activeLabel={labelOf(activeRegion, language)}
          activeValue={activeRegion.value}
          options={REGION_OPTIONS.map((option) => ({ value: option.value, label: labelOf(option, language) }))}
          footnote={tr(
            "7 provinsi teratas = rawan karhutla. Batas provinsi BPS 2020 (34 provinsi, sebelum pemekaran Papua 2022).",
            "Top 7 = fire-prone provinces. BPS 2020 province boundaries (34 provinces, before the 2022 Papua split)."
          )}
          onSelect={(value) => updateParam("region", value, DEFAULT_REGION)}
        />
        <SelectorDropdown
          icon="date_range"
          caption={tr("Rentang Waktu", "Time Range")}
          activeLabel={labelOf(activeRange, language)}
          activeValue={activeRange.value}
          options={TIME_RANGE_OPTIONS.map((option) => ({ value: option.value, label: labelOf(option, language) }))}
          footnote={tr(
            "24 jam, 7 hari & 30 hari = data live NASA FIRMS. 2023–2024 = arsip harian per grid 0,25° (tanpa skor prioritas).",
            "24 h, 7 days & 30 days = live NASA FIRMS data. 2023–2024 = daily archive per 0.25° grid (no priority scores)."
          )}
          onSelect={(value) => updateParam("range", value, DEFAULT_RANGE)}
        />
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-4 shrink-0">
        <LanguageToggle className="!text-[var(--color-sidebar-foreground)]/80 !border-white/20 hover:!bg-white/10" />
        <button type="button" aria-label={tr("Notifikasi", "Notifications")} className="hidden text-[var(--color-sidebar-foreground)]/80 hover:text-[var(--color-sidebar-foreground)] sm:block">
          <span className="material-symbols-outlined text-[20px]">notifications</span>
        </button>
        <div className="hidden items-center gap-3 border-l border-white/[0.12] pl-4 sm:flex">
          <div className="w-8 h-8 rounded-full bg-white/[0.26] text-[var(--color-sidebar-foreground)] flex items-center justify-center text-xs font-semibold shrink-0">
            PO
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-sm font-semibold text-[var(--color-sidebar-foreground)] leading-tight">Public Operator</span>
            <span className="text-xs text-[var(--color-sidebar-foreground)]/60 leading-tight">{tr("Akses Publik", "Public Access")}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  // Suspense boundary lives here (not in each route) so every page that mounts TopBar via
  // WorkstationLayout — including routes this task doesn't touch — stays buildable without
  // needing its own Suspense wrapper just because TopBar now reads useSearchParams().
  return (
    <Suspense fallback={<TopBarFallback onOpenMenu={onOpenMenu} />}>
      <TopBarInner onOpenMenu={onOpenMenu} />
    </Suspense>
  );
}
