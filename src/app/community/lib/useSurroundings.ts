"use client";

import { useEffect, useMemo, useState } from "react";
import { bearingDeg, haversineKm, isUpwind } from "./geo";
import type { LocationFix } from "./geo";
import { STATUS_RADIUS_KM, computeAreaStatus, type AreaStatusResult } from "./areaStatus";
import type { CommunityReport, HotspotApiResponse, HotspotMarker, WeatherResponse } from "@/types";
import type { Language } from "@/lib/i18n/LanguageContext";

/** Hotspots fetched around the user: everything within this radius, filtered server-side. */
export const SURROUNDINGS_FETCH_KM = 50;
const CALM_WIND_KMH = 2;

export interface HotspotWithGeo {
  marker: HotspotMarker;
  distanceKm: number;
  bearing: number;
  upwind: boolean;
}

export interface NearbyReport {
  report: CommunityReport;
  distanceKm: number;
}

export interface Surroundings {
  loading: boolean;
  /** True when the satellite feed failed: "no hotspot nearby" must not be claimed then. */
  hotspotsUnavailable: boolean;
  hotspots: HotspotWithGeo[];
  nearest: HotspotWithGeo | null;
  inStatusRadius: HotspotWithGeo[];
  nearestUpwind: HotspotWithGeo | null;
  weather: WeatherResponse | null;
  weatherLoading: boolean;
  windFromDeg: number | null;
  windSpeedKmh: number | null;
  windUsable: boolean;
  verifiedReports: NearbyReport[];
  status: AreaStatusResult | null;
}

/**
 * Everything the "Sekitarku" panel shows for the user's own location, from real sources only:
 * live NASA FIRMS hotspots near the point (/api/hotspots, harmonized MODIS + VIIRS), Open-Meteo
 * wind + air quality (/api/weather) and officer-verified citizen reports (/api/reports/public).
 * The status itself is computeAreaStatus() — the same rule set the Edukasi article documents.
 */
export function useSurroundings(fix: LocationFix | null, reports: CommunityReport[], language: Language): Surroundings {
  const [hotspotState, setHotspotState] = useState<{ key: string; markers: HotspotMarker[]; failed: boolean } | null>(null);
  const [weatherState, setWeatherState] = useState<{ key: string; data: WeatherResponse | null } | null>(null);

  const key = fix ? `${fix.lat.toFixed(4)},${fix.lon.toFixed(4)}` : null;

  useEffect(() => {
    if (!fix || !key) return;
    let cancelled = false;
    const query = `nearLat=${fix.lat.toFixed(5)}&nearLon=${fix.lon.toFixed(5)}&nearKm=${SURROUNDINGS_FETCH_KM}&limit=5000`;
    fetch(`/api/hotspots?${query}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<HotspotApiResponse>) : null))
      .then((body) => {
        if (!cancelled) setHotspotState({ key, markers: body?.markers ?? [], failed: !body });
      })
      .catch(() => {
        if (!cancelled) setHotspotState({ key, markers: [], failed: true });
      });
    fetch(`/api/weather?lat=${fix.lat}&lon=${fix.lon}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<WeatherResponse>) : null))
      .then((body) => {
        if (!cancelled) setWeatherState({ key, data: body });
      })
      .catch(() => {
        if (!cancelled) setWeatherState({ key, data: null });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const markers = hotspotState?.key === key ? hotspotState.markers : null;
  const hotspotsUnavailable = hotspotState?.key === key && hotspotState.failed;
  const weather = weatherState?.key === key ? weatherState.data : null;
  const weatherLoading = Boolean(fix) && weatherState?.key !== key;
  const windFromDeg = weather?.wind?.windDirectionDeg ?? null;
  const windSpeedKmh = weather?.wind?.windSpeedKmh ?? null;
  const windUsable = windFromDeg !== null && windSpeedKmh !== null && windSpeedKmh >= CALM_WIND_KMH;

  const hotspots = useMemo<HotspotWithGeo[]>(() => {
    if (!fix || !markers) return [];
    const user = { lat: fix.lat, lon: fix.lon };
    return markers
      .map((marker) => {
        const point = { lat: marker.lat, lon: marker.lng };
        return {
          marker,
          distanceKm: haversineKm(user, point),
          bearing: bearingDeg(user, point),
          upwind: windUsable ? isUpwind(user, point, windFromDeg as number) : false,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [fix, markers, windUsable, windFromDeg]);

  const verifiedReports = useMemo<NearbyReport[]>(() => {
    if (!fix) return [];
    const user = { lat: fix.lat, lon: fix.lon };
    return reports
      .filter((report) => report.status === "verified")
      .map((report) => ({ report, distanceKm: haversineKm(user, { lat: report.lat, lon: report.lon }) }))
      .filter((r) => r.distanceKm <= STATUS_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [fix, reports]);

  const nearest = hotspots[0] ?? null;
  const nearestUpwind = hotspots.find((h) => h.upwind) ?? null;
  const inStatusRadius = hotspots.filter((h) => h.distanceKm <= STATUS_RADIUS_KM);
  const loading = Boolean(fix) && (markers === null || weatherLoading);

  // Wait for hotspots AND weather so the status doesn't flip from "Aman" to "Awas" a second later.
  const status =
    !fix || loading
      ? null
      : computeAreaStatus(
          {
            nearestHotspotKm: nearest?.distanceKm ?? null,
            nearestVerifiedReportKm: verifiedReports[0]?.distanceKm ?? null,
            nearestUpwindHotspotKm: nearestUpwind?.distanceKm ?? null,
            usAqi: weather?.airQuality?.usAqi ?? null,
          },
          language
        );

  return {
    loading,
    hotspotsUnavailable,
    hotspots,
    nearest,
    inStatusRadius,
    nearestUpwind,
    weather,
    weatherLoading,
    windFromDeg,
    windSpeedKmh,
    windUsable,
    verifiedReports,
    status,
  };
}
