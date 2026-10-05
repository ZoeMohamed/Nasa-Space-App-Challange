import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Link from "next/link";

export const metadata = {
  title: "FIRESIGHT — Overview",
};

export default function OverviewPage() {
  return (
    <WorkstationLayout activeTab="OVERVIEW">
      <div className="p-4 md:p-6 space-y-4">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end pb-3 border-b border-outline-variant gap-3">
          <div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
              <span>ORBIT: SUOMI-NPP / NOAA-20</span>
              <span>/</span>
              <span>CAL-VAL: ACTIVE</span>
            </div>
            <h1 className="text-2xl font-bold text-on-surface tracking-tight">
              FIRESIGHT / OVERVIEW
            </h1>
            <p className="text-xs text-on-surface-variant font-medium">
              HARMONIZED SATELLITE FIRE INTELLIGENCE — MULTI-SENSOR RECURSIVE THERMAL TRACKING
            </p>
          </div>
          <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded border border-outline-variant text-xs">
            <button className="px-3 py-1 bg-surface-container-lowest text-on-surface font-semibold border border-outline-variant rounded shadow-xs">
              LAST 24 HOURS
            </button>
            <button className="px-3 py-1 text-on-surface-variant hover:text-on-surface rounded">
              SUMATRA &amp; KALIMANTAN
            </button>
            <button className="px-3 py-1 text-secondary-container bg-surface-container-highest border border-secondary-container rounded font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary-container" />
              HARMONIZED
            </button>
          </div>
        </div>

        {/* Telemetry Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-surface-container-low border border-outline-variant rounded divide-y sm:divide-y-0 sm:divide-x divide-outline-variant shadow-sm">
          <div className="p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-on-surface-variant text-[10px] font-mono uppercase">
              <span>FIRE ACTIVITIES</span>
              <span className="text-secondary-container bg-secondary-fixed px-1 rounded">24H CYCLE</span>
            </div>
            <div className="my-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-on-surface font-mono">1,248</span>
              <span className="font-mono text-xs text-primary font-semibold">+12.4% vs 24h</span>
            </div>
            <div className="font-mono text-[10px] text-on-surface-variant flex items-center justify-between">
              <span>FRP MAX: 420.5 MW</span>
              <span>SUM: 412 | KAL: 836</span>
            </div>
          </div>

          <div className="p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-on-surface-variant text-[10px] font-mono uppercase">
              <span>ACTIVE AREAS</span>
              <span className="bg-surface-container px-1 rounded">GRID 0.1°</span>
            </div>
            <div className="my-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-on-surface font-mono">37</span>
              <span className="font-mono text-xs text-primary font-semibold">+4 new</span>
            </div>
            <div className="font-mono text-[10px] text-on-surface-variant flex items-center justify-between">
              <span>EXPANDING: 12 SECTORS</span>
              <span>CONTAINED: 25</span>
            </div>
          </div>

          <div className="p-3 flex flex-col justify-between bg-error-container/20">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase">
              <span className="text-tertiary font-bold">HIGH ACTIVITY</span>
              <span className="bg-tertiary text-on-tertiary px-1 rounded font-semibold">+2 alerts</span>
            </div>
            <div className="my-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-tertiary font-mono">08</span>
              <span className="text-[10px] font-semibold text-tertiary uppercase">IMMEDIATE WATCH</span>
            </div>
            <div className="font-mono text-[10px] text-on-surface-variant flex items-center justify-between">
              <span>PEATLAND HAZARD</span>
              <span className="font-bold text-tertiary">CONF &gt; 90%</span>
            </div>
          </div>

          <div className="p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-on-surface-variant text-[10px] font-mono uppercase">
              <span>ANOMALIES</span>
              <span className="text-primary-container bg-surface-container-highest px-1 rounded font-bold">AI CLUSTER</span>
            </div>
            <div className="my-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-on-surface font-mono">05</span>
              <span className="font-mono text-xs text-on-surface-variant font-semibold">+1 detected</span>
            </div>
            <div className="font-mono text-[10px] text-on-surface-variant flex items-center justify-between">
              <span>RESIDUAL SMOLDER: 3</span>
              <span>SMOKE DIVERGENCE: 2</span>
            </div>
          </div>
        </section>

        {/* Map + Priority Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Map Canvas (static on overview, real map on /map) */}
          <div className="lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded overflow-hidden flex flex-col shadow-sm">
            <div className="bg-surface-container-low px-3 py-2 border-b border-outline-variant flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-on-surface uppercase tracking-wide">
                  HARMONIZED FIRE ACTIVITY — MODIS + VIIRS OBSERVATIONS
                </span>
                <span className="font-mono text-[10px] text-on-surface-variant border-l border-outline-variant pl-2">WGS84</span>
              </div>
              <div className="flex items-center gap-1 font-mono text-[10px]">
                <button className="px-2 py-0.5 bg-surface-container border border-outline-variant rounded">MODIS</button>
                <button className="px-2 py-0.5 bg-surface-container border border-outline-variant rounded">VIIRS</button>
                <button className="px-2 py-0.5 bg-secondary-container text-white font-semibold rounded">HARMONIZED</button>
              </div>
            </div>

            {/* Static preview map — link to real map */}
            <Link href="/map" className="relative bg-[#EDE8D5] h-[380px] overflow-hidden flex items-center justify-center p-2 group">
              <img
                className="w-full h-full object-cover opacity-90 rounded border border-outline-variant group-hover:opacity-75 transition-opacity"
                src="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/export?bbox=95,-6,120,6&bboxSR=4326&layers=&size=900,380&imageSR=&format=jpg&transparent=false&dpi=96&f=image"
                alt="Cartographic Satellite View"
              />
              {/* FA-001 Hotspot Callout */}
              <div className="absolute top-[52%] left-[54%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20">
                <div className="bg-surface-container-lowest border border-outline-variant rounded p-2.5 shadow-xl w-72 mb-1">
                  <div className="flex items-center justify-between border-b border-outline-variant pb-1 mb-1">
                    <span className="font-mono text-[10px] font-bold text-tertiary flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                      CLUSTER #FA-001 [CAL-04]
                    </span>
                    <span className="font-mono text-[9px] bg-tertiary-fixed text-on-tertiary-container px-1 rounded font-bold">94% CONF</span>
                  </div>
                  <div className="text-xs font-semibold text-on-surface">PALANGKA RAYA PEAT BASIN</div>
                  <div className="flex items-center justify-between text-on-surface-variant font-mono text-[10px] mt-0.5">
                    <span>RAD POWER: 312 MW</span>
                    <span>PERSISTENT: 72H</span>
                  </div>
                  <div className="mt-2 pt-1 border-t border-surface-container flex items-center justify-between">
                    <span className="font-mono text-[10px] text-tertiary font-bold">SMOLDERING DETECTED</span>
                    <span className="bg-secondary-container text-white px-2 py-0.5 rounded text-[11px] font-semibold flex items-center">
                      INSPECT
                      <span className="material-symbols-outlined text-[13px]">chevron_right</span>
                    </span>
                  </div>
                </div>
                <div className="relative flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-tertiary/20 border border-tertiary animate-ping absolute" />
                  <div className="w-4 h-4 rounded-full bg-tertiary border-2 border-white shadow-md flex items-center justify-center">
                    <div className="w-1 h-1 rounded-full bg-white" />
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="absolute bottom-2 left-2 bg-white/95 border border-outline-variant rounded px-2 py-1 flex items-center gap-3 font-mono text-[9px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-tertiary" /> HIGH CONF (&gt;90%)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary-container" /> MODERATE</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-secondary-container" /> SATELLITE PASS</span>
              </div>

              {/* Open Map CTA */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-secondary-container text-white px-4 py-2 rounded font-mono text-xs font-bold flex items-center gap-1.5 shadow-lg">
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                  OPEN INTERACTIVE MAP
                </div>
              </div>
            </Link>

            <div className="bg-surface-container-low px-3 py-1 border-t border-outline-variant flex items-center justify-between font-mono text-[10px] text-on-surface-variant">
              <span>SCAN SWATH: 3,040 KM | EQUATORIAL CROSS: 13:30 LT</span>
              <span>CALIBRATION: NRT-HARMONIZED-v1.4b</span>
            </div>
          </div>

          {/* Priority Ranking Panel */}
          <div className="lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded flex flex-col justify-between shadow-sm">
            <div>
              <div className="bg-surface-container-low px-3 py-2 border-b border-outline-variant flex items-center justify-between">
                <span className="text-xs font-semibold text-on-surface uppercase tracking-wide">PRIORITY AREAS (DAOPS RANKED)</span>
                <span className="font-mono text-[10px] text-on-surface-variant bg-surface-container px-1 rounded">SEVERITY</span>
              </div>

              <div className="divide-y divide-outline-variant text-xs">
                {/* #1 */}
                <Link href="/activity/FA-001" className="p-3 hover:bg-surface-container-low transition-colors group cursor-pointer bg-error-container/10 flex flex-col">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] bg-tertiary text-white px-1 rounded font-bold">01</span>
                        <span className="font-bold text-on-surface">Central Kalimantan</span>
                      </div>
                      <div className="font-mono text-[10px] text-on-surface-variant mt-0.5">PALANGKA RAYA PEAT (CAL-04)</div>
                    </div>
                    <span className="bg-tertiary text-white font-mono text-[10px] font-bold px-1.5 py-0.5 rounded">94% CONF</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-on-surface-variant">
                    <span className="text-tertiary font-semibold">HIGH ACTIVITY — 312 MW</span>
                    <span className="flex items-center text-secondary font-semibold group-hover:translate-x-0.5 transition-transform">
                      INSPECT <span className="material-symbols-outlined text-[13px]">chevron_right</span>
                    </span>
                  </div>
                </Link>

                {/* #2 */}
                <Link href="/activities" className="p-3 hover:bg-surface-container-low transition-colors group cursor-pointer flex flex-col">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] bg-surface-container text-on-surface px-1 rounded font-bold">02</span>
                        <span className="font-bold text-on-surface">South Sumatra</span>
                      </div>
                      <div className="font-mono text-[10px] text-on-surface-variant mt-0.5">OGAN KOMERING ILIR (SUM-12)</div>
                    </div>
                    <span className="bg-primary-container text-on-primary-container font-mono text-[10px] font-bold px-1.5 py-0.5 rounded">89% CONF</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-on-surface-variant">
                    <span>MEDIUM ACTIVITY — 184 MW</span>
                    <span className="flex items-center text-outline">EVALUATE <span className="material-symbols-outlined text-[13px]">chevron_right</span></span>
                  </div>
                </Link>

                {/* #3 */}
                <Link href="/activities" className="p-3 hover:bg-surface-container-low transition-colors group cursor-pointer flex flex-col">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] bg-surface-container text-on-surface px-1 rounded font-bold">03</span>
                        <span className="font-bold text-on-surface">Riau (Kampar Peatland)</span>
                      </div>
                      <div className="font-mono text-[10px] text-on-surface-variant mt-0.5">PELALAWAN BIO-ZONE (RIA-02)</div>
                    </div>
                    <span className="bg-primary-fixed-dim text-on-surface font-mono text-[10px] font-bold px-1.5 py-0.5 rounded">86% CONF</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-on-surface-variant">
                    <span>MEDIUM ACTIVITY — 142 MW</span>
                    <span className="flex items-center text-outline">EVALUATE <span className="material-symbols-outlined text-[13px]">chevron_right</span></span>
                  </div>
                </Link>
              </div>
            </div>

            <div className="p-3 bg-surface-container-low border-t border-outline-variant flex items-center justify-between text-xs">
              <span className="font-mono text-[10px] text-on-surface-variant">DAOPS CYCLE: 04H</span>
              <Link href="/activities" className="bg-white border border-outline-variant hover:bg-surface-container px-3 py-1 rounded font-semibold">
                VIEW ALL SECTORS
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom Row: Chart + Subsystem Status */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* 24H Chart */}
          <div className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded p-3 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between border-b border-outline-variant pb-2 mb-2">
              <span className="text-xs font-bold text-on-surface uppercase">FIRE ACTIVITY OVER TIME (24H SENSOR HARMONIZATION)</span>
              <div className="flex items-center gap-3 font-mono text-[10px]">
                <span className="text-secondary-container font-bold flex items-center gap-1"><span className="w-2.5 h-0.5 bg-secondary-container" /> Harmonized</span>
                <span className="text-on-surface-variant flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#f0a000]" /> VIIRS</span>
                <span className="text-outline flex items-center gap-1"><span className="w-2.5 h-0.5 bg-outline" /> MODIS</span>
              </div>
            </div>
            <div className="h-36 w-full relative flex items-end">
              <svg className="w-full h-full overflow-visible" fill="none" viewBox="0 0 600 130">
                <line x1="0" y1="30" x2="600" y2="30" stroke="#e3e3d7" strokeDasharray="3 3"/>
                <line x1="0" y1="70" x2="600" y2="70" stroke="#e3e3d7" strokeDasharray="3 3"/>
                <line x1="0" y1="110" x2="600" y2="110" stroke="#e3e3d7" strokeDasharray="3 3"/>
                <path d="M 0 100 Q 150 90, 300 70 T 600 48" stroke="#857461" strokeDasharray="3 3" strokeWidth="1.5"/>
                <path d="M 0 95 Q 150 78, 300 52 T 600 32" stroke="#f0a000" strokeWidth="1.5"/>
                <path d="M 0 92 Q 150 70, 300 45 T 600 24" stroke="#0d70e9" strokeWidth="2.5"/>
                <circle cx="300" cy="45" r="3.5" fill="#0d70e9" stroke="#fff" strokeWidth="1.5"/>
                <circle cx="600" cy="24" r="4" fill="#0d70e9" stroke="#fff" strokeWidth="2"/>
              </svg>
            </div>
            <div className="pt-2 border-t border-outline-variant flex justify-between font-mono text-[10px] text-on-surface-variant">
              <span>00:00 UTC</span><span>06:00 UTC</span><span>12:00 UTC</span><span>18:00 UTC</span><span>NOW (+34% PEAK)</span>
            </div>
          </div>

          {/* Subsystem Telemetry */}
          <div className="lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded p-3 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between border-b border-outline-variant pb-2 mb-2">
                <span className="text-xs font-bold text-on-surface uppercase">SUBSYSTEM TELEMETRY STACK</span>
                <span className="w-2 h-2 rounded-full bg-[#6AA84F]" />
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                {[
                  ["MODIS FEED:", "100% OK"],
                  ["VIIRS FEED:", "100% OK"],
                  ["DBSCAN CLUSTER:", "ACTIVE"],
                  ["HARMONY ENGINE:", "ONLINE"],
                  ["FASTAPI:", "16ms"],
                  ["FIRMS NRT:", "LIVE"],
                ].map(([key, val]) => (
                  <div key={key} className="p-1.5 bg-surface-container-low rounded border border-outline-variant flex justify-between">
                    <span>{key}</span>
                    <span className="text-[#6AA84F] font-bold">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-outline-variant font-mono text-[10px] text-on-surface-variant">
              <div className="flex justify-between">
                <span>CONSTELLATION HEALTH:</span>
                <span className="text-[#6AA84F] font-bold">OPTIMAL (NOAA-20 + SUOMI-NPP)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </WorkstationLayout>
  );
}
