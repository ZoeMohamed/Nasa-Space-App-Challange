"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  type GeoPermissionStatus,
  type LocationFix,
  hasGrantedLocationBefore,
  loadManualFix,
  rememberLocationGrantedOnce,
  saveManualFix,
} from "./geo";

export interface LocationState {
  geoStatus: GeoPermissionStatus;
  errorMessage: string | null;
  fix: LocationFix | null;
  /** False until the saved manual pick / auto-GPS check has run — avoids flashing "no location". */
  ready: boolean;
  /** Requests the browser's geolocation with two-tier high->low accuracy fallback. */
  requestGeolocation: () => void;
  /** Sets a manually-chosen point (searched place or typed coordinates). Remembered on this device. */
  setManualFix: (next: LocationFix) => void;
  clearFix: () => void;
}

/**
 * One location for the whole Community View. Lives in community/layout.tsx so a location chosen on
 * one page is the same on every other page (previously each page kept its own copy, so a pick on
 * Beranda vanished on navigation). Two-tier GPS: high accuracy with a 6 s timeout, then
 * network/Wi-Fi positioning — common on desktops without GPS hardware.
 */
function useLocationStateInternal(): LocationState {
  const [geoStatus, setGeoStatus] = useState<GeoPermissionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [ready, setReady] = useState(false);
  const didInit = useRef(false);

  const requestGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus("unavailable");
      setErrorMessage("Perangkat atau browser ini tidak mendukung layanan lokasi. Cari nama tempat Anda di bawah.");
      return;
    }

    setGeoStatus("loading");
    setErrorMessage(null);

    const onSuccess = (position: GeolocationPosition) => {
      const next: LocationFix = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        source: "gps",
        accuracyMeters: position.coords.accuracy,
      };
      setFix(next);
      saveManualFix(null); // GPS now wins over an older manual pick.
      setGeoStatus("granted");
      rememberLocationGrantedOnce();
    };

    const fallbackToLowAccuracy = () => {
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            setGeoStatus("denied");
            setErrorMessage("Izin lokasi ditolak di browser. Izinkan akses lokasi, atau cari nama tempat Anda di bawah.");
          } else {
            setGeoStatus("unavailable");
            setErrorMessage(
              error.code === error.TIMEOUT
                ? "Lokasi terlalu lama ditemukan. Cari nama tempat Anda di bawah."
                : "Lokasi tidak bisa ditentukan otomatis (umum di laptop/desktop). Cari nama tempat Anda di bawah."
            );
          }
        },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
      );
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGeoStatus("denied");
          setErrorMessage("Izin lokasi ditolak. Anda tetap bisa mencari nama tempat Anda di bawah.");
          return;
        }
        fallbackToLowAccuracy();
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
    );
  }, []);

  // Restore a saved manual pick, otherwise auto-request GPS only if permission was already given.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    queueMicrotask(() => {
      const saved = loadManualFix();
      if (saved) {
        setFix(saved);
        setReady(true);
        return;
      }
      setReady(true);
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
      if (navigator.permissions?.query) {
        navigator.permissions
          .query({ name: "geolocation" })
          .then((permission) => {
            if (permission.state === "granted" || (permission.state === "prompt" && hasGrantedLocationBefore())) {
              requestGeolocation();
            }
          })
          .catch(() => {
            if (hasGrantedLocationBefore()) requestGeolocation();
          });
      } else if (hasGrantedLocationBefore()) {
        requestGeolocation();
      }
    });
  }, [requestGeolocation]);

  const setManualFix = useCallback((next: LocationFix) => {
    setFix(next);
    saveManualFix(next);
    setErrorMessage(null);
  }, []);

  const clearFix = useCallback(() => {
    setFix(null);
    saveManualFix(null);
  }, []);

  return useMemo(
    () => ({ geoStatus, errorMessage, fix, ready, requestGeolocation, setManualFix, clearFix }),
    [geoStatus, errorMessage, fix, ready, requestGeolocation, setManualFix, clearFix]
  );
}

const LocationContext = createContext<LocationState | null>(null);

export function CommunityLocationProvider({ children }: { children: React.ReactNode }) {
  const value = useLocationStateInternal();
  return createElement(LocationContext.Provider, { value }, children);
}

export function useLocationState(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocationState must be used inside CommunityLocationProvider");
  return ctx;
}
