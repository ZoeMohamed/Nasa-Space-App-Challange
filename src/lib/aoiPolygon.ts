/**
 * A user-drawn area of interest. Stored in the URL as "lat,lon;lat,lon;..." (the same format the
 * backend parses in python-service/fire_pipeline/admin_lookup.py parse_polygon), so a calendar
 * for a drawn area can be shared as a link.
 */

export type LatLon = [number, number];

export const MAX_AOI_POINTS = 200;

export function encodePolygon(points: LatLon[]): string {
  return points.map(([lat, lon]) => `${lat.toFixed(4)},${lon.toFixed(4)}`).join(";");
}

export function decodePolygon(text: string | null): LatLon[] | null {
  if (!text) return null;
  const points = text.split(";").map((pair) => pair.split(",").map(Number) as LatLon);
  if (points.length < 3 || points.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v)))) return null;
  return points;
}

/** Approximate area in km² (shoelace on an equirectangular projection; fine at Indonesia's latitudes). */
export function polygonAreaKm2(points: LatLon[]): number {
  if (points.length < 3) return 0;
  const meanLat = (points.reduce((s, [lat]) => s + lat, 0) / points.length) * (Math.PI / 180);
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos(meanLat);
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [lat1, lon1] = points[i];
    const [lat2, lon2] = points[(i + 1) % points.length];
    sum += lon1 * kmPerDegLon * (lat2 * kmPerDegLat) - lon2 * kmPerDegLon * (lat1 * kmPerDegLat);
  }
  return Math.abs(sum) / 2;
}

function pointInPolygon([lat, lon]: LatLon, points: LatLon[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [latI, lonI] = points[i];
    const [latJ, lonJ] = points[j];
    if (latI > lat !== latJ > lat && lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI) inside = !inside;
  }
  return inside;
}

function segmentsCross(a: LatLon, b: LatLon, c: LatLon, d: LatLon): boolean {
  const cross = (p: LatLon, q: LatLon, r: LatLon) => (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Does the 0.25° grid cell with south-west corner (lat, lon) touch the polygon? Same rule as the backend. */
export function cellTouchesPolygon(lat: number, lon: number, points: LatLon[], size = 0.25): boolean {
  const corners: LatLon[] = [
    [lat, lon],
    [lat, lon + size],
    [lat + size, lon + size],
    [lat + size, lon],
  ];
  if (corners.some((corner) => pointInPolygon(corner, points))) return true;
  if (points.some(([pLat, pLon]) => pLat >= lat && pLat <= lat + size && pLon >= lon && pLon <= lon + size)) return true;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let k = 0; k < 4; k++) if (segmentsCross(a, b, corners[k], corners[(k + 1) % 4])) return true;
  }
  return false;
}
