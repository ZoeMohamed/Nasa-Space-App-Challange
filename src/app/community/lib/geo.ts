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
  /** Place name chosen from the search list (manual picks only). */
  label?: string;
}

/**
 * A MANUAL pick (searched place / typed coordinates) is a location the user chose on purpose, so
 * it is remembered on this device until they change it. A GPS coordinate is never stored — with
 * permission already granted, the device is simply asked again on the next visit.
 */
const MANUAL_FIX_KEY = "agnibhumi_manual_location";

export function loadManualFix(): LocationFix | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MANUAL_FIX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocationFix>;
    if (typeof parsed.lat !== "number" || typeof parsed.lon !== "number") return null;
    if (parsed.source !== "manual-coords" && parsed.source !== "manual-area") return null;
    return { lat: parsed.lat, lon: parsed.lon, source: parsed.source, label: parsed.label };
  } catch {
    return null;
  }
}

export function saveManualFix(fix: LocationFix | null): void {
  if (typeof window === "undefined") return;
  try {
    if (fix && fix.source !== "gps") {
      window.localStorage.setItem(
        MANUAL_FIX_KEY,
        JSON.stringify({ lat: fix.lat, lon: fix.lon, source: fix.source, label: fix.label })
      );
    } else {
      window.localStorage.removeItem(MANUAL_FIX_KEY);
    }
  } catch {
    // Best-effort only.
  }
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

/** Initial great-circle bearing from `from` to `to`, degrees clockwise from north (0–360). */
export function bearingDeg(from: LatLon, to: LatLon): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS_ID = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];

export function compassLabel(deg: number): string {
  return COMPASS_ID[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Smallest absolute difference between two compass bearings (0–180). */
export function angleDiffDeg(a: number, b: number): number {
  const diff = Math.abs((((a - b) % 360) + 360) % 360);
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Open-Meteo's wind direction is meteorological: the direction the wind blows FROM. Smoke from a
 * hotspot reaches you when that hotspot lies on the side the wind comes from, i.e. the bearing
 * from you to the hotspot is within ±toleranceDeg of the wind-from direction. Single-point, current
 * wind only — a rough indication, not a smoke-dispersion model.
 */
export function isUpwind(user: LatLon, hotspot: LatLon, windFromDeg: number, toleranceDeg = 45): boolean {
  return angleDiffDeg(bearingDeg(user, hotspot), windFromDeg) <= toleranceDeg;
}
