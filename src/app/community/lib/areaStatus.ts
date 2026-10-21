/**
 * Plain-language "Aman / Waspada / Siaga / Awas" summary for the user's OWN location, computed on
 * the device from real data only — not an official BNPB/BMKG alert level and not a calibrated risk
 * score. The status is the HIGHEST level any factor reaches, and every factor that set it is
 * returned as a reason so the UI can say why (shown verbatim in the Edukasi article):
 *
 *   factor                                   Waspada        Siaga          Awas
 *   satellite hotspot distance (24 h)        5–10 km        ≤ 5 km         —
 *   hotspot upwind (smoke may drift here)    ≤ 25 km        —              —
 *   air quality, US AQI (Open-Meteo model)   151–200        201–300        > 300
 *   officer-verified citizen report          —              —              ≤ 5 km
 *
 * Air quality was added after a real case on 2026-10-20: Kec. Maliku (Pulang Pisau) showed "Aman"
 * (nearest hotspot 14.9 km) while the air there was AQI 525 "Berbahaya" — distance alone ignored
 * smoke that had already arrived.
 */

export const STATUS_RADIUS_KM = 10;
export const STATUS_NEAR_KM = 5;
export const STATUS_UPWIND_KM = 25;

export type AreaStatusLevel = "aman" | "waspada" | "siaga" | "awas";

const RANK: Record<AreaStatusLevel, number> = { aman: 0, waspada: 1, siaga: 2, awas: 3 };

export interface AreaStatusInput {
  nearestHotspotKm: number | null;
  nearestVerifiedReportKm: number | null;
  /** Nearest hotspot lying upwind of the user (null when none, or wind unknown/calm). */
  nearestUpwindHotspotKm: number | null;
  usAqi: number | null;
}

export interface AreaStatusReason {
  level: AreaStatusLevel;
  text: string;
}

export interface AreaStatusResult {
  level: AreaStatusLevel;
  /** Factors that reached the final level — the "why" shown under the status. */
  reasons: AreaStatusReason[];
}

function formatKm(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function computeAreaStatus(input: AreaStatusInput, language: "id" | "en" = "id"): AreaStatusResult {
  const en = language === "en";
  const reasons: AreaStatusReason[] = [];
  const { nearestHotspotKm, nearestVerifiedReportKm, nearestUpwindHotspotKm, usAqi } = input;

  if (nearestVerifiedReportKm !== null && nearestVerifiedReportKm <= STATUS_NEAR_KM) {
    const km = formatKm(nearestVerifiedReportKm);
    reasons.push({
      level: "awas",
      text: en ? `Officer-verified citizen report ${km} from you` : `Laporan warga terverifikasi petugas ${km} dari lokasimu`,
    });
  }
  if (usAqi !== null) {
    const aqi = Math.round(usAqi);
    if (aqi > 300) reasons.push({ level: "awas", text: en ? `Hazardous air quality (US AQI ${aqi})` : `Kualitas udara Berbahaya (US AQI ${aqi})` });
    else if (aqi > 200)
      reasons.push({ level: "siaga", text: en ? `Very unhealthy air quality (US AQI ${aqi})` : `Kualitas udara Sangat tidak sehat (US AQI ${aqi})` });
    else if (aqi > 150)
      reasons.push({ level: "waspada", text: en ? `Unhealthy air quality (US AQI ${aqi})` : `Kualitas udara Tidak sehat (US AQI ${aqi})` });
  }
  if (nearestHotspotKm !== null && nearestHotspotKm <= STATUS_RADIUS_KM) {
    const km = formatKm(nearestHotspotKm);
    reasons.push({
      level: nearestHotspotKm <= STATUS_NEAR_KM ? "siaga" : "waspada",
      text: en ? `Satellite hotspot ${km} from you` : `Titik panas satelit ${km} dari lokasimu`,
    });
  }
  if (nearestUpwindHotspotKm !== null && nearestUpwindHotspotKm <= STATUS_UPWIND_KM) {
    const km = formatKm(nearestUpwindHotspotKm);
    reasons.push({
      level: "waspada",
      text: en
        ? `Hotspot ${km} upwind — its smoke may drift to you`
        : `Titik panas ${km} searah angin — asapnya bisa terbawa ke lokasimu`,
    });
  }

  const level = reasons.reduce<AreaStatusLevel>((max, r) => (RANK[r.level] > RANK[max] ? r.level : max), "aman");
  return { level, reasons: reasons.filter((r) => r.level === level) };
}

export const STATUS_LABEL: Record<AreaStatusLevel, string> = {
  aman: "Aman",
  waspada: "Waspada",
  siaga: "Siaga",
  awas: "Awas",
};

export const STATUS_LABEL_EN: Record<AreaStatusLevel, string> = {
  aman: "Safe",
  waspada: "Watch",
  siaga: "Alert",
  awas: "Danger",
};

export function statusLabel(level: AreaStatusLevel, language: "id" | "en"): string {
  return (language === "en" ? STATUS_LABEL_EN : STATUS_LABEL)[level];
}

/** python-service weather.py returns US AQI categories in Indonesian; this maps them for English. */
const AQI_CATEGORY_EN: Record<string, string> = {
  Baik: "Good",
  Sedang: "Moderate",
  "Tidak sehat (kelompok sensitif)": "Unhealthy for sensitive groups",
  "Tidak sehat": "Unhealthy",
  "Sangat tidak sehat": "Very unhealthy",
  Berbahaya: "Hazardous",
};

export function aqiCategoryLabel(category: string, language: "id" | "en"): string {
  return language === "en" ? (AQI_CATEGORY_EN[category] ?? category) : category;
}
