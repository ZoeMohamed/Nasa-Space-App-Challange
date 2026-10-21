"use client";

import { useEffect, useId, useState } from "react";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export interface AreaHit {
  level: "kecamatan" | "kabupatenKota";
  label: string;
  code: string;
  lat: number;
  lon: number;
}

/** Kecamatan / kabupaten-kota name search over the offline BPS boundaries (/api/region/search). */
export default function AreaSearch({
  onPick,
  placeholder: placeholderProp,
}: {
  onPick: (hit: AreaHit) => void;
  placeholder?: string;
}) {
  const { tr } = useTranslation();
  const placeholder = placeholderProp ?? tr("Cari kabupaten/kota atau kecamatan…", "Search a regency/city or district…");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; hits: AreaHit[] } | null>(null);
  const inputId = useId();
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/region/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal, cache: "no-store" })
        .then((res) => res.json() as Promise<{ results?: AreaHit[] }>)
        .then((body) => setResult({ query: trimmed, hits: body.results ?? [] }))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResult({ query: trimmed, hits: [] });
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  const ready = trimmed.length >= 2 && result?.query === trimmed;

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        {placeholder}
      </label>
      <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">
        search
      </span>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
      />
      {trimmed.length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {!ready ? (
            <p className="px-3 py-2 text-xs text-gray-500">{tr("Mencari…", "Searching…")}</p>
          ) : result.hits.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500">{tr("Tidak ditemukan.", "No results.")}</p>
          ) : (
            <ul>
              {result.hits.map((hit) => (
                <li key={hit.code}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(hit);
                      setQuery("");
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50"
                  >
                    <span className="material-symbols-outlined text-[16px] text-emerald-700">
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
    </div>
  );
}
