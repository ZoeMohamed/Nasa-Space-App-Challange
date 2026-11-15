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
import Icon from "@/components/community/Icon";

const BMKG_URL = "https://www.bmkg.go.id/";

const AQI_CATEGORY_STYLE: Record<string, { bg: string; text: string }> = {
  Baik: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800" },
  Sedang: { bg: "bg-amber-50 border-amber-200", text: "text-amber-800" },
  "Tidak sehat (kelompok sensitif)": { bg: "bg-orange-50 border-orange-200", text: "text-orange-800" },
  "Tidak sehat": { bg: "bg-red-50 border-red-200", text: "text-red-800" },
  "Sangat tidak sehat": { bg: "bg-purple-50 border-purple-200", text: "text-purple-800" },
  Berbahaya: { bg: "bg-rose-100 border-rose-300", text: "text-rose-900" },
};

function windDirectionLabel(deg: number | null, language: "id" | "en"): string {
  return deg === null ? "-" : compassLabel(deg, language);
}

export default function UdaraPage() {
  const { tr, language } = useTranslation();
  const location = useLocationState();
  const { fix } = location;
  const locationKey = fix ? `${fix.lat},${fix.lon}` : null;
  const [request, setRequest] = useState<{ key: string; weather: WeatherResponse | null; error: string | null } | null>(null);
  const weather = request?.key === locationKey ? request.weather : null;
  const error = request?.key === locationKey ? request.error : null;
  const loading = locationKey !== null && request?.key !== locationKey;
  const fixRegion = useRegion(fix?.lat, fix?.lon);
  const locationLabel = fix
    ? fix.label ?? formatAdminFull(fixRegion) ?? `${tr("Koordinat", "Coordinates")} ${fix.lat.toFixed(3)}, ${fix.lon.toFixed(3)}`
    : tr("Lokasi belum dipilih", "No location selected");

  useEffect(() => {
    if (!fix || !locationKey) return;
    let cancelled = false;
    fetch(`/api/weather?lat=${fix.lat}&lon=${fix.lon}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat data cuaca");
        return (await res.json()) as WeatherResponse;
      })
      .then((body) => {
        if (cancelled) return;
        setRequest({ key: locationKey, weather: body, error: null });
      })
      .catch(() => {
        if (cancelled) return;
        setRequest({ key: locationKey, weather: null, error: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [fix, locationKey]);

  const aqiCategory = weather?.airQuality?.usAqiCategory ?? null;
  const aqiStyle = aqiCategory ? AQI_CATEGORY_STYLE[aqiCategory] : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/community" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 hover:text-[var(--community-accent)] transition">
          <Icon name="arrow_back" className="h-[18px] w-[18px] shrink-0" />
          <span>{tr("Peta", "Map")}</span>
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-bold text-slate-900">{tr("Kualitas Udara & Cuaca", "Air Quality & Weather")}</h1>
        <p className="text-xs text-[var(--community-ink-muted)] mt-1">{locationLabel}</p>
      </div>

      {!fix && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-950">
            {tr("Pilih lokasi agar data cuaca dan kualitas udara dihitung untuk tempat yang benar.", "Choose a location so weather and air quality are calculated for the correct place.")}
          </p>
          <button
            type="button"
            onClick={location.requestGeolocation}
            className="mt-3 rounded-xl bg-[var(--community-accent)] px-4 py-2 text-xs font-bold text-white"
          >
            {tr("Gunakan lokasi GPS", "Use GPS location")}
          </button>
          {location.errorMessage && <p className="mt-2 text-xs text-amber-800">{location.errorMessage}</p>}
        </div>
      )}

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
                    "US AQI (skala kualitas udara AS). Bukan ISPU Indonesia, karena ambang batasnya berbeda.",
                    "US AQI (the US air-quality scale). Not Indonesia's ISPU, because the thresholds differ."
                  )}{" "}
                  PM2.5: {weather.airQuality.pm2_5 ?? "-"} µg/m³ · PM10: {weather.airQuality.pm10 ?? "-"} µg/m³
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">{tr("Data kualitas udara tidak tersedia saat ini.", "Air-quality data isn't available right now.")}</p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--community-border)] bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">{tr("Angin & Cuaca Saat Ini", "Current Wind & Weather")}</h2>
            {weather.wind ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[11px] text-[var(--community-ink-muted)] block">{tr("Kecepatan angin", "Wind speed")}</span>
                  <span className="font-bold text-slate-900">{weather.wind.windSpeedKmh} {tr("km/j", "km/h")}</span>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--community-ink-muted)] block">{tr("Arah angin (dari)", "Wind from")}</span>
                  <span className="font-bold text-slate-900">{windDirectionLabel(weather.wind.windDirectionDeg, language)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--community-ink-muted)] block">{tr("Suhu", "Temperature")}</span>
                  <span className="font-bold text-slate-900">{weather.wind.temperatureC}°C</span>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--community-ink-muted)] block">{tr("Kelembapan", "Humidity")}</span>
                  <span className="font-bold text-slate-900">{weather.wind.relativeHumidityPct}%</span>
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
              ", bukan data resmi BMKG. Untuk informasi cuaca & kualitas udara resmi Indonesia, kunjungi",
              ", not official BMKG data. For Indonesia's official weather & air-quality information, visit"
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
          {tr("Lindungi keluarga dari asap. Baca panduan →", "Protect your family from smoke. Read the guide →")}
        </span>
      </Link>
    </div>
  );
}
