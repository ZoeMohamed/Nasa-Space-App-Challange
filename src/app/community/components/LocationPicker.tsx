"use client";

import { useEffect, useId, useState } from "react";
import type { LocationState } from "../lib/useLocation";
import { useRegion } from "@/lib/useRegion";
import { formatAdminFull } from "@/lib/adminRegion";

interface PlaceHit {
  level: "kecamatan" | "kabupatenKota";
  label: string;
  lat: number;
  lon: number;
}

/** Debounced place-name search against /api/region/search (offline BPS boundaries, no external API). */
function usePlaceSearch(query: string) {
  const [state, setState] = useState<{ query: string; hits: PlaceHit[]; error: boolean }>({
    query: "",
    hits: [],
    error: false,
  });
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/region/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal, cache: "no-store" })
        .then((res) => res.json() as Promise<{ results?: PlaceHit[]; error?: string }>)
        .then((body) => setState({ query: trimmed, hits: body.results ?? [], error: Boolean(body.error) }))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setState({ query: trimmed, hits: [], error: true });
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  const current = state.query === trimmed;
  return {
    hits: trimmed.length >= 2 && current ? state.hits : [],
    error: current && state.error,
    searching: trimmed.length >= 2 && !current,
    tooShort: trimmed.length < 2,
  };
}

/**
 * Location chooser shared by Beranda and Lapor Kebakaran. Three ways in, in order of usefulness:
 * GPS (explicit button only), searching a kecamatan / kota by name, or typed coordinates (hidden as
 * an advanced option — most people don't know their coordinates).
 */
export default function LocationPicker({ location, onDone }: { location: LocationState; onDone?: () => void }) {
  const { geoStatus, errorMessage, fix, requestGeolocation, setManualFix } = location;
  const fixRegionLabel = formatAdminFull(useRegion(fix?.lat, fix?.lon));
  const [query, setQuery] = useState("");
  const { hits, error: searchError, searching, tooShort } = usePlaceSearch(query);
  const [coordsOpen, setCoordsOpen] = useState(false);
  const [latInput, setLatInput] = useState("");
  const [lonInput, setLonInput] = useState("");
  const [coordError, setCoordError] = useState<string | null>(null);
  const searchId = useId();

  function pickPlace(hit: PlaceHit) {
    setManualFix({ lat: hit.lat, lon: hit.lon, source: "manual-area", label: hit.label });
    setQuery("");
    onDone?.();
  }

  function submitCoords() {
    const lat = Number(latInput.replace(",", "."));
    const lon = Number(lonInput.replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setCoordError("Masukkan angka yang valid untuk lintang dan bujur.");
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setCoordError("Lintang harus -90..90 dan bujur -180..180.");
      return;
    }
    setCoordError(null);
    setManualFix({ lat, lon, source: "manual-coords" });
    setCoordsOpen(false);
    onDone?.();
  }

  return (
    <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-[var(--community-ink)]">Atur lokasi Anda</h2>
        <p className="text-xs text-[var(--community-ink-muted)] mt-0.5">
          Dipakai untuk status wilayah, jarak ke titik api, dan kualitas udara di sekitar Anda.
        </p>
      </div>

      {/* Current location */}
      {fix && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-900">
          <div className="flex items-center gap-1.5 font-semibold">
            <span className="material-symbols-outlined text-[18px]">
              {fix.source === "gps" ? "my_location" : "location_on"}
            </span>
            {fix.source === "gps" ? "Lokasi GPS aktif" : "Lokasi dipilih manual"}
          </div>
          <div className="text-xs mt-1 font-medium">{fix.label ?? fixRegionLabel ?? `${fix.lat.toFixed(4)}, ${fix.lon.toFixed(4)}`}</div>
          <div className="text-[11px] mt-0.5 text-emerald-800/80">
            {fix.source === "gps"
              ? typeof fix.accuracyMeters === "number"
                ? `Akurasi ±${Math.round(fix.accuracyMeters)} m`
                : "Dari perangkat Anda"
              : "Titik di dalam wilayah yang dipilih — jarak yang ditampilkan adalah perkiraan."}
          </div>
        </div>
      )}

      {/* 1. GPS */}
      <div className="space-y-2" aria-live="polite">
        <button
          type="button"
          onClick={requestGeolocation}
          disabled={geoStatus === "loading"}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--community-accent)] py-2.5 text-sm font-semibold text-white shadow-sm active:scale-[0.99] transition disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[18px]">my_location</span>
          {geoStatus === "loading" ? "Mendeteksi lokasi…" : fix?.source === "gps" ? "Perbarui lokasi GPS" : "Gunakan lokasi saya (GPS)"}
        </button>
        {(geoStatus === "denied" || geoStatus === "unavailable") && errorMessage && (
          <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">{errorMessage}</p>
        )}
      </div>

      {/* 2. Search by place name */}
      <div className="space-y-2">
        <label htmlFor={searchId} className="text-xs font-semibold text-[var(--community-ink)]">
          Atau cari kecamatan / kota
        </label>
        <div className="relative">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">
            search
          </span>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Contoh: Jekan Raya, Pulang Pisau, Pekanbaru"
            autoComplete="off"
            className="w-full rounded-xl border border-[var(--community-border)] bg-white pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>
        {!tooShort && (
          <div className="rounded-xl border border-[var(--community-border)] overflow-hidden">
            {searching && <p className="px-3 py-2.5 text-xs text-[var(--community-ink-muted)]">Mencari…</p>}
            {!searching && searchError && (
              <p className="px-3 py-2.5 text-xs text-rose-700">Pencarian lokasi sedang tidak tersedia.</p>
            )}
            {!searching && !searchError && hits.length === 0 && (
              <p className="px-3 py-2.5 text-xs text-[var(--community-ink-muted)]">
                Tidak ditemukan. Coba nama kecamatan atau kabupaten/kota (nama desa belum didukung).
              </p>
            )}
            {!searching && hits.length > 0 && (
              <ul className="divide-y divide-[var(--community-border)]">
                {hits.map((hit) => (
                  <li key={`${hit.level}-${hit.label}`}>
                    <button
                      type="button"
                      onClick={() => pickPlace(hit)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-emerald-50 transition"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[var(--community-accent)]">
                        {hit.level === "kecamatan" ? "location_on" : "location_city"}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{hit.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-[11px] text-[var(--community-ink-muted)]">
          Batas wilayah BPS 2020. Pilihan manual diingat di perangkat ini sampai Anda menggantinya.
        </p>
      </div>

      {/* 3. Advanced: coordinates */}
      <div>
        <button
          type="button"
          onClick={() => setCoordsOpen((open) => !open)}
          className="text-xs font-semibold text-[var(--community-accent)] underline underline-offset-2"
        >
          {coordsOpen ? "Tutup input koordinat" : "Masukkan koordinat (lanjutan)"}
        </button>
        {coordsOpen && (
          <div className="mt-2 space-y-2">
            <div className="flex gap-2" role="group" aria-label="Koordinat">
              <input
                inputMode="decimal"
                placeholder="Lintang, mis. -2.21"
                aria-label="Lintang (lat)"
                value={latInput}
                onChange={(event) => setLatInput(event.target.value)}
                className="w-1/2 rounded-lg border border-[var(--community-border)] bg-white px-3 py-2 text-sm"
              />
              <input
                inputMode="decimal"
                placeholder="Bujur, mis. 113.91"
                aria-label="Bujur (lon)"
                value={lonInput}
                onChange={(event) => setLonInput(event.target.value)}
                className="w-1/2 rounded-lg border border-[var(--community-border)] bg-white px-3 py-2 text-sm"
              />
            </div>
            {coordError && (
              <p className="text-[11px] text-rose-600" role="alert">
                {coordError}
              </p>
            )}
            <button
              type="button"
              onClick={submitCoords}
              className="w-full rounded-lg border border-[var(--community-accent)] py-2 text-xs font-semibold text-[var(--community-accent)]"
            >
              Gunakan koordinat ini
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
