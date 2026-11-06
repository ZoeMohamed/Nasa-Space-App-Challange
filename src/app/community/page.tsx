"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPinned } from "lucide-react";
import ExplorePanel, { type ExploreTab } from "./components/ExplorePanel";
import { sourceLayerOf, type MapFocus, type SourceLayer } from "./components/CitizenMap";
import { STATUS_RADIUS_KM } from "./lib/areaStatus";
import { useLocationState } from "./lib/useLocation";
import { useSurroundings } from "./lib/useSurroundings";
import type { AreaSummary, CommunityReport, HotspotApiResponse, HotspotMarker } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const CitizenMap = dynamic(() => import("./components/CitizenMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0b2a33] text-sky-100">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  ),
});

/**
 * Peta (Community home). Full-screen satellite map of the live NASA FIRMS feed as harmonized by
 * the Python pipeline (/api/hotspots: MODIS + VIIRS, cross-matched, scored per 0.25° area), plus
 * officer-verified citizen reports (/api/reports/public). The "Jelajahi Peta" panel shows the
 * pipeline's priority areas, a selected detection, or the user's own surroundings.
 */
export default function CommunityMapPage() {
  const { tr, language } = useTranslation();
  const location = useLocationState();
  const { fix, requestGeolocation } = location;

  const [national, setNational] = useState<HotspotApiResponse | null>(null);
  const [hotspotsLoading, setHotspotsLoading] = useState(true);
  const [hotspotsError, setHotspotsError] = useState<string | null>(null);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [tab, setTab] = useState<ExploreTab>("hotspot");
  const [selected, setSelected] = useState<HotspotMarker | null>(null);
  const [desktopPanel, setDesktopPanel] = useState(true);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [layers, setLayers] = useState<Record<SourceLayer, boolean>>({ harmonized: true, modis: true, viirs: true, reports: true });
  const awaitingLocate = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hotspots", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const code = body?.code;
          throw new Error(
            code === "FIRMS_KEY_MISSING"
              ? tr("Server belum dikonfigurasi dengan kunci NASA FIRMS, jadi data satelit belum bisa dimuat.", "The server has no NASA FIRMS key configured, so satellite data can't load.")
              : tr("Data satelit sedang tidak tersedia. Coba lagi beberapa saat lagi.", "Satellite data is temporarily unavailable. Try again shortly.")
          );
        }
        return body as HotspotApiResponse;
      })
      .then((body) => {
        if (!cancelled) setNational(body);
      })
      .catch((error: Error) => {
        if (!cancelled) setHotspotsError(error.message);
      })
      .finally(() => {
        if (!cancelled) setHotspotsLoading(false);
      });
    fetch("/api/reports/public", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body?.reports) setReports(body.reports);
      })
      .catch(() => {
        /* best-effort */
      });
    return () => {
      cancelled = true;
    };
    // Fetch once; `tr` only shapes the error text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const surroundings = useSurroundings(fix, reports, language);

  // National feed is capped at the highest-FRP markers; add every detection near the user too,
  // so small fires next to them are on the map as well.
  const markers = useMemo(() => {
    const byId = new Map<string, HotspotMarker>();
    for (const m of national?.markers ?? []) byId.set(m.id, m);
    for (const h of surroundings.hotspots) byId.set(h.marker.id, h.marker);
    return [...byId.values()];
  }, [national, surroundings.hotspots]);

  const layerCounts = useMemo(() => {
    const counts: Record<SourceLayer, number> = { harmonized: 0, modis: 0, viirs: 0, reports: reports.length };
    for (const m of markers) counts[sourceLayerOf(m)] += 1;
    return counts;
  }, [markers, reports]);

  const openPanel = useCallback(() => {
    setDesktopPanel(true);
    setMobilePanel(true);
  }, []);

  const selectMarker = useCallback(
    (marker: HotspotMarker | null) => {
      setSelected(marker);
      if (marker) {
        setTab("hotspot");
        openPanel();
      }
    },
    [openPanel]
  );

  const focusMarker = useCallback(
    (marker: HotspotMarker) => {
      selectMarker(marker);
      setFocus({ lat: marker.lat, lon: marker.lng, zoom: 11, nonce: Date.now() });
    },
    [selectMarker]
  );

  const pickArea = useCallback(
    (area: AreaSummary) => {
      const inArea = markers.filter((m) => m.areaId === area.areaId).sort((a, b) => b.frp - a.frp);
      if (inArea[0]) focusMarker(inArea[0]);
      else setFocus({ lat: area.gridLat + 0.125, lon: area.gridLon + 0.125, zoom: 10, nonce: Date.now() });
    },
    [markers, focusMarker]
  );

  const locate = useCallback(() => {
    setTab("nearby");
    openPanel();
    if (fix) {
      setFocus({ lat: fix.lat, lon: fix.lon, zoom: 11, nonce: Date.now() });
    } else {
      awaitingLocate.current = true;
      requestGeolocation();
    }
  }, [fix, openPanel, requestGeolocation]);

  // Fly to the user once a requested GPS fix (or a newly picked place) arrives.
  const fixKey = fix ? `${fix.lat},${fix.lon}` : null;
  useEffect(() => {
    if (!fix) return;
    if (awaitingLocate.current || tab === "nearby") {
      awaitingLocate.current = false;
      queueMicrotask(() => setFocus({ lat: fix.lat, lon: fix.lon, zoom: 11, nonce: Date.now() }));
    }
    // Only when the fix itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixKey]);

  const userLocation = useMemo(() => (fix ? { lat: fix.lat, lon: fix.lon, radiusKm: STATUS_RADIUS_KM } : null), [fix]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <CitizenMap
        markers={markers}
        reports={reports}
        layers={layers}
        onToggleLayer={(layer) => setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))}
        layerCounts={layerCounts}
        selectedId={selected?.id ?? null}
        onSelectMarker={selectMarker}
        userLocation={userLocation}
        onLocate={locate}
        focus={focus}
      />

      {/* Data status chip */}
      {(hotspotsLoading || national) && (
        <div className="pointer-events-none absolute left-1/2 top-24 md:top-[7.5rem] z-[500] -translate-x-1/2 rounded-full bg-[#0d2f3a]/85 px-3 py-1.5 text-[11px] font-medium text-sky-100 shadow-lg backdrop-blur">
          {hotspotsLoading
            ? tr("Memuat data satelit NASA FIRMS…", "Loading NASA FIRMS satellite data…")
            : tr(
                `${national?.meta.markers?.total ?? markers.length} titik panas · 24 jam · MODIS + VIIRS`,
                `${national?.meta.markers?.total ?? markers.length} hotspots · 24 h · MODIS + VIIRS`
              )}
        </div>
      )}

      {/* Explore panel */}
      <aside
        className={`absolute z-[600] inset-x-3 bottom-20 max-h-[60dvh] md:inset-x-auto md:bottom-auto md:right-5 md:top-[9.5rem] md:max-h-[calc(100dvh-11rem)] md:w-[330px] ${
          mobilePanel ? "flex" : "hidden"
        } ${desktopPanel ? "md:flex" : "md:hidden"} flex-col`}
      >
        <ExplorePanel
          tab={tab}
          onTabChange={(next) => {
            setTab(next);
            if (next === "hotspot") setSelected(null);
          }}
          onCollapse={() => {
            setDesktopPanel(false);
            setMobilePanel(false);
          }}
          selected={selected}
          onClearSelected={() => setSelected(null)}
          areas={national?.areas ?? []}
          markers={markers}
          hotspotsLoading={hotspotsLoading}
          hotspotsError={hotspotsError}
          onPickArea={pickArea}
          location={location}
          surroundings={surroundings}
          onFocusNearest={focusMarker}
        />
      </aside>

      <button
        type="button"
        onClick={openPanel}
        className={`absolute z-[600] right-4 bottom-40 md:bottom-auto md:right-5 md:top-[9.5rem] items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-xl shadow-black/30 ${
          mobilePanel ? "hidden" : "flex"
        } ${desktopPanel ? "md:hidden" : "md:flex"}`}
      >
        <MapPinned className="h-4 w-4 text-[#c2410c]" />
        {tr("Jelajahi Peta", "Explore Map")}
      </button>
    </div>
  );
}
