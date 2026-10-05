"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SIDEBAR_LINKS = [
  { label: "Overview", icon: "home", href: "/" },
  { label: "Map", icon: "map", href: "/map" },
  { label: "Calendar", icon: "calendar_today", href: "/calendar" },
  { label: "Sensor Data", icon: "sensors", href: "/sensor-data" },
  { label: "Priority Areas", icon: "crisis_alert", href: "/priority-areas" },
  { label: "Insights", icon: "lightbulb", href: "/insights" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col justify-between py-6 px-4 h-full shrink-0">
      <div>
        {/* Logo */}
        <div className="flex items-center gap-2 mb-1 px-2">
          <div className="text-[#f04438]">
            <span className="material-symbols-outlined text-2xl">local_fire_department</span>
          </div>
          <span className="font-bold text-xl text-gray-900 tracking-tight">FireWatch</span>
        </div>
        <div className="text-[10px] text-gray-500 font-medium px-2 mb-8">
          Burning Activity Calendar
        </div>

        {/* Links */}
        <nav className="flex flex-col gap-1">
          {SIDEBAR_LINKS.map(({ label, icon, href }) => {
            const isActive = pathname === href || (pathname === '/' && href === '/');
            return (
              <Link
                key={label}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#eff4ff] text-[#155eef]"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className={`material-symbols-outlined text-[20px] ${isActive ? 'text-[#155eef]' : 'text-gray-400'}`}>
                  {icon}
                </span>
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="px-2 pt-6 border-t border-gray-100">
        <span className="material-symbols-outlined text-gray-400 text-3xl mb-3 block">satellite_alt</span>
        <h4 className="text-sm font-semibold text-gray-900 mb-1 leading-tight">From satellite data<br/>to safer tomorrow</h4>
        <p className="text-xs text-gray-500 leading-relaxed">
          Harmonizing global fire observations for better monitoring, faster response, and a healthier planet.
        </p>
      </div>
    </aside>
  );
}
