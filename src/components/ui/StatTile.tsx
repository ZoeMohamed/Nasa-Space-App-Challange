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
  /** How to read the number: shown as a boxed list of label → value rows under the caption. */
  details?: StatDetail[];
  /** Title of the details box, e.g. "Cara membaca angka ini" (StatTile itself is language-agnostic). */
  detailsTitle?: string;
  /** A boxed warning, e.g. why a number can't be computed right now. */
  note?: ReactNode;
  className?: string;
}

export interface StatDetail {
  label: string;
  value: ReactNode;
  /** Greyed out (e.g. counts of cells that were not used). */
  muted?: boolean;
}

const ICON_TONE_CLASSES: Record<
  NonNullable<StatTileProps["iconTone"]>,
  string
> = {
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
export default function StatTile({
  icon,
  iconTone = "gray",
  label,
  value,
  trend,
  caption,
  details,
  detailsTitle,
  note,
  className = "",
}: StatTileProps) {
  return (
    <Card className={`p-5 flex flex-col justify-between ${className}`}>
      <div className="flex items-start gap-3 mb-2">
        {icon && (
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${ICON_TONE_CLASSES[iconTone]}`}
          >
            <span className="material-symbols-outlined text-lg">{icon}</span>
          </div>
        )}
        <div>
          <div className="text-xs font-semibold text-[var(--color-text-muted)] mb-1">
            {label}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[var(--color-text-main)]">
              {value}
            </span>
            {trend && (
              <span
                className={`text-xs font-semibold flex items-center gap-0.5 ${TREND_CLASSES[trend.direction]}`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {TREND_ICON[trend.direction]}
                </span>
                {trend.label}
              </span>
            )}
          </div>
        </div>
      </div>
      <div>
        {caption && (
          <div className="text-[11px] text-[var(--color-text-muted)] mt-2">
            {caption}
          </div>
        )}
        {note && (
          <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-950">
            <span className="material-symbols-outlined shrink-0 text-[16px] text-amber-600">
              warning
            </span>
            <div>{note}</div>
          </div>
        )}
        {details && details.length > 0 && (
          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-2.5">
            {detailsTitle && (
              <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                <span className="material-symbols-outlined text-[14px]">
                  info
                </span>
                {detailsTitle}
              </div>
            )}
            <dl className="space-y-1">
              {details.map((row) => (
                <div
                  key={row.label}
                  className={`flex items-start justify-between gap-3 text-[11px] ${row.muted ? "text-gray-400" : "text-gray-700"}`}
                >
                  <dt>{row.label}</dt>
                  <dd
                    className={`text-right ${row.muted ? "" : "font-semibold text-gray-900"}`}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </Card>
  );
}
