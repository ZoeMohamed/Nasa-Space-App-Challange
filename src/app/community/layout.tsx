"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { Bell, Flame, Languages } from "lucide-react";
import BottomNav from "./components/BottomNav";
import { CommunityLocationProvider } from "./lib/useLocation";
import { useUnreadReportCount } from "./lib/useUnreadReportCount";
import { useTranslation } from "@/lib/i18n/LanguageContext";

/**
 * Community View chrome, following the "Peta" design: a floating glass header over the map
 * (Peta · Edukasi · Laporan Saya · Profile, notifications, language, Lapor Kebakaran) and, on
 * phones, a bottom navigation bar. Every other community page shares the same header and the
 * same tokens below, on a light canvas under a dark-teal band that echoes the satellite map.
 */
const COMMUNITY_THEME: CSSProperties = {
  ["--community-bg" as string]: "#eef3f2",
  ["--community-card" as string]: "#ffffff",
  ["--community-ink" as string]: "#0f172a",
  ["--community-ink-muted" as string]: "#475569",
  ["--community-border" as string]: "#e2e8f0",
  ["--community-accent" as string]: "#065f46",
  ["--community-danger" as string]: "#b91c1c",
  ["--community-teal" as string]: "#0d2f3a",
};

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tr, toggleLanguage, language } = useTranslation();
  const unreadCount = useUnreadReportCount();
  const isMap = pathname === "/community";

  const navLinks = [
    { href: "/community", label: tr("Peta", "Map"), match: (p: string) => p === "/community" || p.startsWith("/community/alert") },
    { href: "/community/edukasi", label: tr("Edukasi", "Learn"), match: (p: string) => p.startsWith("/community/edukasi") || p === "/community/udara" },
    { href: "/community/saya", label: tr("Laporan Saya", "My Reports"), match: (p: string) => p === "/community/saya" || p.startsWith("/community/reports") },
    { href: "/community/pengaturan", label: tr("Profil", "Profile"), match: (p: string) => p === "/community/pengaturan" },
  ];

  return (
    <CommunityLocationProvider>
    <div
      style={COMMUNITY_THEME}
      className={`relative min-h-screen bg-[var(--community-bg)] text-[var(--community-ink)] font-sans antialiased selection:bg-emerald-100 ${
        isMap ? "" : "bg-[linear-gradient(180deg,#0d2f3a_0,#0f3d47_13rem,var(--community-bg)_13rem)]"
      }`}
    >
      <header className="absolute inset-x-0 top-0 z-[1000] px-3 pt-3 md:px-8 md:pt-8 pointer-events-none">
        <div className="pointer-events-auto mx-auto flex max-w-[1210px] items-center justify-between gap-3 rounded-2xl border border-white/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.32),rgba(13,47,58,0.55))] px-3 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl md:px-7 md:py-3">
          <Link href="/community" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 md:h-[60px] md:w-[48px] shrink-0 items-center justify-center rounded-md bg-white shadow-sm">
              <Flame className="h-6 w-6 md:h-8 md:w-8 text-[#ea580c]" fill="#fdba74" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className={`block text-lg md:text-[26px] font-medium leading-tight tracking-wide ${isMap ? "text-[#0b3b33]" : "text-white"}`}>AGNIBHŪMI</span>
              <span className="hidden sm:block truncate text-[11px] md:text-xs text-white/60">
                {tr("Intelijen Satelit untuk Hutan yang Lebih Aman", "Satellite Intelligence for Safer Forests")}
              </span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 lg:gap-10" aria-label={tr("Navigasi utama", "Main navigation")}>
            {navLinks.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative py-1 text-[15px] transition ${
                    active ? "font-semibold text-white" : "text-white/70 hover:text-white"
                  }`}
                >
                  {item.label}
                  {active && <span className="absolute inset-x-0 -bottom-1 mx-auto h-0.5 w-6 rounded-full bg-white" />}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            <Link
              href="/community/notifikasi"
              className="relative rounded-full p-2 text-white hover:bg-white/10"
              aria-label={tr("Notifikasi", "Notifications")}
            >
              <Bell className="h-6 w-6 md:h-7 md:w-7" strokeWidth={1.75} />
              {unreadCount > 0 && (
                <span className="absolute right-0.5 top-0.5 min-w-[18px] h-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-white/70">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm hover:bg-slate-50"
              aria-label={language === "id" ? "Switch to English" : "Ganti ke Bahasa Indonesia"}
              title={language === "id" ? "English" : "Bahasa Indonesia"}
            >
              <Languages className="h-4 w-4" />
            </button>
            <Link
              href="/community/report"
              className="hidden md:inline-flex items-center rounded-full bg-[#c81e1e] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-red-950/30 transition hover:bg-[#b01a1a] active:scale-[0.98]"
            >
              {tr("Lapor Kebakaran", "Report a Fire")}
            </Link>
          </div>
        </div>
      </header>

      {isMap ? (
        <main className="relative">
          {children}
        </main>
      ) : (
        <main className="relative mx-auto w-full max-w-md md:max-w-5xl px-4 md:px-8 pt-24 md:pt-40 pb-28 md:pb-16">
          <div className="rounded-3xl bg-[var(--community-card)] p-4 md:p-8 shadow-[0_10px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
            {children}
          </div>
        </main>
      )}

      <BottomNav unread={unreadCount} />
    </div>
    </CommunityLocationProvider>
  );
}
