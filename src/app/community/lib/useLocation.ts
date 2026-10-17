"use client";

import { useCallback, useState } from "react";
import {
  type GeoPermissionStatus,
  type LocationFix,
  rememberLocationGrantedOnce,
} from "./geo";

export interface LocationState {
  geoStatus: GeoPermissionStatus;
  errorMessage: string | null;
  fix: LocationFix | null;
  /** Requests the browser's geolocation — only ever called from an explicit user click, never on mount. */
  requestGeolocation: () => void;
  /** Sets a manually-chosen point (typed coordinates or a known-area pick). */
  setManualFix: (next: LocationFix) => void;
  clearFix: () => void;
}

/**
 * Shared geolocation state machine for the Community View. Never calls
 * getCurrentPosition on its own — requestGeolocation() must be invoked by a
 * user action (a button's onClick). Nothing here persists a coordinate;
 * only geo.ts's rememberLocationGrantedOnce() writes a boolean flag.
 */
export function useLocationState(): LocationState {
  const [geoStatus, setGeoStatus] = useState<GeoPermissionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fix, setFix] = useState<LocationFix | null>(null);

  const requestGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus("unavailable");
      setErrorMessage("Perangkat atau browser ini tidak mendukung layanan lokasi.");
      return;
    }

    setGeoStatus("loading");
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFix({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          source: "gps",
          accuracyMeters: position.coords.accuracy,
        });
        setGeoStatus("granted");
        rememberLocationGrantedOnce();
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGeoStatus("denied");
          setErrorMessage("Izin lokasi ditolak. Anda tetap bisa memilih lokasi secara manual di bawah.");
        } else if (error.code === error.TIMEOUT) {
          setGeoStatus("unavailable");
          setErrorMessage("Permintaan lokasi memakan waktu terlalu lama. Coba lagi atau pilih lokasi manual.");
        } else {
          setGeoStatus("unavailable");
          setErrorMessage("Lokasi tidak dapat ditentukan saat ini. Coba lagi atau pilih lokasi manual.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  const setManualFix = useCallback((next: LocationFix) => {
    setFix(next);
    setErrorMessage(null);
  }, []);

  const clearFix = useCallback(() => {
    setFix(null);
  }, []);

  return { geoStatus, errorMessage, fix, requestGeolocation, setManualFix, clearFix };
}
