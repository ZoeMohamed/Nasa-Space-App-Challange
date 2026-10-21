import type { AdminRegion } from "@/types";

/** "Kec. X, Kab. Y, Provinsi Z" — prefixed "±" when snapped to the nearest polygon. */
export function formatAdminFull(admin: AdminRegion | null | undefined): string | null {
  if (!admin) return null;
  const label = `Kec. ${admin.kecamatan}, ${admin.kabupatenKota}, ${admin.provinsi}`;
  return admin.approximate ? `± ${label}` : label;
}

/** "Kab. Y, Provinsi Z" — for compact cards and 0.25° grid areas. */
export function formatAdminShort(admin: AdminRegion | null | undefined): string | null {
  if (!admin) return null;
  const label = `${admin.kabupatenKota}, ${admin.provinsi}`;
  return admin.approximate ? `± ${label}` : label;
}

export function formatCoords(lat: number, lon: number, digits = 3): string {
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`;
}

/** Region name when resolved, otherwise the raw coordinates (never an invented place name). */
export function placeLabel(admin: AdminRegion | null | undefined, lat: number, lon: number, digits = 3): string {
  return formatAdminFull(admin) ?? formatCoords(lat, lon, digits);
}

export interface RegionLookupResponse {
  available: boolean;
  admin: AdminRegion | null;
  source: { name: string | null; license: string | null; validOn: string | null } | null;
}

/** Title + honest caption for a 0.25° grid area (a cell can span several kecamatan). */
export function areaRegionLabel(
  area: { gridLat: number; gridLon: number; admin?: AdminRegion | null },
  language: "id" | "en" = "id"
): { title: string; caption: string } {
  const en = language === "en";
  const grid = `Grid ${area.gridLat.toFixed(2)}, ${area.gridLon.toFixed(2)}`;
  const admin = area.admin;
  if (!admin) {
    return {
      title: grid,
      caption: en
        ? "Outside recorded administrative boundaries — 0.25° grid coordinates shown as-is."
        : "Di luar batas wilayah tercatat — koordinat grid 0,25° ditampilkan apa adanya.",
    };
  }
  const pct = admin.dominantShare != null ? Math.round(admin.dominantShare * 100) : null;
  const share = pct !== null ? (en ? `${pct}% of detections` : `${pct}% deteksi`) : en ? "most detections" : "deteksi terbanyak";
  const spread =
    admin.kecamatanCount && admin.kecamatanCount > 1
      ? en
        ? ` · cell spans ${admin.kecamatanCount} districts`
        : ` · sel mencakup ${admin.kecamatanCount} kecamatan`
      : "";
  return {
    title: formatAdminShort(admin) ?? grid,
    caption: `${en ? "District" : "Kec."} ${admin.kecamatan} (${share})${spread} · ${grid}`,
  };
}
