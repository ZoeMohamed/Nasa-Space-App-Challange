import type { ReactNode } from "react";

export type BadgeTone = "high" | "medium" | "low" | "info" | "neutral";

/**
 * Generalized from the ad hoc TIER_STYLE badge pattern in src/app/priority-areas/page.tsx —
 * "high"/"medium"/"low" use the exact same red/orange/gray classes that page already uses, so
 * existing severity badges stay visually identical if/when that page adopts this component.
 * "info" and "neutral" are added for non-severity badges (status, counts, etc.) elsewhere.
 */
const TONE_CLASSES: Record<BadgeTone, string> = {
  high: "bg-red-100 text-[#f04438] border-red-200",
  medium: "bg-orange-100 text-orange-700 border-orange-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
  info: "bg-blue-100 text-blue-700 border-blue-200",
  neutral: "bg-gray-100 text-gray-500 border-gray-200",
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export default function Badge({ tone = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded border uppercase ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
