"use client";

import { useEffect, useState } from "react";
import type { AdminRegion } from "@/types";
import type { RegionLookupResponse } from "./adminRegion";

/** Resolves a lat/lon to kecamatan/kab-kota/provinsi via /api/region; null while loading or unresolved. */
export function useRegion(lat: number | null | undefined, lon: number | null | undefined): AdminRegion | null {
  const [result, setResult] = useState<{ key: string; admin: AdminRegion | null } | null>(null);
  const key = lat != null && lon != null ? `${lat.toFixed(4)},${lon.toFixed(4)}` : null;

  useEffect(() => {
    if (!key || lat == null || lon == null) return;
    const controller = new AbortController();
    fetch(`/api/region?lat=${lat}&lon=${lon}`, { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<RegionLookupResponse>) : null))
      .then((body) => setResult({ key, admin: body?.admin ?? null }))
      .catch(() => {
        /* best-effort: callers fall back to coordinates */
      });
    return () => controller.abort();
  }, [key, lat, lon]);

  return result && result.key === key ? result.admin : null;
}
