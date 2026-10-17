/**
 * Shared geolocation helpers for the Community View (Beranda + Lapor Kebakaran).
 *
 * Deliberately local to src/app/community/ rather than src/lib/ — this task's
 * constraints scope edits to the community directory (plus the new API
 * routes and additive types), so this isn't shared with the Operator View.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Pure haversine great-circle distance in kilometers. There's a Python
 * equivalent in python-service/fire_pipeline/matching.py used by the
 * backend's own report<->satellite correlation, but nothing reusable on the
 * TS/client side yet, so this is a small local port of the same formula.
 */
export function haversineKm(a: LatLon, b: LatLon): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_KM * c;
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * The browser-geolocation part of the location state machine. This is
 * intentionally separate from "do we have a usable point" (see LocationFix
 * below) — a user can be `denied`/`unavailable` here and still have a usable
 * point via the manual fallback (typed coordinates or a known-area pick).
 */
export type GeoPermissionStatus = "idle" | "loading" | "granted" | "denied" | "unavailable";

export type LocationSource = "gps" | "manual-coords" | "manual-area";

export interface LocationFix extends LatLon {
  source: LocationSource;
  /** Only present for GPS fixes, purely for this session's display — never persisted. */
  accuracyMeters?: number;
}

/**
 * We only ever persist the FACT that geolocation was granted once on this
 * device — never the coordinate itself. Used to show a small "you've
 * allowed this before" hint; it never triggers an automatic location
 * request (that always requires an explicit click, per the task's privacy
 * requirement).
 */
const GEO_GRANTED_ONCE_KEY = "agnibhumi_geo_granted_once";

export function hasGrantedLocationBefore(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GEO_GRANTED_ONCE_KEY) === "1";
  } catch {
    // localStorage can throw in private-browsing/blocked-storage contexts — treat as "no".
    return false;
  }
}

export function rememberLocationGrantedOnce(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GEO_GRANTED_ONCE_KEY, "1");
  } catch {
    // Ignore — this is a best-effort convenience flag, not critical state.
  }
}

/**
 * Known-area fallback for users who deny/lack geolocation. Reuses the exact
 * province bounding boxes already established in src/lib/filters.ts
 * (REGION_OPTIONS) rather than inventing a new list, so the "approximate,
 * not an official boundary" caveat already documented there stays the single
 * source of truth. The "Seluruh Indonesia" (no-bounds) option is excluded
 * here since it has no single point to center on.
 */
export function regionCenter(bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }): LatLon {
  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lon: (bounds.minLon + bounds.maxLon) / 2,
  };
}
