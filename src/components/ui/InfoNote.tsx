import type { ReactNode } from "react";

/**
 * A boxed explanation, so information about how to read a number never hides in small grey text.
 * "info" (blue) explains; "warning" (amber) flags a limitation or a missing value.
 */
export default function InfoNote({
  children,
  tone = "info",
  className = "",
}: {
  children: ReactNode;
  tone?: "info" | "warning";
  className?: string;
}) {
  const styles =
    tone === "warning"
      ? { box: "border-amber-200 bg-amber-50 text-amber-950", icon: "text-amber-600", glyph: "warning" }
      : { box: "border-blue-100 bg-blue-50/70 text-blue-950", icon: "text-blue-600", glyph: "info" };
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${styles.box} ${className}`}>
      <span className={`material-symbols-outlined shrink-0 text-[16px] ${styles.icon}`}>{styles.glyph}</span>
      <div>{children}</div>
    </div>
  );
}
