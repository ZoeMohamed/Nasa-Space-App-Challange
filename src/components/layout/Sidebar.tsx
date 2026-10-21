"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { withFilters } from "@/lib/filters";
import { useTranslation } from "@/lib/i18n/LanguageContext";

/**
 * Nav structure, order, labels and icons are taken from the real Dashboard sidebar instance
 * in Figma (file wasTTtlmYfsjK1ZkH1Kzim, node 169:7480 — "Navigation / Sidebar/Navigation/Sidebar/State3"),
 * fetched via get_design_context, not the alternate 8-item "exploration" sidebars found elsewhere
 * in the same file. That instance renders exactly two groups:
 *   1. Dashboard, Explore Map
 *   2. "DATABASE" section: Analytics, Historical Insights, Areas of Attention, About data
 *
 * Figma routes are mapped onto the routes that already exist in this repo:
 *  - Dashboard        -> "/operator"      (moved off "/" so the root route can be a public
 *                                           landing page instead of the Operator dashboard;
 *                                           see src/app/page.tsx / src/app/operator/page.tsx)
 *  - Explore Map      -> "/map"
 *  - Analytics        -> "/analytics"
 *  - Historical Insights -> "/calendar"   (the Calendar page's own subtitle is literally
 *                                           "Historical Patterns & Forecast", the closest match)
 *  - Areas of Attention  -> "/priority-areas" (alias: Figma's "Areas of Attention" screen hasn't
 *                                           been migrated yet, so this points at the existing
 *                                           Priority Areas page, which covers the same concept)
 *  - About data        -> "/data-model"   (existing page documents the API/data response model)
 *
 * Figma's sidebar also has a logo slot that is a literal "LOGO" text placeholder (no real logo
 * asset was provided), so the brand mark below reuses this app's existing flame icon treatment
 * instead of fabricating an image asset that doesn't exist.
 *
 * "Citizen Reports" -> "/citizen-reports" was added separately (not part of the Figma sidebar
 * instance above): it's the officer-side validation dashboard for the "Citizen / Community
 * Report" screen (Figma node 169:16247), a demo-data-only page since that feature has no backend
 * yet. Placed in the primary group since it's an operational workflow screen like Dashboard /
 * Explore Map, not a reference/database screen.
 */
// The burning activity calendar is the core of the Space Apps brief, so it leads the menu.
const PRIMARY_LINKS = [
  { label: "Burning Activity Calendar", labelId: "Kalender Kebakaran", icon: "calendar_month", href: "/calendar" },
  { label: "Dashboard", labelId: "Dasbor", icon: "dashboard", href: "/operator" },
  { label: "Explore Map", labelId: "Jelajahi Peta", icon: "map", href: "/map" },
  { label: "Citizen Reports", labelId: "Laporan Warga", icon: "forum", href: "/citizen-reports" },
];

const DATABASE_LINKS = [
  { label: "Analytics", labelId: "Analitik", icon: "monitoring", href: "/analytics" },
  { label: "Areas of Attention", labelId: "Area Prioritas", icon: "crisis_alert", href: "/priority-areas" },
  { label: "About data", labelId: "Tentang Data", icon: "menu_book", href: "/data-model" },
];

function NavLink({ label, icon, href, active }: { label: string; icon: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-white/[0.26] text-[var(--color-sidebar-foreground)]"
          : "text-[var(--color-sidebar-foreground)]/80 hover:bg-white/10 hover:text-[var(--color-sidebar-foreground)]"
      }`}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      {label}
    </Link>
  );
}

function SidebarNav({ links }: { links: typeof PRIMARY_LINKS }) {
  const { tr } = useTranslation();
  const pathname = usePathname();
  // Region/range live in the URL; carry them to the next page so the TopBar choice sticks.
  const searchParams = useSearchParams();
  return (
    <>
      {links.map(({ label, labelId, icon, href }) => (
        <NavLink key={label} label={tr(labelId, label)} icon={icon} href={withFilters(href, searchParams)} active={pathname === href} />
      ))}
    </>
  );
}

function SidebarNavFallback({ links }: { links: typeof PRIMARY_LINKS }) {
  const { tr } = useTranslation();
  const pathname = usePathname();
  return (
    <>
      {links.map(({ label, labelId, icon, href }) => (
        <NavLink key={label} label={tr(labelId, label)} icon={icon} href={href} active={pathname === href} />
      ))}
    </>
  );
}

export default function Sidebar() {
  const { tr } = useTranslation();

  return (
    <aside className="w-[230px] bg-[var(--color-sidebar)] flex flex-col justify-between h-full shrink-0 overflow-y-auto custom-scroll">
      <div className="flex flex-col gap-5">
        {/* Logo */}
        <div className="flex items-center gap-2 h-[72px] px-7 border-b border-white/[0.12]">
          <span className="material-symbols-outlined text-[22px] text-[var(--color-sidebar-foreground)]">
            local_fire_department
          </span>
          <span className="font-medium text-xl text-[var(--color-sidebar-foreground)] tracking-tight">
            AGNIBHUMI
          </span>
        </div>

        <div className="flex flex-col gap-5">
          {/* Primary nav */}
          <nav className="flex flex-col gap-1 px-4">
            <Suspense fallback={<SidebarNavFallback links={PRIMARY_LINKS} />}>
              <SidebarNav links={PRIMARY_LINKS} />
            </Suspense>
          </nav>

          <div className="h-px bg-white/[0.12]" />

          {/* Database section */}
          <div className="flex flex-col gap-1 px-4">
            <div className="px-2 py-1 text-xs font-medium tracking-wide text-[var(--color-sidebar-foreground)]/60">
              {tr("BASIS DATA", "DATABASE")}
            </div>
            <nav className="flex flex-col gap-1">
              <Suspense fallback={<SidebarNavFallback links={DATABASE_LINKS} />}>
                <SidebarNav links={DATABASE_LINKS} />
              </Suspense>
            </nav>
          </div>
        </div>
      </div>

      {/* Footer — Figma's shipped sidebar shows a "Back to main page" link here (an exit back to
          a parent site outside this component's scope). Now that "/" is the public AGNIBHUMI
          landing page (not the Operator dashboard), this literally is that exit link. */}
      <div className="flex items-center justify-center border-t border-white/[0.12] px-4 py-5">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm font-medium text-[var(--color-sidebar-foreground)]/80 hover:text-[var(--color-sidebar-foreground)]"
        >
          <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          {tr("Kembali ke halaman utama", "Back to main page")}
        </Link>
      </div>
    </aside>
  );
}
