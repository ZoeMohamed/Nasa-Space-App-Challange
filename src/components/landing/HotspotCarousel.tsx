"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { HotspotMarker } from "@/types";

function sourceLabel(marker: HotspotMarker): string {
  const sensor = marker.sensor ?? (marker.source?.startsWith("MODIS") ? "MODIS" : "VIIRS");
  const platform = marker.source?.includes("NOAA20")
    ? "NOAA-20"
    : marker.source?.includes("NOAA21")
      ? "NOAA-21"
      : marker.source?.includes("SNPP")
        ? "S-NPP"
        : null;
  return `NASA-${sensor}${platform ? ` (${platform})` : ""}`;
}

function formatAcquired(value: string | undefined, language: "id" | "en", fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const formatted = date.toLocaleString(language === "en" ? "en-GB" : "id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
  return `${formatted} WIB`;
}

function MatchBadge({ marker }: { marker: HotspotMarker }) {
  const { t } = useTranslation();
  const matched = marker.matchStatus === "MATCHED";
  const label = matched
    ? t("recentHotspots.badgeMatched")
    : marker.sensor === "MODIS"
      ? t("recentHotspots.badgeModisOnly")
      : t("recentHotspots.badgeViirsOnly");
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        matched ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${matched ? "bg-emerald-500" : "bg-amber-500"}`} />
      {label}
    </span>
  );
}

function HotspotCard({ marker, hidden = false }: { marker: HotspotMarker; hidden?: boolean }) {
  const { t, language } = useTranslation();
  const admin = marker.admin;
  const rows: [string, React.ReactNode][] = [
    [t("recentHotspots.date"), formatAcquired(marker.acquiredAt, language, t("recentHotspots.unrecorded"))],
    [
      t("recentHotspots.source"),
      <span key="source" className="inline-flex items-center gap-1.5">
        <span className={`h-2.5 w-2.5 rounded-sm ${marker.sensor === "MODIS" ? "bg-red-500" : "bg-amber-400"}`} />
        {sourceLabel(marker)}
      </span>,
    ],
    ...(admin
      ? ([
          [t("recentHotspots.district"), `${admin.approximate ? "± " : ""}${admin.kecamatan}`],
          [t("recentHotspots.regencyProvince"), `${admin.kabupatenKota}, ${admin.provinsi}`],
        ] as [string, React.ReactNode][])
      : ([[t("recentHotspots.coordinates"), `${marker.lat.toFixed(3)}, ${marker.lng.toFixed(3)}`]] as [string, React.ReactNode][])),
  ];

  return (
    <article
      className="w-[300px] shrink-0 rounded-2xl border border-[var(--color-border)] bg-white p-5 sm:w-[440px] sm:p-6"
      aria-roledescription="slide"
      aria-hidden={hidden || undefined}
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
        <p className="min-w-0 truncate text-xs font-semibold text-sky-800" title={marker.id}>
          ID: {marker.id}
        </p>
        <MatchBadge marker={marker} />
      </div>
      <dl className="space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[minmax(7.5rem,auto)_1fr] gap-x-2">
            <dt className="text-[var(--color-text-muted)]">{label}</dt>
            <dd className="min-w-0 text-[var(--color-text-main)]">
              <span aria-hidden="true">: </span>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

const DRIFT_PX_PER_SECOND = 40;
const NUDGE_MS = 450;
const CARD_GAP_PX = 16;

/**
 * Continuously drifting ("ticker") carousel of the latest real detections. The list is rendered
 * twice side by side and the offset wraps at one list's width, so the slide never jumps back.
 * Drift pauses on hover/focus/touch and when the tab is hidden; under prefers-reduced-motion it
 * never drifts and the arrows jump instantly. The transform is written straight to the DOM from
 * requestAnimationFrame, so the animation doesn't re-render React every frame.
 */
export default function HotspotCarousel({
  markers,
  loading,
  unavailable,
  windowLabel,
}: {
  markers: HotspotMarker[];
  loading: boolean;
  unavailable: boolean;
  windowLabel: string;
}) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const firstSetRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);
  const nudgeRef = useRef<{ from: number; to: number; start: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const animate = markers.length > 1;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!animate) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      const loopWidth = firstSetRef.current?.offsetWidth ?? 0;
      const nudge = nudgeRef.current;
      if (nudge) {
        const progress = Math.min((now - nudge.start) / NUDGE_MS, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        offsetRef.current = nudge.from + (nudge.to - nudge.from) * eased;
        if (progress >= 1) nudgeRef.current = null;
      } else if (!reduceMotion && !pausedRef.current && document.visibilityState === "visible") {
        offsetRef.current += DRIFT_PX_PER_SECOND * dt;
      }
      if (loopWidth > 0) {
        offsetRef.current = ((offsetRef.current % loopWidth) + loopWidth) % loopWidth;
      }
      if (trackRef.current) trackRef.current.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, markers]);

  function nudge(direction: 1 | -1) {
    const card = firstSetRef.current?.querySelector("article");
    if (!card) return;
    const distance = (card.getBoundingClientRect().width + CARD_GAP_PX) * direction;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      offsetRef.current += distance;
      return;
    }
    const from = offsetRef.current;
    nudgeRef.current = { from, to: from + distance, start: performance.now() };
  }

  return (
    <div
      className="rounded-3xl border border-[var(--color-border)] bg-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:px-7 sm:py-5">
        <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <h2 className="text-xl font-bold text-[var(--color-text-main)] sm:text-2xl">{t("recentHotspots.title")}</h2>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {t("recentHotspots.liveSync")} · {windowLabel}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/map" className="hidden text-sm font-semibold text-[var(--color-primary)] hover:underline sm:inline">
            {t("recentHotspots.viewMap")}
          </Link>
          {animate && (
            <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => nudge(-1)}
                aria-label={t("recentHotspots.prev")}
                className="flex h-8 w-8 items-center justify-center text-[var(--color-text-muted)] hover:bg-slate-50"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <button
                type="button"
                onClick={() => nudge(1)}
                aria-label={t("recentHotspots.next")}
                className="flex h-8 w-8 items-center justify-center border-l border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-slate-50"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-7">
        {loading ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t("recentHotspots.loading")}</p>
        ) : markers.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            {unavailable ? t("recentHotspots.unavailable") : t("recentHotspots.empty")}
          </p>
        ) : (
          <div
            role="region"
            aria-roledescription="carousel"
            aria-label={t("recentHotspots.title")}
            className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]"
          >
            <div ref={trackRef} className="flex w-max will-change-transform">
              <div ref={firstSetRef} className="flex gap-4 pr-4">
                {markers.map((marker) => (
                  <HotspotCard key={marker.id} marker={marker} />
                ))}
              </div>
              {animate && (
                <div className="flex gap-4 pr-4" aria-hidden="true" inert>
                  {markers.map((marker) => (
                    <HotspotCard key={`${marker.id}-copy`} marker={marker} hidden />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
