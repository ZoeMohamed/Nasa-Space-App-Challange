"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocationState } from "../../lib/useLocation";
import { haversineKm, formatDistanceKm } from "../../lib/geo";
import { articleText, EDU_ARTICLES } from "../articles";
import type { HotspotApiResponse, HotspotMarker } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const WHO_URL = "https://www.who.int/news-room/fact-sheets/detail/wildfires-and-health";
const BMKG_URL = "https://www.bmkg.go.id/";
const NEARBY_RADIUS_KM = 25;

// Default reference point used only to compute a nearby-detection note when
// the user hasn't shared their location — mirrors the fallback used on
// /community (Desa Bahaur, Pulang Pisau), never presented as the user's
// actual location.
const DEFAULT_LOCATION = { lat: -3.125, lon: 114.15 };

interface ResourceCategory {
  id: string;
  title: readonly [string, string];
  description: readonly [string, string];
}

const UNVERIFIED_CATEGORIES: ResourceCategory[] = [
  {
    id: "kontak",
    title: ["Kontak darurat setempat", "Local emergency contacts"],
    description: [
      "Nomor telepon posko/aparat desa, puskesmas, dan pemadam kebakaran setempat.",
      "Phone numbers for the local command post/village officials, health centre, and fire service.",
    ],
  },
  {
    id: "shelter",
    title: ["Lokasi pengungsian", "Evacuation shelters"],
    description: ["Titik pengungsian resmi terdekat beserta status keterisian.", "The nearest official shelters and how full they are."],
  },
  {
    id: "kesehatan",
    title: ["Fasilitas kesehatan", "Health facilities"],
    description: ["Puskesmas/klinik terdekat dan jam operasionalnya.", "The nearest health centres/clinics and their opening hours."],
  },
];

export default function SekitarPage() {
  const { tr, language } = useTranslation();
  const location = useLocationState();
  const { fix } = location;

  const [markers, setMarkers] = useState<HotspotMarker[] | null>(null);

  const activeLat = fix ? fix.lat : DEFAULT_LOCATION.lat;
  const activeLon = fix ? fix.lon : DEFAULT_LOCATION.lon;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotspots?nearLat=${activeLat}&nearLon=${activeLon}&nearKm=${NEARBY_RADIUS_KM}&limit=5000`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat titik panas");
        return (await res.json()) as HotspotApiResponse;
      })
      .then((body) => {
        if (!cancelled) setMarkers(body.markers);
      })
      .catch(() => {
        if (!cancelled) setMarkers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeLat, activeLon]);

  const nearbyCount = useMemo(() => {
    if (!markers) return null;
    return markers.filter(
      (m) => haversineKm({ lat: activeLat, lon: activeLon }, { lat: m.lat, lon: m.lng }) <= NEARBY_RADIUS_KM
    ).length;
  }, [markers, activeLat, activeLon]);

  const nearestDistance = useMemo(() => {
    if (!markers || markers.length === 0) return null;
    return Math.min(
      ...markers.map((m) => haversineKm({ lat: activeLat, lon: activeLon }, { lat: m.lat, lon: m.lng }))
    );
  }, [markers, activeLat, activeLon]);

  return (
    <div className="space-y-6">
      <Link href="/community/edukasi" className="text-xs font-semibold text-[var(--community-ink-muted)]">
        ← {tr("Kembali ke Edukasi", "Back to Learn")}
      </Link>

      <section>
        <h1 className="text-lg font-extrabold text-[#123027]">{tr("Bantuan di Sekitarku", "Help Near Me")}</h1>
        <p className="text-sm text-[var(--community-ink-muted)] mt-1 leading-relaxed">
          {tr(
            "Sumber daya lokal untuk kesiapsiagaan — menggunakan lokasi Anda (opsional) hanya untuk memberi konteks jarak dari deteksi satelit.",
            "Local preparedness resources — your location (optional) is only used to give distance context from satellite detections."
          )}
        </p>
      </section>

      {/* Optional location context, graceful if denied */}
      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-2">
        <p className="text-xs font-semibold text-[#123027]">
          {fix
            ? tr("Lokasi Anda sudah digunakan untuk konteks jarak di bawah.", "Your location is used for the distance context below.")
            : tr(
                "Bagikan lokasi untuk konteks jarak yang lebih akurat (opsional). Tanpa lokasi, jarak di bawah dihitung dari titik contoh di Pulang Pisau.",
                "Share your location for more accurate distance context (optional). Without it, distances below are from an example point in Pulang Pisau."
              )}
        </p>
        {!fix && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={location.requestGeolocation}
              className="text-xs font-bold text-white bg-[var(--community-accent)] px-3 py-1.5 rounded-full"
            >
              {tr("Gunakan lokasi GPS", "Use GPS location")}
            </button>
            <span className="text-[11px] text-[var(--community-ink-muted)] self-center">
              {tr("atau lewati — halaman ini tetap bisa digunakan tanpa lokasi.", "or skip — this page still works without a location.")}
            </span>
          </div>
        )}
        {location.errorMessage && (
          <p className="text-[11px] text-amber-700">{location.errorMessage}</p>
        )}
      </div>

      {/* Satellite detection note */}
      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-1.5">
        {markers === null ? (
          <p className="text-xs text-[var(--community-ink-muted)]">{tr("Memuat data deteksi satelit…", "Loading satellite detections…")}</p>
        ) : nearbyCount === null || nearbyCount === 0 ? (
          <p className="text-xs text-[var(--community-ink-muted)]">
            {fix
              ? tr(`Tidak ada deteksi satelit dalam radius ${NEARBY_RADIUS_KM} km dari lokasi Anda saat ini.`, `No satellite detections within ${NEARBY_RADIUS_KM} km of you right now.`)
              : tr(`Tidak ada deteksi satelit dalam radius ${NEARBY_RADIUS_KM} km dari titik contoh saat ini.`, `No satellite detections within ${NEARBY_RADIUS_KM} km of the example point right now.`)}
          </p>
        ) : (
          <p className="text-xs font-semibold text-[#123027]">
            {tr(
              `${nearbyCount} deteksi satelit dalam ${NEARBY_RADIUS_KM} km${nearestDistance !== null ? ` (terdekat ${formatDistanceKm(nearestDistance)})` : ""}.`,
              `${nearbyCount} satellite detections within ${NEARBY_RADIUS_KM} km${nearestDistance !== null ? ` (nearest ${formatDistanceKm(nearestDistance)})` : ""}.`
            )}
          </p>
        )}
        <p className="text-[11px] text-amber-700 leading-relaxed">
          {tr("Deteksi MODIS/VIIRS menunjukkan anomali panas, bukan konfirmasi kebakaran aktif.", "MODIS/VIIRS detections show heat anomalies, not confirmed active fires.")}
        </p>
      </div>

      {/* Community reporting channel — the one real, available resource */}
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
        <p className="text-xs font-bold text-emerald-900">{tr("Jalur pelaporan warga", "Citizen reporting channel")}</p>
        <p className="text-[11px] text-emerald-900/80 leading-relaxed">
          {tr(
            "Satu-satunya kanal yang tersedia dan berfungsi di aplikasi ini: kirim laporan langsung dari lokasi kejadian untuk membantu verifikasi deteksi satelit.",
            "The one channel that's available and working in this app: send a report straight from the incident location to help verify satellite detections."
          )}
        </p>
        <Link
          href="/community/report"
          className="inline-block rounded-xl bg-emerald-800 text-white text-xs font-bold px-4 py-2"
        >
          {tr("Buka Lapor Kebakaran", "Open Fire Report")}
        </Link>
      </section>

      {/* Unverified local resource categories */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-[#123027]">{tr("Sumber daya lokal", "Local resources")}</h2>
        {UNVERIFIED_CATEGORIES.map((cat) => (
          <div key={cat.id} className="rounded-xl border border-[var(--community-border)] bg-white p-3.5">
            <p className="text-xs font-semibold text-[#123027]">{tr(...cat.title)}</p>
            <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5 leading-relaxed">{tr(...cat.description)}</p>
            <p className="text-[11px] font-semibold text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 inline-block">
              {tr("Belum terverifikasi — data resmi belum tersedia", "Not verified — official data not available yet")}
            </p>
          </div>
        ))}
      </section>

      {/* Official external sources */}
      <section className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-2">
        <h2 className="text-sm font-bold text-[#123027]">{tr("Sumber resmi", "Official sources")}</h2>
        <p className="text-[11px] text-[var(--community-ink-muted)] leading-relaxed">
          {tr("Untuk informasi cuaca dan kualitas udara resmi, rujuk BMKG:", "For official weather and air-quality information, see BMKG:")}{" "}
          <a href={BMKG_URL} target="_blank" rel="noreferrer" className="text-[var(--community-accent)] underline">
            {BMKG_URL}
          </a>
        </p>
        <p className="text-[11px] text-[var(--community-ink-muted)] leading-relaxed">
          {tr("Untuk panduan kesehatan terkait asap kebakaran hutan, rujuk lembar fakta WHO:", "For health guidance on wildfire smoke, see the WHO fact sheet:")}{" "}
          <a href={WHO_URL} target="_blank" rel="noreferrer" className="text-[var(--community-accent)] underline">
            {WHO_URL}
          </a>
        </p>
      </section>

      {/* Supplementary article list kept from the old structure */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-[#123027]">{tr("Baca lebih lanjut", "Read more")}</h2>
        <ul className="space-y-2">
          {EDU_ARTICLES.map((article) => (
            <li key={article.slug}>
              <Link
                href={`/community/edukasi/${article.slug}`}
                className="block rounded-xl border border-[var(--community-border)] bg-white p-3 flex items-start gap-3"
              >
                <span className="material-symbols-outlined text-[var(--community-accent)] mt-0.5">
                  {article.icon}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{articleText(article, language).title}</span>
                  <span className="block text-[11px] text-[var(--community-ink-muted)] mt-0.5">
                    {articleText(article, language).summary}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
