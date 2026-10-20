"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import BottomNav from "./components/BottomNav";
import { CommunityLocationProvider } from "./lib/useLocation";
import { getOrCreateSubmitterToken } from "./lib/submitterToken";
import LanguageToggle from "@/components/LanguageToggle";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { ReportsListResponse } from "@/types";

/**
 * Community View layout — mobile-first with desktop adaptation.
 *
 * Requirements:
 * - On mobile (HP): uses bottom navigation bar (Beranda, Edukasi, Lapor, Notifikasi, Saya).
 * - On desktop: the bottom navigation moves to the top header navbar, providing a seamless
 *   desktop navigation experience without a bottom footer bar.
 */
const COMMUNITY_THEME: CSSProperties = {
  ["--community-bg" as string]: "#f7faf8",
  ["--community-card" as string]: "#ffffff",
  ["--community-ink" as string]: "#123027",
  ["--community-ink-muted" as string]: "#64756e",
  ["--community-border" as string]: "#dbe7e1",
  ["--community-accent" as string]: "#075640",
  ["--community-danger" as string]: "#ba1a1a",
};

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const token = getOrCreateSubmitterToken();
    if (!token) return;
    let cancelled = false;

    fetch(`/api/reports?submitterToken=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<ReportsListResponse>) : null))
      .then((body) => {
        if (cancelled || !body) return;
        const changed = body.reports.filter((r) => r.status !== "submitted").length;
        setUnreadCount(changed);
      })
      .catch(() => {
        /* best-effort badge */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const navLinks = [
    { href: "/community", label: t("community.nav.home"), icon: "home" },
    { href: "/community/edukasi", label: t("community.nav.education"), icon: "menu_book" },
    { href: "/community/notifikasi", label: t("community.nav.notifications"), icon: "notifications", badge: unreadCount },
    { href: "/community/saya", label: t("community.nav.me"), icon: "person" },
  ];

  return (
    <div
      style={COMMUNITY_THEME}
      className="min-h-screen flex flex-col bg-[var(--community-bg)] text-[var(--community-ink)] font-sans antialiased selection:bg-emerald-100"
    >
      {/* Top Header: Adaptive for both mobile and desktop */}
      <header className="sticky top-0 z-30 border-b border-[var(--community-border)] bg-white/95 backdrop-blur-md transition-all">
        <div className="max-w-md md:max-w-6xl w-full mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-4">
          
          {/* Logo & Subtitle */}
          <Link href="/community" className="flex items-center gap-2.5 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#075640] to-[#043427] text-white shadow-sm shadow-emerald-950/20 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[20px]">local_fire_department</span>
            </span>
            <div className="flex flex-col">
              <span className="font-extrabold text-[15px] tracking-wider text-[#123027] uppercase leading-tight">
                AGNIBHŪMI
              </span>
              <span className="text-[10px] text-[var(--community-ink-muted)] font-medium tracking-tight">
                {t("community.subtitle")}
              </span>
            </div>
          </Link>

          {/* Desktop-only Navigation Header (Footer becomes Header on Desktop) */}
          <nav className="hidden md:flex items-center gap-1.5 lg:gap-2">
            {navLinks.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                    active
                      ? "bg-emerald-50 text-[var(--community-accent)] ring-1 ring-emerald-600/10 shadow-xs"
                      : "text-[var(--community-ink-muted)] hover:text-[var(--community-ink)] hover:bg-black/5"
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[19px]"
                    style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                  {!!item.badge && item.badge > 0 && (
                    <span className="ml-1 min-w-[18px] h-[18px] rounded-full bg-rose-600 text-white text-[10px] font-bold leading-[18px] text-center px-1">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Desktop CTA Button: Lapor Kebakaran */}
            <Link
              href="/community/report"
              className="ml-2 flex items-center gap-2 rounded-xl bg-[#ba1a1a] hover:bg-[#a01616] text-white px-3.5 py-1.5 text-xs font-bold shadow-sm shadow-rose-950/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[18px]">photo_camera</span>
              <span>{t("community.reportFire")}</span>
            </Link>

            <LanguageToggle className="ml-1" />
          </nav>

          {/* Right Header Utility / Switch */}
          <div className="flex items-center gap-3">
            {/* Mobile-only language toggle */}
            <LanguageToggle className="md:hidden" />
            {/* Mobile notification bell shortcut */}
            <Link
              href="/community/notifikasi"
              className="md:hidden relative p-2 text-[var(--community-ink-muted)] hover:text-[var(--community-ink)] rounded-full hover:bg-black/5 transition"
              aria-label="Notifikasi"
            >
              <span className="material-symbols-outlined text-[22px]">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-600 ring-2 ring-white animate-pulse" />
              )}
            </Link>

            {/* Operator portal switch */}
            <Link
              href="/"
              className="text-xs font-semibold text-[var(--community-ink-muted)] hover:text-[var(--community-accent)] transition flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-black/5"
              title={t("community.backToOperator")}
            >
              <span className="hidden sm:inline">{t("nav.operatorPortal")}</span>
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            </Link>
          </div>

        </div>
      </header>

      {/* Main content: Responsive max width for desktop / mobile */}
      <main className="flex-1 w-full max-w-md md:max-w-5xl lg:max-w-6xl mx-auto px-4 md:px-8 pt-4 md:pt-6 pb-24 md:pb-14">
        <CommunityLocationProvider>{children}</CommunityLocationProvider>
      </main>

      {/* Mobile-only Bottom Navigation Bar */}
      <BottomNav />
    </div>
  );
}
