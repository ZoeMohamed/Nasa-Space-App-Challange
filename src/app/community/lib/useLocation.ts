"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GeoPermissionStatus,
  type LocationFix,
  hasGrantedLocationBefore,
  rememberLocationGrantedOnce,
} from "./geo";

export interface LocationState {
  geoStatus: GeoPermissionStatus;
  errorMessage: string | null;
  fix: LocationFix | null;
  /** Requests the browser's geolocation with two-tier high->low accuracy fallback. */
  requestGeolocation: () => void;
  /** Sets a manually-chosen point (typed coordinates or a known-area pick). */
  setManualFix: (next: LocationFix) => void;
  clearFix: () => void;
}

/**
 * Shared geolocation state machine for the Community View.
 * Uses a two-tier strategy: attempts high-accuracy GPS with a 5s timeout,
 * and if that fails or times out (common on macOS / desktop browsers lacking GPS hardware),
 * immediately falls back to network/Wi-Fi positioning (enableHighAccuracy: false).
 */
export function useLocationState(): LocationState {
  const [geoStatus, setGeoStatus] = useState<GeoPermissionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const isAutoChecking = useRef(false);

  const requestGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus("unavailable");
      setErrorMessage("Perangkat atau browser ini tidak mendukung layanan lokasi.");
      return;
    }

    setGeoStatus("loading");
    setErrorMessage(null);

    // Fallback: standard network/Wi-Fi geolocation
    const fallbackToLowAccuracy = () => {
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
            setErrorMessage("Izin lokasi ditolak di browser. Silakan izinkan akses lokasi di pengaturan browser atau pilih manual.");
          } else if (error.code === error.TIMEOUT) {
            setGeoStatus("unavailable");
            setErrorMessage("Permintaan lokasi memakan waktu terlalu lama. Pastikan koneksi atau pilih lokasi manual.");
          } else {
            setGeoStatus("unavailable");
            setErrorMessage("Lokasi tidak dapat ditentukan otomatis. Silakan pilih lokasi secara manual.");
          }
        },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
      );
    };

    // Primary attempt: high-accuracy GPS (fast timeout 6s)
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
        // If explicitly denied by user, do not fallback
        if (error.code === error.PERMISSION_DENIED) {
          setGeoStatus("denied");
          setErrorMessage("Izin lokasi ditolak. Anda tetap bisa memilih lokasi secara manual di bawah.");
          return;
        }
        // If POSITION_UNAVAILABLE or TIMEOUT, immediately fallback to low accuracy
        fallbackToLowAccuracy();
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
    );
  }, []);

  // Check if permission was already granted previously or in browser permissions
  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator) || isAutoChecking.current) return;
    isAutoChecking.current = true;

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((permission) => {
          if (permission.state === "granted" || (permission.state === "prompt" && hasGrantedLocationBefore())) {
            requestGeolocation();
          }
        })
        .catch(() => {
          if (hasGrantedLocationBefore()) {
            requestGeolocation();
          }
        });
    } else if (hasGrantedLocationBefore()) {
      queueMicrotask(() => requestGeolocation());
    }
  }, [requestGeolocation]);

  const setManualFix = useCallback((next: LocationFix) => {
    setFix(next);
    setErrorMessage(null);
  }, []);

  const clearFix = useCallback(() => {
    setFix(null);
  }, []);

  return { geoStatus, errorMessage, fix, requestGeolocation, setManualFix, clearFix };
}

