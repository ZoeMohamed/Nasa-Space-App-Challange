"use client";

import Link from "next/link";

const NAV_LINKS = [
  { label: "OVERVIEW", href: "/" },
  { label: "ACTIVITIES", href: "/activities" },
  { label: "MAP", href: "/map" },
  { label: "ANALYTICS", href: "/analytics" },
  { label: "DATA / MODEL", href: "/data-model" },
];

interface NavBarProps {
  activeTab: string;
  syncing: boolean;
  onSync: () => void;
  onEscalation: () => void;
}

export default function NavBar({
  activeTab,
  syncing,
  onSync,
  onEscalation,
}: NavBarProps) {
  return (
    <nav className="flex justify-between items-center w-full px-5 h-12 border-b border-outline-variant bg-surface-container-lowest shadow-sm">
      {/* Logo + Nav Tabs */}
      <div className="flex items-center h-full gap-6">
        <Link
          href="/"
          className="text-base uppercase tracking-wider font-semibold text-on-surface flex items-center gap-1.5 hover:opacity-90"
        >
          <span className="material-symbols-outlined text-primary text-lg">
            local_fire_department
          </span>
          FIRESIGHT / OVERVIEW
        </Link>

        <div className="hidden md:flex items-center h-full gap-3 font-mono text-xs">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={`h-full flex items-center px-2 border-b-2 tracking-wider font-semibold transition-colors ${
                activeTab === label
                  ? "border-secondary-container text-secondary-container"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-1 border-r border-outline-variant pr-3 mr-1 text-on-surface-variant">
          <button
            onClick={onSync}
            className="p-1 hover:bg-surface-container-high rounded"
            title="Sync"
          >
            <span
              className={`material-symbols-outlined text-[16px] ${
                syncing ? "animate-spin text-secondary-container" : ""
              }`}
            >
              sync
            </span>
          </button>
          <button
            className="p-1 hover:bg-surface-container-high rounded relative"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-[16px]">
              notifications
            </span>
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-tertiary" />
          </button>
          <button
            className="p-1 hover:bg-surface-container-high rounded"
            title="Terminal"
          >
            <span className="material-symbols-outlined text-[16px]">
              terminal
            </span>
          </button>
        </div>

        <button
          onClick={onSync}
          className="h-8 px-3 bg-surface-container border border-outline-variant rounded text-xs font-semibold text-on-surface hover:bg-surface-container-high active:translate-y-px transition-all flex items-center gap-1.5"
        >
          <span
            className={`material-symbols-outlined text-xs ${syncing ? "animate-spin" : ""}`}
          >
            sync
          </span>
          <span className="hidden sm:inline">SYNC SATELLITE</span>
        </button>

        <button
          onClick={onEscalation}
          className="h-8 px-3 bg-primary-container text-on-primary-container border border-[#C78500] text-xs font-semibold rounded shadow-sm hover:brightness-95 active:translate-y-px transition-all flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-xs">warning</span>
          <span>EMERGENCY ESCALATION</span>
        </button>
      </div>
    </nav>
  );
}
