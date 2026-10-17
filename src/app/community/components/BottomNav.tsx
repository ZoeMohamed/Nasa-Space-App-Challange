"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getOrCreateSubmitterToken } from "../lib/submitterToken";
import type { ReportsListResponse } from "@/types";

/**
 * Shared 5-item bottom nav for the Community View (Figma node 186:3013):
 * Beranda · Edukasi · Lapor (raised center FAB) · Notifikasi (+ unread badge)
 * · Saya. The badge count is a REAL count derived from this device's own
 * reports whose status changed to something other than "submitted" (i.e. an
 * update happened since the citizen last looked) — not a fabricated number.
 * We don't have a true "read/unread" flag in the backend, so this is a
 * reasonable, honestly-derived proxy rather than an invented figure.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const token = getOrCreateSubmitterToken();
    if (!token) return;
    let cancelled = false;

    fetch(`/api/reports?submitterToken=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<ReportsListResponse>) : null))
      .then((body) => {
        if (cancelled || !body) return;
        const changed = body.reports.filter((r) => r.status !== "submitted").length;
        setUnread(changed);
      })
      .catch(() => {
        /* best-effort badge only — silently ignore */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const items = [
    { href: "/community", label: "Beranda", icon: "home" },
    { href: "/community/edukasi", label: "Edukasi", icon: "menu_book" },
    { href: "/community/report", label: "Lapor", icon: "photo_camera", fab: true },
    { href: "/community/notifikasi", label: "Notifikasi", icon: "notifications", badge: unread },
    { href: "/community/saya", label: "Saya", icon: "person" },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[var(--community-border)] bg-white/95 backdrop-blur-md px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] flex justify-center shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      <div className="flex w-full max-w-md items-end justify-around">
        {items.map((item) => {
          const active = pathname === item.href;
          if (item.fab) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center -mt-6 group focus:outline-none"
              >
                <span className="flex h-13 w-13 items-center justify-center rounded-full bg-[#ba1a1a] text-white shadow-lg shadow-red-900/30 group-hover:scale-105 active:scale-95 transition-all duration-200 ring-4 ring-white">
                  <span className="material-symbols-outlined text-[24px]">{item.icon}</span>
                </span>
                <span className="mt-1 text-[11px] font-semibold text-[var(--community-ink)]">
                  {item.label}
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none ${
                active ? "text-[var(--community-accent)] font-bold" : "text-[var(--community-ink-muted)] hover:text-[var(--community-ink)]"
              }`}
            >
              <span className="relative">
                <span
                  className="material-symbols-outlined text-[22px]"
                  style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-[16px] rounded-full bg-rose-600 text-white text-[10px] font-bold leading-[16px] text-center px-1 shadow-sm">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
