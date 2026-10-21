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
import { useTranslation, pick } from "@/lib/i18n/LanguageContext";

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
const LOCATION_ERRORS = {
  unsupported: [
    "Perangkat atau browser ini tidak mendukung layanan lokasi. Cari nama tempat Anda di bawah.",
    "This device or browser doesn't support location services. Search for your place below.",
  ],
  deniedBrowser: [
    "Izin lokasi ditolak di browser. Izinkan akses lokasi, atau cari nama tempat Anda di bawah.",
    "Location permission was denied in the browser. Allow location access, or search for your place below.",
  ],
  timeout: [
    "Lokasi terlalu lama ditemukan. Cari nama tempat Anda di bawah.",
    "Finding your location took too long. Search for your place below.",
  ],
  unavailable: [
    "Lokasi tidak bisa ditentukan otomatis (umum di laptop/desktop). Cari nama tempat Anda di bawah.",
    "Your location couldn't be found automatically (common on laptops/desktops). Search for your place below.",
  ],
  denied: [
    "Izin lokasi ditolak. Anda tetap bisa mencari nama tempat Anda di bawah.",
    "Location permission was denied. You can still search for your place below.",
  ],
} as const;

type LocationErrorKey = keyof typeof LOCATION_ERRORS;

function useLocationStateInternal(): LocationState {
  const { language } = useTranslation();
  const [geoStatus, setGeoStatus] = useState<GeoPermissionStatus>("idle");
  // Stored as a key so the message follows the language toggle after the error happened.
  const [errorKey, setErrorMessage] = useState<LocationErrorKey | null>(null);
  const errorMessage = errorKey ? pick(language, LOCATION_ERRORS[errorKey][0], LOCATION_ERRORS[errorKey][1]) : null;
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [ready, setReady] = useState(false);
  const didInit = useRef(false);

  const requestGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus("unavailable");
      setErrorMessage("unsupported");
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
            setErrorMessage("deniedBrowser");
          } else {
            setGeoStatus("unavailable");
            setErrorMessage(error.code === error.TIMEOUT ? "timeout" : "unavailable");
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
          setErrorMessage("denied");
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
