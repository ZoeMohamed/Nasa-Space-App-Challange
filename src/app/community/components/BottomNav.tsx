"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardList, Flame, Map as MapIcon, UserRound } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";

/**
 * Phone navigation for the Community View: Peta · Edukasi · Lapor (raised) · Laporan Saya · Profil.
 * The badge on "Laporan Saya" is the real count of this device's reports whose status changed
 * from "submitted" (computed once in the layout), not an invented number.
 */
export default function BottomNav({ unread }: { unread: number }) {
  const { tr } = useTranslation();
  const pathname = usePathname();

  const items = [
    { href: "/community", label: tr("Peta", "Map"), Icon: MapIcon, active: pathname === "/community" || pathname.startsWith("/community/alert") },
    { href: "/community/edukasi", label: tr("Edukasi", "Learn"), Icon: BookOpen, active: pathname.startsWith("/community/edukasi") },
    { href: "/community/report", label: tr("Lapor", "Report"), Icon: Flame, fab: true, active: pathname === "/community/report" },
    {
      href: "/community/saya",
      label: tr("Laporan", "Reports"),
      Icon: ClipboardList,
      badge: unread,
      active: pathname === "/community/saya" || pathname.startsWith("/community/reports"),
    },
    { href: "/community/pengaturan", label: tr("Profil", "Profile"), Icon: UserRound, active: pathname === "/community/pengaturan" },
  ];

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-[1000] border-t border-white/10 bg-[#0d2f3a]/95 px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-md items-end justify-around">
        {items.map(({ href, label, Icon, fab, badge, active }) =>
          fab ? (
            <Link key={href} href={href} className="-mt-6 flex flex-col items-center">
              <span className="flex h-13 w-13 items-center justify-center rounded-full bg-[#c81e1e] text-white shadow-lg shadow-red-950/40 ring-4 ring-[#0d2f3a] transition active:scale-95">
                <Icon className="h-6 w-6" />
              </span>
              <span className="mt-1 text-[11px] font-semibold text-white">{label}</span>
            </Link>
          ) : (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center gap-1 px-2 py-1 text-[11px] font-semibold transition ${
                active ? "text-white" : "text-white/60 hover:text-white"
              }`}
            >
              <span className="relative">
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                {!!badge && badge > 0 && (
                  <span className="absolute -right-2 -top-1 min-w-[16px] h-[16px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[16px] text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              {label}
            </Link>
          )
        )}
      </div>
    </nav>
  );
}
