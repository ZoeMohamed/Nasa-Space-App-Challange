"use client";

import Link from "next/link";

const SIDEBAR_LINKS = [
  { label: "01 OVERVIEW", icon: "dashboard", tab: "OVERVIEW", href: "/" },
  { label: "02 FIRE ACTIVITIES", icon: "local_fire_department", tab: "ACTIVITIES", href: "/activities" },
  { label: "03 MAP EXPLORER", icon: "map", tab: "MAP", href: "/map" },
  { label: "04 ANALYTICS", icon: "monitoring", tab: "ANALYTICS", href: "/analytics" },
  { label: "05 DATA / MODEL", icon: "database", tab: "DATA / MODEL", href: "/data-model" },
];

interface SidebarProps {
  activeTab: string;
  onHazard: () => void;
}

export default function Sidebar({ activeTab, onHazard }: SidebarProps) {
  return (
    <aside className="hidden lg:flex flex-col justify-between h-full w-64 border-r border-outline-variant bg-surface-container-low py-4 px-2 shrink-0 select-none">
      {/* Top Section */}
      <div>
        {/* HQ Info */}
        <div className="px-3 mb-4 border-b border-outline-variant pb-3">
          <div className="font-semibold text-sm text-on-surface">FIRESIGHT HQ</div>
          <div className="font-mono text-[10px] text-on-surface-variant tracking-wider uppercase mt-0.5">
            SECTOR: SUMATRA-KALIMANTAN
          </div>
          <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-on-surface">
            <span className="w-2 h-2 rounded-full bg-[#6AA84F] animate-pulse" />
            <span>Sat-VIIRS Constellation Link</span>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex flex-col gap-1">
          {SIDEBAR_LINKS.map(({ label, icon, tab, href }) => (
            <Link
              key={tab}
              href={href}
              className={`px-3 py-2 flex items-center gap-2 text-xs font-medium rounded transition-colors ${
                activeTab === tab
                  ? "bg-surface-container-highest text-secondary-container border-l-2 border-secondary-container font-semibold"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-base">{icon}</span>
              {label}
            </Link>
          ))}

          {/* Hazard Trigger Button */}
          <div className="mt-4 px-2">
            <button
              onClick={onHazard}
              className="w-full bg-tertiary text-on-tertiary text-xs font-bold py-2 rounded border border-on-tertiary-container shadow-sm flex items-center justify-center gap-1.5 hover:brightness-105 active:scale-[0.99] transition-all"
            >
              <span className="material-symbols-outlined text-sm">crisis_alert</span>
              HAZARD TRIGGER
            </button>
          </div>
        </div>
      </div>

      {/* Footer Section */}
      <div className="border-t border-outline-variant pt-3 flex flex-col gap-1 text-xs">
        <Link
          href="/data-model"
          className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high px-3 py-1 flex items-center gap-2 rounded text-left"
        >
          <span className="material-symbols-outlined text-sm">settings</span>
          SETTINGS
        </Link>
        <Link
          href="/data-model"
          className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high px-3 py-1 flex items-center gap-2 rounded text-left"
        >
          <span className="material-symbols-outlined text-sm">menu_book</span>
          HELP &amp; MANUALS
        </Link>

        {/* System Status */}
        <div className="mt-2 p-2 bg-surface-container rounded border border-outline-variant font-mono text-[10px] text-on-surface-variant space-y-1">
          <div className="flex items-center justify-between">
            <span>API:</span>
            <span className="text-[#6AA84F] font-bold">CONNECTED</span>
          </div>
          <div className="flex items-center justify-between">
            <span>MODEL:</span>
            <span className="text-on-surface font-semibold">v1.0 (HARMONIZED)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>LAST SYNC:</span>
            <span className="text-on-surface">02 MIN AGO</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
