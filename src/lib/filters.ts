/**
 * Shared Region + Time Range URL-filter definitions, consumed by TopBar.tsx (the dropdowns that
 * write `?region=` / `?range=` to the URL) and by the 4 pages that read them back via
 * `useSearchParams()` to filter real data client-side.
 *
 * Region bounding boxes below are intentionally approximate rectangles for FILTERING already-
 * fetched hotspot data (lat/lng on markers, gridLat/gridLon on areas) — they are NOT official
 * administrative polygons. Label them as such anywhere they're shown to a user
 * ("batas provinsi perkiraan, bukan batas administratif resmi").
 *
 * "Seluruh Indonesia" (the default, no `region` param) intentionally matches the exact
 * bounding box the backend already fetches from NASA FIRMS — see INDONESIA_BOUNDS in
 * python-service/fire_pipeline/live.py ("95,-11,141,6" -> minLon,minLat,maxLon,maxLat). Since
 * the backend never returns anything outside that box, this option is a no-op filter, which is
 * the honest behavior for "the real default".
 */

export interface LatLonBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface RegionOption {
  value: string;
  label: string;
  /** null = no filtering (Seluruh Indonesia / default) */
  bounds: LatLonBounds | null;
}

export const REGION_OPTIONS: RegionOption[] = [
  { value: "indonesia", label: "Seluruh Indonesia", bounds: null },
  {
    value: "kalimantan-tengah",
    label: "Kalimantan Tengah",
    bounds: { minLat: -3.5, maxLat: 0.5, minLon: 110.5, maxLon: 114.5 },
  },
  {
    value: "riau",
    label: "Riau",
    bounds: { minLat: -1.5, maxLat: 2.5, minLon: 100.0, maxLon: 103.5 },
  },
  {
    value: "sumatera-selatan",
    label: "Sumatera Selatan",
    bounds: { minLat: -4.5, maxLat: -1.0, minLon: 102.0, maxLon: 106.0 },
  },
  {
    value: "jambi",
    label: "Jambi",
    bounds: { minLat: -2.5, maxLat: -0.5, minLon: 101.5, maxLon: 104.5 },
  },
  {
    value: "kalimantan-selatan",
    label: "Kalimantan Selatan",
    bounds: { minLat: -4.5, maxLat: -1.0, minLon: 114.0, maxLon: 116.5 },
  },
];

export const DEFAULT_REGION = REGION_OPTIONS[0].value;

export function getRegionOption(value: string | null): RegionOption {
  return REGION_OPTIONS.find((option) => option.value === value) ?? REGION_OPTIONS[0];
}

export function isWithinBounds(lat: number, lon: number, bounds: LatLonBounds | null): boolean {
  if (!bounds) return true;
  return lat >= bounds.minLat && lat <= bounds.maxLat && lon >= bounds.minLon && lon <= bounds.maxLon;
}

export interface TimeRangeOption {
  value: string;
  label: string;
  /** Only "24h" is backed by real data — see python-service/fire_pipeline/live.py (NRT-only, no historical store). */
  isLive: boolean;
}

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { value: "24h", label: "24 Jam Terakhir", isLive: true },
  { value: "7d", label: "7 Hari Terakhir", isLive: false },
  { value: "30d", label: "30 Hari Terakhir", isLive: false },
  { value: "2023-2024", label: "Jan 2023 – Des 2024", isLive: false },
];

export const DEFAULT_RANGE = TIME_RANGE_OPTIONS[0].value;

export function getRangeOption(value: string | null): TimeRangeOption {
  return TIME_RANGE_OPTIONS.find((option) => option.value === value) ?? TIME_RANGE_OPTIONS[0];
}

/** True when the selected range is anything other than the live-backed 24h default. */
export function isDemoRange(value: string | null): boolean {
  return !getRangeOption(value).isLive;
}
