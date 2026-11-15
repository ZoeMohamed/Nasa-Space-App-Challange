"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocationState } from "../../lib/useLocation";
import { haversineKm, formatDistanceKm } from "../../lib/geo";
import { articleText, EDU_ARTICLES } from "../articles";
import type { HotspotApiResponse, HotspotMarker } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import Icon from "@/components/community/Icon";

const WHO_URL = "https://www.who.int/news-room/fact-sheets/detail/wildfires-and-health";
const BMKG_URL = "https://www.bmkg.go.id/";
const NEARBY_RADIUS_KM = 25;

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

  const locationKey = fix ? `${fix.lat},${fix.lon}` : null;
  const [markerState, setMarkerState] = useState<{ key: string; markers: HotspotMarker[] } | null>(null);
  const markers = markerState?.key === locationKey ? markerState.markers : null;

  useEffect(() => {
    if (!fix || !locationKey) return;
    let cancelled = false;
    fetch(`/api/hotspots?nearLat=${fix.lat}&nearLon=${fix.lon}&nearKm=${NEARBY_RADIUS_KM}&limit=5000`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat titik panas");
        return (await res.json()) as HotspotApiResponse;
      })
      .then((body) => {
        if (!cancelled) setMarkerState({ key: locationKey, markers: body.markers });
      })
      .catch(() => {
        if (!cancelled) setMarkerState({ key: locationKey, markers: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [fix, locationKey]);

  const nearbyCount = useMemo(() => {
    if (!fix || !markers) return null;
    return markers.filter(
      (m) => haversineKm(fix, { lat: m.lat, lon: m.lng }) <= NEARBY_RADIUS_KM
    ).length;
  }, [markers, fix]);

  const nearestDistance = useMemo(() => {
    if (!fix || !markers || markers.length === 0) return null;
    return Math.min(
      ...markers.map((m) => haversineKm(fix, { lat: m.lat, lon: m.lng }))
    );
  }, [markers, fix]);

  return (
    <div className="space-y-6">
      <Link href="/community/edukasi" className="text-xs font-semibold text-[var(--community-ink-muted)]">
        ← {tr("Kembali ke Edukasi", "Back to Learn")}
      </Link>

      <section>
        <h1 className="text-lg font-semibold text-slate-900">{tr("Bantuan di Sekitarku", "Help Near Me")}</h1>
        <p className="text-sm text-[var(--community-ink-muted)] mt-1 leading-relaxed">
          {tr(
            "Sumber daya lokal untuk kesiapsiagaan. Menggunakan lokasi Anda (opsional) hanya untuk memberi konteks jarak dari deteksi satelit.",
            "Local preparedness resources. Your location (optional) is only used to give distance context from satellite detections."
          )}
        </p>
      </section>

      {/* Optional location context, graceful if denied */}
      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-2">
        <p className="text-xs font-semibold text-slate-900">
          {fix
            ? tr("Lokasi Anda sudah digunakan untuk konteks jarak di bawah.", "Your location is used for the distance context below.")
            : tr(
                "Bagikan lokasi untuk menghitung jarak dari deteksi satelit. Tanpa lokasi, aplikasi tidak menghitung jarak.",
                "Share your location to calculate distances from satellite detections. Without a location, the app does not calculate distances."
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
              {tr("atau lewati. Halaman ini tetap bisa digunakan tanpa lokasi.", "or skip. This page still works without a location.")}
            </span>
          </div>
        )}
        {location.errorMessage && (
          <p className="text-[11px] text-amber-700">{location.errorMessage}</p>
        )}
      </div>

      {/* Satellite detection note */}
      <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-1.5">
        {!fix ? (
          <p className="text-xs text-[var(--community-ink-muted)]">{tr("Pilih lokasi untuk melihat deteksi satelit terdekat.", "Choose a location to see nearby satellite detections.")}</p>
        ) : markers === null ? (
          <p className="text-xs text-[var(--community-ink-muted)]">{tr("Memuat data deteksi satelit…", "Loading satellite detections…")}</p>
        ) : nearbyCount === null || nearbyCount === 0 ? (
          <p className="text-xs text-[var(--community-ink-muted)]">
            {tr(`Tidak ada deteksi satelit dalam radius ${NEARBY_RADIUS_KM} km dari lokasi Anda saat ini.`, `No satellite detections within ${NEARBY_RADIUS_KM} km of you right now.`)}
          </p>
        ) : (
          <p className="text-xs font-semibold text-slate-900">
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

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
        <p className="text-xs font-bold text-amber-950">{tr("Pelaporan melalui aplikasi belum dibuka", "In-app reporting is not open")}</p>
        <p className="text-[11px] text-amber-900/80 leading-relaxed">
          {tr(
            "Gunakan 112 atau hubungi pemadam kebakaran/aparat setempat untuk kejadian nyata. Aplikasi tidak menerima koordinat, foto, atau laporan baru pada mode akses publik.",
            "Use 112 or contact the local fire service/authorities for real incidents. The app does not accept coordinates, photos or new reports in public-access mode."
          )}
        </p>
        <a href="tel:112" className="inline-block rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white">112</a>
      </section>

      {/* Unverified local resource categories */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-900">{tr("Sumber daya lokal", "Local resources")}</h2>
        {UNVERIFIED_CATEGORIES.map((cat) => (
          <div key={cat.id} className="rounded-xl border border-[var(--community-border)] bg-white p-3.5">
            <p className="text-xs font-semibold text-slate-900">{tr(...cat.title)}</p>
            <p className="text-[11px] text-[var(--community-ink-muted)] mt-0.5 leading-relaxed">{tr(...cat.description)}</p>
            <p className="text-[11px] font-semibold text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 inline-block">
              {tr("Belum terverifikasi. Data resmi belum tersedia", "Not verified. Official data not available yet")}
            </p>
          </div>
        ))}
      </section>

      {/* Official external sources */}
      <section className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-2">
        <h2 className="text-sm font-bold text-slate-900">{tr("Sumber resmi", "Official sources")}</h2>
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
        <h2 className="text-sm font-bold text-slate-900">{tr("Baca lebih lanjut", "Read more")}</h2>
        <ul className="space-y-2">
          {EDU_ARTICLES.map((article) => (
            <li key={article.slug}>
              <Link
                href={`/community/edukasi/${article.slug}`}
                className="block rounded-xl border border-[var(--community-border)] bg-white p-3 flex items-start gap-3"
              >
                <Icon name={article.icon} className="h-5 w-5 text-[var(--community-accent)] mt-0.5 shrink-0" />
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
