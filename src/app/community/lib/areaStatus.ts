/**
 * Derives a plain-language "Aman / Waspada / Siaga / Awas" summary chip from
 * REAL nearest-detection distance + severity — never a fabricated value.
 *
 * This is deliberately a simplified, locally-computed interpretation (NOT an
 * official BNPB/BMKG alert level) and is always shown with that caveat in
 * the UI. Thresholds below are a reasonable, documented judgment call for
 * this prototype:
 *   - no hotspot data nearby at all          -> "Aman"
 *   - nearest hotspot > 15km away            -> "Aman" (mentions farther detections exist)
 *   - nearest hotspot 5-15km, any severity    -> "Waspada"
 *   - nearest hotspot 1-5km, or MATCHED       -> "Siaga"
 *   - nearest hotspot <= 1km AND HIGH severity -> "Awas"
 * A satellite hotspot — regardless of level — is still only a thermal
 * detection, never a confirmed fire; every level's description repeats that.
 */

export type AreaStatusLevel = "aman" | "waspada" | "siaga" | "awas";

export interface AreaStatus {
  level: AreaStatusLevel;
  label: string;
  description: string;
  colorClasses: string;
}

const LEVEL_STYLE: Record<AreaStatusLevel, { label: string; colorClasses: string }> = {
  aman: { label: "Aman", colorClasses: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  waspada: { label: "Waspada", colorClasses: "bg-amber-100 text-amber-800 border-amber-300" },
  siaga: { label: "Siaga", colorClasses: "bg-orange-100 text-orange-800 border-orange-300" },
  awas: { label: "Awas", colorClasses: "bg-rose-100 text-rose-800 border-rose-300" },
};

export function deriveAreaStatus(
  nearestDistanceKm: number | null,
  nearestSeverity: "HIGH" | "MEDIUM" | "LOW" | null,
  nearestMatchStatus: string | null | undefined
): AreaStatus {
  const disclaimer = "Deteksi satelit menunjukkan titik panas, bukan konfirmasi kebakaran di lapangan.";

  if (nearestDistanceKm === null) {
    return {
      level: "aman",
      label: LEVEL_STYLE.aman.label,
      description: `Tidak ada deteksi satelit di sekitar lokasi Anda saat ini. ${disclaimer}`,
      colorClasses: LEVEL_STYLE.aman.colorClasses,
    };
  }

  let level: AreaStatusLevel;
  if (nearestDistanceKm <= 1 && nearestSeverity === "HIGH") {
    level = "awas";
  } else if (nearestDistanceKm <= 5 || nearestMatchStatus === "MATCHED") {
    level = "siaga";
  } else if (nearestDistanceKm <= 15) {
    level = "waspada";
  } else {
    level = "aman";
  }

  const style = LEVEL_STYLE[level];
  const distanceNote =
    level === "aman"
      ? `Deteksi terdekat sekitar ${nearestDistanceKm.toFixed(1)} km dari lokasi Anda.`
      : `Deteksi terdekat sekitar ${nearestDistanceKm.toFixed(1)} km dari lokasi Anda.`;

  return {
    level,
    label: style.label,
    description: `${distanceNote} ${disclaimer} Ini bukan status peringatan resmi BNPB/BMKG — ringkasan sederhana berdasarkan data yang tersedia.`,
    colorClasses: style.colorClasses,
  };
}
