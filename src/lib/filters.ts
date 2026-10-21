/**
 * Shared Region + Time Range URL filters (`?region=` / `?range=`), written by TopBar.tsx and read
 * back by every Operator page via useSearchParams(). Sidebar links carry the query string along,
 * so a choice made on one page stays applied on the next.
 *
 * Region = a real province name from the offline boundary store (OCHA COD-AB / BPS 2020, 34
 * provinces — see python-service/fire_pipeline/admin_lookup.py). Live markers/areas are matched on
 * their own `admin.provinsi`; historical grid cells are filtered server-side via `?province=`.
 *
 * Time range: 24h / 7d / 30d are live NASA FIRMS NRT windows run through the full pipeline
 * (`/api/hotspots?window=`). "2023–2024" comes from the offline daily archive, which has no
 * per-detection data or priority scores.
 */
import type { AdminRegion } from "@/types";

export interface RegionOption {
  value: string;
  label: string;
  labelEn?: string;
  /** Exact `provinsi` string from the boundary store; null = Seluruh Indonesia (no filter). */
  provinsi: string | null;
  fireProne?: boolean;
}

const FIRE_PRONE = [
  "Riau",
  "Jambi",
  "Sumatera Selatan",
  "Kalimantan Barat",
  "Kalimantan Tengah",
  "Kalimantan Selatan",
  "Kalimantan Timur",
];

const OTHER_PROVINCES = [
  "Aceh", "Bali", "Banten", "Bengkulu", "Daerah Istimewa Yogyakarta", "Dki Jakarta", "Gorontalo",
  "Jawa Barat", "Jawa Tengah", "Jawa Timur", "Kalimantan Utara", "Kepulauan Bangka Belitung",
  "Kepulauan Riau", "Lampung", "Maluku", "Maluku Utara", "Nusa Tenggara Barat", "Nusa Tenggara Timur",
  "Papua", "Papua Barat", "Sulawesi Barat", "Sulawesi Selatan", "Sulawesi Tengah", "Sulawesi Tenggara",
  "Sulawesi Utara", "Sumatera Barat", "Sumatera Utara",
];

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function displayName(name: string) {
  return name === "Dki Jakarta" ? "DKI Jakarta" : name;
}

export const REGION_OPTIONS: RegionOption[] = [
  { value: "indonesia", label: "Seluruh Indonesia", labelEn: "All of Indonesia", provinsi: null },
  ...FIRE_PRONE.map((p) => ({ value: slug(p), label: displayName(p), provinsi: p, fireProne: true })),
  ...OTHER_PROVINCES.map((p) => ({ value: slug(p), label: displayName(p), provinsi: p })),
];

export const DEFAULT_REGION = REGION_OPTIONS[0].value;

export function getRegionOption(value: string | null): RegionOption {
  return REGION_OPTIONS.find((option) => option.value === value) ?? REGION_OPTIONS[0];
}

/** Items without a resolved region are excluded once a province is selected (never guessed in). */
export function matchesRegion(admin: AdminRegion | null | undefined, region: RegionOption): boolean {
  if (!region.provinsi) return true;
  return admin?.provinsi === region.provinsi;
}

export type LiveWindow = "24h" | "7d" | "30d";

export interface TimeRangeOption {
  value: string;
  label: string;
  labelEn: string;
  /** Live FIRMS window for /api/hotspots; null = offline archive range. */
  window: LiveWindow | null;
  /** Archive-only ranges: inclusive dates for /api/historical/map. */
  startDate?: string;
  endDate?: string;
}

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { value: "24h", label: "24 Jam Terakhir", labelEn: "Last 24 Hours", window: "24h" },
  { value: "7d", label: "7 Hari Terakhir", labelEn: "Last 7 Days", window: "7d" },
  { value: "30d", label: "30 Hari Terakhir", labelEn: "Last 30 Days", window: "30d" },
  {
    value: "2023-2024",
    label: "Jan 2023 – Des 2024 (arsip)",
    labelEn: "Jan 2023 – Dec 2024 (archive)",
    window: null,
    startDate: "2023-01-01",
    endDate: "2024-12-31",
  },
];

export const DEFAULT_RANGE = TIME_RANGE_OPTIONS[0].value;

export function getRangeOption(value: string | null): TimeRangeOption {
  return TIME_RANGE_OPTIONS.find((option) => option.value === value) ?? TIME_RANGE_OPTIONS[0];
}

/** True for the offline-archive range (no per-detection markers, no priority scores). */
export function isArchiveRange(value: string | null): boolean {
  return getRangeOption(value).window === null;
}

/** Live window to request; archive ranges fall back to 24h for pages that also show live context. */
export function liveWindowFor(value: string | null): LiveWindow {
  return getRangeOption(value).window ?? "24h";
}

export function historicalQuery(region: RegionOption, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (region.provinsi) params.set("province", region.provinsi);
  return params.toString();
}

/** `path` + the current ?region=&range= so in-app links keep the TopBar selection. */
export function withFilters(path: string, searchParams: { get(name: string): string | null }): string {
  const params = new URLSearchParams();
  for (const key of ["region", "range"]) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Display label for a region/range option in the active language. */
export function labelOf(option: { label: string; labelEn?: string }, language: "id" | "en"): string {
  return language === "en" && option.labelEn ? option.labelEn : option.label;
}
