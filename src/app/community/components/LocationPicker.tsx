"use client";

import { useState } from "react";
import { REGION_OPTIONS } from "@/lib/filters";
import { hasGrantedLocationBefore, regionCenter } from "../lib/geo";
import type { LocationState } from "../lib/useLocation";

const KNOWN_AREAS = REGION_OPTIONS.filter((option) => option.bounds !== null);

/**
 * Renders the full geolocation state machine (idle / loading / granted /
 * denied / unavailable) with a visibly distinct UI for each, plus a manual
 * fallback (typed coordinates, or a known-area pick reusing
 * src/lib/filters.ts's REGION_OPTIONS bounding boxes). Shared between
 * /community and /community/report so both follow the exact same rules:
 * geolocation is only ever requested from this button's onClick, and a
 * manual pick is always explicit and clearly labelled as approximate.
 *
 * Map-click picking was considered too (per the task's "click on the map"
 * option) but FireMap (src/components/map/FireMap.tsx, owned by a sibling
 * agent) doesn't expose a click-to-pick callback today, so this sticks to
 * the other two documented fallbacks (typed coordinates, known-area list)
 * rather than editing that component.
 */
export default function LocationPicker({ location }: { location: LocationState }) {
  const { geoStatus, errorMessage, fix, requestGeolocation, setManualFix } = location;
  const [manualOpen, setManualOpen] = useState(false);
  const [latInput, setLatInput] = useState("");
  const [lonInput, setLonInput] = useState("");
  const [coordError, setCoordError] = useState<string | null>(null);

  function submitCoords() {
    const lat = Number(latInput);
    const lon = Number(lonInput);
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
    setManualOpen(false);
  }

  function pickArea(value: string) {
    const option = KNOWN_AREAS.find((area) => area.value === value);
    if (!option || !option.bounds) return;
    const center = regionCenter(option.bounds);
    setManualFix({ lat: center.lat, lon: center.lon, source: "manual-area" });
    setManualOpen(false);
  }

  return (
    <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--community-ink)]">Lokasi Anda</h2>
          <p className="text-xs text-[var(--community-ink-muted)] mt-0.5">
            Dibutuhkan untuk menghitung jarak ke titik panas &amp; laporan terdekat.
          </p>
        </div>
        {fix && (
          <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            Lokasi aktif
          </span>
        )}
      </div>

      <div aria-live="polite" aria-atomic="true" className="contents">
      {/* idle */}
      {geoStatus === "idle" && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={requestGeolocation}
            className="w-full rounded-xl bg-[var(--community-accent)] py-2.5 text-sm font-semibold text-white shadow-sm active:scale-[0.99] transition"
          >
            Gunakan Lokasi Saya
          </button>
          {hasGrantedLocationBefore() && (
            <p className="text-[11px] text-[var(--community-ink-muted)]">
              Anda pernah mengizinkan akses lokasi di perangkat ini sebelumnya — koordinat itu sendiri tidak
              disimpan, jadi tetap perlu klik tombol di atas untuk lokasi saat ini.
            </p>
          )}
        </div>
      )}

      {/* loading */}
      {geoStatus === "loading" && (
        <div className="flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-200 px-3 py-2.5 text-sm text-sky-700">
          <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
          Meminta izin &amp; mendeteksi lokasi…
        </div>
      )}

      {/* granted — a fresh GPS fix obtained in this session */}
      {fix?.source === "gps" && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-800">
          <div className="font-semibold">Lokasi GPS ditemukan</div>
          <div className="text-xs mt-0.5 font-mono">
            {fix.lat.toFixed(5)}, {fix.lon.toFixed(5)}
            {typeof fix.accuracyMeters === "number" && ` · akurasi ±${Math.round(fix.accuracyMeters)} m`}
          </div>
        </div>
      )}

      {/* denied */}
      {geoStatus === "denied" && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm text-rose-800">
          <div className="font-semibold">Izin lokasi ditolak</div>
          <p className="text-xs mt-0.5">{errorMessage}</p>
        </div>
      )}

      {/* unavailable */}
      {geoStatus === "unavailable" && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
          <div className="font-semibold">Lokasi tidak tersedia</div>
          <p className="text-xs mt-0.5">{errorMessage}</p>
        </div>
      )}
      </div>

      {/* manually-picked fix summary (shown regardless of geoStatus, since manual picks don't go through geoStatus) */}
      {fix && fix.source !== "gps" && (
        <div className="rounded-xl bg-sky-50 border border-sky-200 px-3 py-2.5 text-sm text-sky-800">
          <div className="font-semibold">
            {fix.source === "manual-area" ? "Lokasi perkiraan (wilayah dipilih)" : "Lokasi perkiraan (koordinat manual)"}
          </div>
          <div className="text-xs mt-0.5 font-mono">
            {fix.lat.toFixed(5)}, {fix.lon.toFixed(5)}
          </div>
          <p className="text-[11px] mt-1 text-sky-700/80">
            Ini bukan lokasi GPS persis — jarak yang ditampilkan adalah perkiraan.
          </p>
        </div>
      )}

      {/* manual fallback — always reachable, not just after denial, since the task treats it as an "or" option */}
      <div>
        <button
          type="button"
          onClick={() => setManualOpen((open) => !open)}
          className="text-xs font-semibold text-[var(--community-accent)] underline underline-offset-2"
        >
          {manualOpen ? "Tutup pilihan lokasi manual" : "Atau pilih lokasi secara manual"}
        </button>

        {manualOpen && (
          <div className="mt-3 space-y-3 rounded-xl border border-dashed border-[var(--community-border)] p-3">
            <div>
              <label className="text-xs font-semibold text-[var(--community-ink)]" htmlFor="known-area-select">
                Pilih dari wilayah yang diketahui
              </label>
              <select
                id="known-area-select"
                defaultValue=""
                onChange={(event) => event.target.value && pickArea(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--community-border)] bg-white px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Pilih provinsi…
                </option>
                {KNOWN_AREAS.map((area) => (
                  <option key={area.value} value={area.value}>
                    {area.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--community-ink-muted)] mt-1">
                Titik tengah perkiraan wilayah, bukan batas administratif resmi.
              </p>
            </div>

            <div>
              <span id="manual-coord-heading" className="text-xs font-semibold text-[var(--community-ink)]">
                Atau ketik koordinat
              </span>
              <div className="mt-1 flex gap-2" role="group" aria-labelledby="manual-coord-heading">
                <input
                  inputMode="decimal"
                  placeholder="Lintang (lat)"
                  aria-label="Lintang (lat)"
                  value={latInput}
                  onChange={(event) => setLatInput(event.target.value)}
                  className="w-1/2 rounded-lg border border-[var(--community-border)] bg-white px-3 py-2 text-sm"
                />
                <input
                  inputMode="decimal"
                  placeholder="Bujur (lon)"
                  aria-label="Bujur (lon)"
                  value={lonInput}
                  onChange={(event) => setLonInput(event.target.value)}
                  className="w-1/2 rounded-lg border border-[var(--community-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
              {coordError && (
                <p className="text-[11px] text-rose-600 mt-1" role="alert">
                  {coordError}
                </p>
              )}
              <button
                type="button"
                onClick={submitCoords}
                className="mt-2 w-full rounded-lg border border-[var(--community-accent)] py-2 text-xs font-semibold text-[var(--community-accent)]"
              >
                Gunakan koordinat ini
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
