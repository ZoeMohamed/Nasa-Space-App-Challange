import type { ReactNode } from "react";
import Card from "./Card";

export type StatTrendDirection = "up" | "down" | "flat";

interface StatTrend {
  direction: StatTrendDirection;
  label: string;
}

interface StatTileProps {
  icon?: string;
  /** Tailwind color keyword for the icon circle (matches Figma's per-metric tinted icon badges). */
  iconTone?: "red" | "green" | "blue" | "amber" | "gray";
  label: string;
  value: ReactNode;
  /**
   * In fire-monitoring context an "up" trend (more hotspots/area) is the bad direction and "down"
   * is good — this mirrors the trendLabel() convention already used in
   * src/app/priority-areas/page.tsx (growth > 0 => red "Meningkat", growth < 0 => emerald
   * "Menurun"). Pass `direction: "flat"` to fall back to neutral gray.
   */
  trend?: StatTrend;
  caption?: string;
  className?: string;
}

const ICON_TONE_CLASSES: Record<NonNullable<StatTileProps["iconTone"]>, string> = {
  red: "bg-red-50 text-[#f04438]",
  green: "bg-emerald-50 text-emerald-600",
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  gray: "bg-gray-100 text-gray-500",
};

const TREND_CLASSES: Record<StatTrendDirection, string> = {
  up: "text-[#f04438]",
  down: "text-emerald-600",
  flat: "text-gray-400",
};

const TREND_ICON: Record<StatTrendDirection, string> = {
  up: "arrow_upward",
  down: "arrow_downward",
  flat: "remove",
};

/**
 * Generalized from the 4-column stat grid pattern repeated across src/app/page.tsx,
 * src/app/priority-areas/page.tsx and the Figma "KeyMetricsCards" section
 * (node 169:7495 / "Card 1: Total Hotspots", node 169:7496): icon circle + label + large value +
 * optional colored trend badge + small caption underneath. Not yet adopted by those pages —
 * this is the shared primitive for future migration.
 */
export default function StatTile({ icon, iconTone = "gray", label, value, trend, caption, className = "" }: StatTileProps) {
  return (
    <Card className={`p-5 flex flex-col justify-between ${className}`}>
      <div className="flex items-start gap-3 mb-2">
        {icon && (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${ICON_TONE_CLASSES[iconTone]}`}>
            <span className="material-symbols-outlined text-lg">{icon}</span>
          </div>
        )}
        <div>
          <div className="text-xs font-semibold text-[var(--color-text-muted)] mb-1">{label}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[var(--color-text-main)]">{value}</span>
            {trend && (
              <span className={`text-xs font-semibold flex items-center gap-0.5 ${TREND_CLASSES[trend.direction]}`}>
                <span className="material-symbols-outlined text-[14px]">{TREND_ICON[trend.direction]}</span>
                {trend.label}
              </span>
            )}
          </div>
        </div>
      </div>
      {caption && <div className="text-[11px] text-[var(--color-text-muted)] mt-2">{caption}</div>}
    </Card>
  );
}
