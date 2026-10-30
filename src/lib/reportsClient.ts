import type { ReportsListResponse } from "@/types";

/**
 * Citizen reports for the operator pages, which are public (they show NASA
 * data). A signed-in officer gets every report; any other visitor gets the
 * backend's 401 and falls back to the public list: officer-verified reports
 * only, with rounded coordinates and no token or photo.
 */
export async function fetchReportsForViewer(
  signal?: AbortSignal
): Promise<(ReportsListResponse & { scope: "officer" | "public" }) | null> {
  const full = await fetch("/api/reports", { cache: "no-store", signal });
  if (full.ok) return { ...((await full.json()) as ReportsListResponse), scope: "officer" };
  if (full.status !== 401) return null;
  const publicList = await fetch("/api/reports/public", { cache: "no-store", signal });
  if (!publicList.ok) return null;
  return { ...((await publicList.json()) as ReportsListResponse), scope: "public" };
}
