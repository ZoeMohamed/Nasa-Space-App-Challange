import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Basic bordered content card wrapper matching the AGNIBHUMI dashboard's stat/content cards
 * (white fill, `border-[#e2e8f0]`, rounded-xl, subtle shadow) — see Figma node 169:7496
 * ("Card 1: Total Hotspots") for the source styling.
 */
export default function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
