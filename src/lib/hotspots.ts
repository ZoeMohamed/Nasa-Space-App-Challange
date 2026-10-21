import type { HotspotApiResponse } from "@/types";
import type { LiveWindow } from "./filters";

export interface HotspotQuery {
  window?: LiveWindow;
  includeAllConfidence?: boolean;
  /** Exact province name (server-side filter, applied before the marker cap). */
  province?: string | null;
  near?: { lat: number; lon: number; km: number } | null;
  markerId?: string | null;
  limit?: number;
  order?: "frp" | "recent";
}

export function hotspotQueryString({
  window = "24h",
  includeAllConfidence = false,
  province,
  near,
  markerId,
  limit,
  order,
}: HotspotQuery = {}): string {
  const params = new URLSearchParams();
  if (window !== "24h") params.set("window", window);
  if (includeAllConfidence) params.set("includeAllConfidence", "true");
  if (province) params.set("province", province);
  if (near) {
    params.set("nearLat", near.lat.toFixed(5));
    params.set("nearLon", near.lon.toFixed(5));
    params.set("nearKm", String(near.km));
  }
  if (markerId) params.set("markerId", markerId);
  if (limit) params.set("limit", String(limit));
  if (order && order !== "frp") params.set("order", order);
  return params.toString();
}

export async function fetchHotspots(query: HotspotQuery & { signal?: AbortSignal } = {}): Promise<HotspotApiResponse> {
  const { signal, ...rest } = query;
  const qs = hotspotQueryString(rest);
  const response = await fetch(`/api/hotspots${qs ? `?${qs}` : ""}`, { signal, cache: "no-store" });
  const body = (await response.json()) as HotspotApiResponse & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Unable to load NASA FIRMS data.");
  return body;
}

/** First load of a long window fetches many date chunks from NASA FIRMS (later loads are cached). */
export function windowLoadingNote(window: LiveWindow, language: "id" | "en" = "id"): string | null {
  if (window === "7d")
    return language === "en"
      ? "Fetching 7 days of NASA FIRMS data. The first load can take ~1 minute."
      : "Mengambil 7 hari data NASA FIRMS. Pemuatan pertama bisa ±1 menit.";
  if (window === "30d")
    return language === "en"
      ? "Fetching 30 days of NASA FIRMS data. The first load can take 2–3 minutes, later loads are faster."
      : "Mengambil 30 hari data NASA FIRMS. Pemuatan pertama bisa 2–3 menit, berikutnya lebih cepat.";
  return null;
}
