"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocationState } from "../lib/useLocation";
import { useRegion } from "@/lib/useRegion";
import { formatAdminFull } from "@/lib/adminRegion";
import type { WeatherResponse } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { compassLabel } from "../lib/geo";
import { aqiCategoryLabel } from "../lib/areaStatus";

const BMKG_URL = "https://www.bmkg.go.id/";

// Same fallback reference point used on /community when no real fix exists.
const DEFAULT_LOCATION = { lat: -3.125, lon: 114.15, name: ["Desa Bahaur, Pulang Pisau (contoh)", "Bahaur village, Pulang Pisau (example)"] as const };

const AQI_CATEGORY_STYLE: Record<string, { bg: string; text: string }> = {
  Baik: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800" },
  Sedang: { bg: "bg-amber-50 border-amber-200", text: "text-amber-800" },
  "Tidak sehat (kelompok sensitif)": { bg: "bg-orange-50 border-orange-200", text: "text-orange-800" },
  "Tidak sehat": { bg: "bg-red-50 border-red-200", text: "text-red-800" },
  "Sangat tidak sehat": { bg: "bg-purple-50 border-purple-200", text: "text-purple-800" },
  Berbahaya: { bg: "bg-rose-100 border-rose-300", text: "text-rose-900" },
};

function windDirectionLabel(deg: number | null, language: "id" | "en"): string {
  return deg === null ? "—" : compassLabel(deg, language);
}

export default function UdaraPage() {
  const { tr, language } = useTranslation();
  const { fix } = useLocationState();
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeLat = fix ? fix.lat : DEFAULT_LOCATION.lat;
  const activeLon = fix ? fix.lon : DEFAULT_LOCATION.lon;
  const fixRegion = useRegion(fix?.lat, fix?.lon);
  const locationLabel = fix
    ? fix.label ?? formatAdminFull(fixRegion) ?? `${tr("Koordinat", "Coordinates")} ${fix.lat.toFixed(3)}, ${fix.lon.toFixed(3)}`
    : tr(DEFAULT_LOCATION.name[0], DEFAULT_LOCATION.name[1]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/weather?lat=${activeLat}&lon=${activeLon}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat data cuaca");
        return (await res.json()) as WeatherResponse;
      })
      .then((body) => {
        if (cancelled) return;
        setWeather(body);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeLat, activeLon]);

  const aqiCategory = weather?.airQuality?.usAqiCategory ?? null;
  const aqiStyle = aqiCategory ? AQI_CATEGORY_STYLE[aqiCategory] : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/community" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#123027] hover:text-[var(--community-accent)] transition">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            arrow_back
          </span>
          <span>{tr("Beranda", "Home")}</span>
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-bold text-[#123027]">{tr("Kualitas Udara & Cuaca", "Air Quality & Weather")}</h1>
        <p className="text-xs text-[var(--community-ink-muted)] mt-1">{locationLabel}</p>
      </div>

      {loading && (
        <div className="rounded-2xl border border-[var(--community-border)] bg-white p-6 text-center text-sm text-[var(--community-ink-muted)] animate-pulse">
          {tr("Memuat data cuaca & kualitas udara…", "Loading weather & air-quality data…")}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {tr(
            "Data cuaca & kualitas udara sedang tidak tersedia. Coba lagi beberapa saat lagi.",
            "Weather & air-quality data is unavailable right now. Please try again shortly."
          )}
        </div>
      )}

      {!loading && !error && weather && (
        <>
          <div className={`rounded-2xl border p-5 ${aqiStyle?.bg ?? "bg-gray-50 border-gray-200"}`}>
            {weather.airQuality ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-black ${aqiStyle?.text ?? "text-gray-700"}`}>
                    {weather.airQuality.usAqi}
                  </span>
                  <span className={`text-sm font-bold ${aqiStyle?.text ?? "text-gray-700"}`}>
                    {aqiCategory ? aqiCategoryLabel(aqiCategory, language) : tr("Tidak diketahui", "Unknown")}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--community-ink-muted)] mt-1">
                  {tr(
                    "US AQI (skala kualitas udara AS) — bukan ISPU Indonesia, karena ambang batasnya berbeda.",
                    "US AQI (the US air-quality scale) — not Indonesia's ISPU, because the thresholds differ."
                  )}{" "}
                  PM2.5: {weather.airQuality.pm2_5 ?? "—"} µg/m³ · PM10: {weather.airQuality.pm10 ?? "—"} µg/m³
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">{tr("Data kualitas udara tidak tersedia saat ini.", "Air-quality data isn't available right now.")}</p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--community-border)] bg-white p-5">
            <h2 className="text-sm font-bold text-[#123027] mb-3">{tr("Angin & Cuaca Saat Ini", "Current Wind & Weather")}</h2>
            {weather.wind ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[11px] text-[var(--community-ink-muted)] block">{tr("Kecepatan angin", "Wind speed")}</span>
                  <span className="font-bold text-[#123027]">{weather.wind.windSpeedKmh} {tr("km/j", "km/h")}</span>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--community-ink-muted)] block">{tr("Arah angin (dari)", "Wind from")}</span>
                  <span className="font-bold text-[#123027]">{windDirectionLabel(weather.wind.windDirectionDeg, language)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--community-ink-muted)] block">{tr("Suhu", "Temperature")}</span>
                  <span className="font-bold text-[#123027]">{weather.wind.temperatureC}°C</span>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--community-ink-muted)] block">{tr("Kelembapan", "Humidity")}</span>
                  <span className="font-bold text-[#123027]">{weather.wind.relativeHumidityPct}%</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">{tr("Data cuaca tidak tersedia saat ini.", "Weather data isn't available right now.")}</p>
            )}
          </div>

          {weather.errors.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {tr("Sebagian data tidak dapat dimuat", "Some data couldn't be loaded")}: {weather.errors.join("; ")}
            </div>
          )}

          <p className="text-[11px] text-[var(--community-ink-muted)] leading-relaxed">
            {tr("Sumber", "Source")}: {weather.source}
            {tr(
              ", bukan data resmi BMKG — untuk informasi cuaca & kualitas udara resmi Indonesia, kunjungi",
              ", not official BMKG data — for Indonesia's official weather & air-quality information, visit"
            )}{" "}
            <a href={BMKG_URL} target="_blank" rel="noopener noreferrer" className="underline">
              bmkg.go.id
            </a>
            . {tr("Angka ini bukan prediksi arah sebaran asap kebakaran.", "These numbers are not a forecast of where fire smoke will spread.")}
          </p>
        </>
      )}

      <Link
        href="/community/edukasi/asap"
        className="block rounded-2xl border border-[var(--community-border)] bg-white p-4 hover:border-emerald-300 transition"
      >
        <span className="text-xs font-bold text-[var(--community-accent)]">
          {tr("Lindungi keluarga dari asap — baca panduan →", "Protect your family from smoke — read the guide →")}
        </span>
      </Link>
    </div>
  );
}
