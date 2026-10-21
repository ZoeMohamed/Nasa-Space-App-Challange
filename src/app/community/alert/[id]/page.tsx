"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocationState } from "../../lib/useLocation";
import { bearingDeg, compassLabel, formatDistanceKm, haversineKm, isUpwind } from "../../lib/geo";
import { formatAdminFull } from "@/lib/adminRegion";
import type { HotspotApiResponse, HotspotMarker, WeatherResponse } from "@/types";
import { useTranslation, type Language } from "@/lib/i18n/LanguageContext";

const CALM_WIND_KMH = 2;

const MATCH_LABEL: Record<string, readonly [string, string]> = {
  MATCHED: ["Terdeteksi MODIS + VIIRS", "Seen by MODIS + VIIRS"],
  MODIS_ONLY: ["Hanya MODIS", "MODIS only"],
  VIIRS_ONLY: ["Hanya VIIRS", "VIIRS only"],
  UNMATCHED: ["Satu sensor", "Single sensor"],
};

const TIER_LABEL: Record<string, readonly [string, string]> = {
  high: ["Tinggi", "High"],
  nominal: ["Sedang", "Nominal"],
  low: ["Rendah", "Low"],
};

const SMOKE_TIPS: readonly (readonly [string, string])[] = [
  ["Gunakan respirator N95 yang pas di wajah saat keluar rumah", "Wear a well-fitting N95 respirator when going outside"],
  ["Tutup jendela dan ventilasi rumah", "Close windows and vents at home"],
  ["Siapkan tas siaga: dokumen, obat, air minum", "Prepare a go-bag: documents, medicine, drinking water"],
];

function formatAcquired(iso: string | undefined, language: Language) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  const en = language === "en";
  const relative =
    minutes < 60
      ? `${Math.max(minutes, 1)} ${en ? "min ago" : "menit lalu"}`
      : minutes < 1440
        ? `${Math.round(minutes / 60)} ${en ? "h ago" : "jam lalu"}`
        : `${Math.round(minutes / 1440)} ${en ? "d ago" : "hari lalu"}`;
  return {
    absolute: `${date.toLocaleString(en ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`,
    relative,
  };
}

/** Every value on this page comes from the hotspot record, the user's own location, or Open-Meteo. */
export default function AlertDetailPage() {
  const { tr, language } = useTranslation();
  const params = useParams<{ id: string }>();
  const { fix, ready } = useLocationState();

  const [state, setState] = useState<"loading" | "found" | "missing" | "error">("loading");
  const [marker, setMarker] = useState<HotspotMarker | null>(null);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotspots?markerId=${encodeURIComponent(params.id)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat data titik panas.");
        return (await res.json()) as HotspotApiResponse;
      })
      .then((body) => {
        if (cancelled) return;
        const found = body.markers.find((m) => m.id === params.id) ?? null;
        setMarker(found);
        setState(found ? "found" : "missing");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  useEffect(() => {
    if (!fix) return;
    let cancelled = false;
    fetch(`/api/weather?lat=${fix.lat}&lon=${fix.lon}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<WeatherResponse>) : null))
      .then((body) => {
        if (!cancelled) setWeather(body);
      })
      .catch(() => {
        /* wind section shows "not available" */
      });
    return () => {
      cancelled = true;
    };
  }, [fix]);

  const user = fix ? { lat: fix.lat, lon: fix.lon } : null;
  const point = marker ? { lat: marker.lat, lon: marker.lng } : null;
  const distanceKm = user && point ? haversineKm(user, point) : null;
  const bearing = user && point ? bearingDeg(user, point) : null;
  const windFrom = weather?.wind?.windDirectionDeg ?? null;
  const windSpeed = weather?.wind?.windSpeedKmh ?? null;
  const windUsable = windFrom !== null && windSpeed !== null && windSpeed >= CALM_WIND_KMH;
  const upwind = windUsable && user && point ? isUpwind(user, point, windFrom as number) : false;
  const acquired = formatAcquired(marker?.acquiredAt, language);
  const compass = (deg: number) => compassLabel(deg, language);
  const place = marker ? formatAdminFull(marker.admin) : null;

  const handleShare = async () => {
    if (!marker) return;
    const text = [
      tr(`Titik panas satelit${place ? ` di ${place}` : ""}`, `Satellite hotspot${place ? ` in ${place}` : ""}`),
      distanceKm !== null && bearing !== null
        ? tr(
            `${formatDistanceKm(distanceKm)} ke arah ${compass(bearing)} dari lokasi saya`,
            `${formatDistanceKm(distanceKm)} to the ${compass(bearing)} of me`
          )
        : null,
      acquired ? tr(`terdeteksi ${acquired.absolute}`, `detected ${acquired.absolute}`) : null,
    ]
      .filter(Boolean)
      .join(", ");
    const shareText = tr(
      `${text}. Ini indikasi satelit, belum konfirmasi kebakaran. Info di AGNIBHŪMĪ.`,
      `${text}. This is a satellite indication, not a confirmed fire. More on AGNIBHŪMĪ.`
    );
    if (navigator.share) {
      try {
        await navigator.share({ title: tr("Titik panas · AGNIBHŪMĪ", "Hotspot · AGNIBHŪMĪ"), text: shareText, url: window.location.href });
      } catch {
        /* user cancelled */
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareText} ${window.location.href}`);
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2500);
    }
  };

  return (
    <div className="max-w-xl md:max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href="/community"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#123027] hover:text-[var(--community-accent)] py-1 pr-2 transition"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          {tr("Detail titik panas", "Hotspot details")}
        </Link>
        {state === "found" && (
          <button
            type="button"
            onClick={handleShare}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white border border-[var(--community-border)] text-[#123027] hover:bg-emerald-50 transition"
            aria-label={shareSuccess ? tr("Tautan disalin", "Link copied") : tr("Bagikan ke keluarga", "Share with family")}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{shareSuccess ? "check" : "share"}</span>
          </button>
        )}
      </div>

      {state === "loading" && (
        <p className="py-12 text-center text-sm font-semibold text-[var(--community-ink-muted)] animate-pulse">{tr("Memuat detail titik panas…", "Loading hotspot details…")}</p>
      )}

      {(state === "missing" || state === "error") && (
        <div className="rounded-2xl border border-dashed border-[var(--community-border)] bg-white p-6 text-center space-y-3">
          <span className="material-symbols-outlined text-[32px] text-[var(--community-ink-muted)]">location_off</span>
          <p className="text-sm text-[#123027] font-semibold">
            {state === "missing"
              ? tr("Titik ini sudah tidak ada di data 24 jam terakhir.", "This point is no longer in the last 24 hours of data.")
              : tr("Data titik panas sedang tidak bisa dimuat.", "Hotspot data can't be loaded right now.")}
          </p>
          <p className="text-xs text-[var(--community-ink-muted)]">
            {state === "missing"
              ? tr(
                  "Deteksi satelit diperbarui terus; titik yang lebih lama dari 24 jam tidak lagi ditampilkan.",
                  "Satellite detections update continuously; points older than 24 hours are no longer shown."
                )
              : tr("Coba lagi beberapa saat lagi.", "Please try again shortly.")}
          </p>
          <Link href="/community" className="inline-block text-xs font-bold text-[var(--community-accent)] hover:underline">
            {tr("Kembali ke Beranda", "Back to Home")}
          </Link>
        </div>
      )}

      {state === "found" && marker && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold px-3 py-1 rounded-full">
              <span className="material-symbols-outlined text-[14px]">satellite_alt</span>
              {tr("Deteksi satelit · belum dikonfirmasi lapangan", "Satellite detection · not confirmed on the ground")}
            </span>
            <span className="inline-flex items-center bg-white border border-[var(--community-border)] text-[#123027] text-[11px] font-bold px-3 py-1 rounded-full">
              {tr(...(MATCH_LABEL[marker.matchStatus ?? "UNMATCHED"] ?? MATCH_LABEL.UNMATCHED))}
            </span>
            {upwind && (
              <span className="inline-flex items-center gap-1 bg-sky-50 border border-sky-200 text-sky-800 text-[11px] font-bold px-3 py-1 rounded-full">
                <span className="material-symbols-outlined text-[14px]">air</span>
                {tr("Searah angin ke lokasimu", "Upwind of you")}
              </span>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-black text-[#123027] tracking-tight">
              {distanceKm !== null && bearing !== null
                ? tr(
                    `Titik panas ${formatDistanceKm(distanceKm)} ke arah ${compass(bearing)}`,
                    `Hotspot ${formatDistanceKm(distanceKm)} to the ${compass(bearing)}`
                  )
                : tr("Titik panas satelit", "Satellite hotspot")}
            </h1>
            <p className="text-sm text-[var(--community-ink-muted)] mt-1 font-medium">
              {place ?? `${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}`}
            </p>
            {acquired && (
              <p className="text-xs text-[var(--community-ink-muted)] mt-0.5">
                {tr("Terdeteksi", "Detected")} {acquired.absolute} ({acquired.relative})
              </p>
            )}
            {ready && !fix && (
              <p className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {tr("Atur lokasimu di", "Set your location on")}{" "}
                <Link href="/community" className="font-bold underline">
                  {tr("Beranda", "Home")}
                </Link>{" "}
                {tr("untuk melihat jarak, arah, dan pengaruh angin.", "to see distance, direction, and wind effect.")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {[
              [tr("Jarak", "Distance"), distanceKm !== null ? formatDistanceKm(distanceKm) : "-"],
              [tr("Arah dari lokasimu", "Direction from you"), bearing !== null ? compass(bearing) : "-"],
              [
                tr("Keyakinan", "Confidence"),
                marker.confidenceTier && TIER_LABEL[marker.confidenceTier]
                  ? `${tr(...TIER_LABEL[marker.confidenceTier])} (${marker.confidenceLabel ?? "-"})`
                  : (marker.confidenceLabel ?? "-"),
              ],
              [tr("Intensitas panas (FRP)", "Heat intensity (FRP)"), `${marker.frp.toFixed(1)} MW`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-[var(--community-border)] bg-white p-3 text-center">
                <span className="text-[10px] font-semibold text-[var(--community-ink-muted)]">{label}</span>
                <div className="text-sm font-black text-[#123027] mt-0.5">{value}</div>
              </div>
            ))}
          </div>

          {fix && (
            <div className={`rounded-2xl border p-3.5 flex items-start gap-3 ${upwind ? "border-sky-200 bg-sky-50/80" : "border-[var(--community-border)] bg-white"}`}>
              <span className="material-symbols-outlined text-[20px] text-sky-700 shrink-0 mt-0.5">air</span>
              <p className="text-xs text-[#123027] leading-relaxed">
                {windFrom === null || windSpeed === null
                  ? tr("Data angin di lokasimu belum tersedia.", "Wind data for your location isn't available yet.")
                  : windSpeed < CALM_WIND_KMH
                    ? tr(
                        `Angin di lokasimu hampir tenang (${windSpeed.toFixed(1)} km/jam), jadi arah asap tidak bisa diperkirakan.`,
                        `Wind at your location is almost calm (${windSpeed.toFixed(1)} km/h), so smoke direction can't be estimated.`
                      )
                    : `${tr(
                        `Angin di lokasimu bertiup dari ${compass(windFrom)} (${windSpeed.toFixed(0)} km/jam).`,
                        `Wind at your location is blowing from the ${compass(windFrom)} (${windSpeed.toFixed(0)} km/h).`
                      )} ${
                        upwind
                          ? tr(
                              "Titik ini ada di arah datangnya angin. Asapnya bisa terbawa ke lokasimu.",
                              "This point is on the side the wind comes from. Its smoke may drift to you."
                            )
                          : tr("Titik ini tidak berada di arah datangnya angin saat ini.", "This point is not on the side the wind is coming from right now.")
                      }`}
                <span className="block mt-1 text-[11px] text-[var(--community-ink-muted)]">
                  {tr(
                    "Perkiraan kasar dari angin saat ini di satu titik (Open-Meteo), bukan model sebaran asap.",
                    "A rough estimate from the current wind at one point (Open-Meteo), not a smoke-dispersion model."
                  )}
                </span>
              </p>
            </div>
          )}

          <section className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--community-ink-muted)]">{tr("Jika ada asap di sekitarmu", "If there's smoke around you")}</h2>
            <ul className="space-y-2.5 text-xs text-[#123027] font-medium">
              {SMOKE_TIPS.map((item) => (
                <li key={item[0]} className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[12px] font-bold">✓</span>
                  {tr(...item)}
                </li>
              ))}
              <li className="flex items-start gap-2.5 text-rose-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-800 text-[12px] font-bold">!</span>
                {tr("Jangan mendekat atau memadamkan api besar sendiri", "Don't approach or try to put out a large fire yourself")}
              </li>
            </ul>
            <Link href="/community/edukasi/asap" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--community-accent)] hover:underline">
              {tr("Panduan lengkap melindungi keluarga dari asap", "Full guide to protecting your family from smoke")}
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </section>

          <div className="rounded-2xl border border-[var(--community-border)] bg-white p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <span className="material-symbols-outlined text-[18px]">phone_in_talk</span>
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#123027]">{tr("Darurat 112", "Emergency 112")}</div>
                <div className="text-[10px] text-[var(--community-ink-muted)]">{tr("Nomor panggilan darurat nasional", "Indonesia's national emergency number")}</div>
              </div>
            </div>
            <a href="tel:112" className="shrink-0 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition">
              {tr("Telepon", "Call")}
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Link
              href={`/community/report?lat=${marker.lat}&lon=${marker.lng}&source=manual-coords`}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#0c2e22] hover:bg-[#071f16] py-3.5 text-xs md:text-sm font-bold text-white transition"
            >
              <span className="material-symbols-outlined text-[18px]">photo_camera</span>
              {tr("Saya melihat api / asap. Lapor", "I see fire / smoke. Report")}
            </Link>
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--community-border)] bg-white hover:bg-gray-50 py-3 text-xs md:text-sm font-bold text-[#123027] transition"
            >
              <span className="material-symbols-outlined text-[18px]">share</span>
              {shareSuccess ? tr("Tautan disalin", "Link copied") : tr("Bagikan ke keluarga", "Share with family")}
            </button>
          </div>

          <p className="text-[11px] text-[var(--community-ink-muted)] text-center leading-relaxed pt-1">
            {tr("Sumber", "Source")}: NASA FIRMS. {marker.sensor ?? tr("satelit", "satellite")}
            {marker.satellite && marker.satellite !== "nan" ? ` (${marker.satellite})` : ""}
            {acquired ? `, ${acquired.absolute}` : ""}.{" "}
            {tr(
              "Deteksi satelit menandai anomali panas, bukan konfirmasi kebakaran; kondisi lapangan bisa berbeda.",
              "Satellite detections mark heat anomalies, not confirmed fires; conditions on the ground may differ."
            )}
          </p>
        </div>
      )}
    </div>
  );
}
