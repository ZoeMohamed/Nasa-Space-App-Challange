import Link from "next/link";
import WorkstationLayout from "@/components/layout/WorkstationLayout";

export const metadata = {
  title: "FIRESIGHT — Fire Activity #FA-001",
};

export default function ActivityDetailPage() {
  return (
    <WorkstationLayout activeTab="ACTIVITIES">
      <div className="flex-1 flex flex-col overflow-y-auto custom-scroll bg-surface">
        {/* Header Banner */}
        <section className="border-b border-[#BFC1B7] bg-[#FDFDF8] px-4 md:px-6 py-3 shrink-0 flex flex-wrap justify-between items-end gap-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-[#857461] tracking-wider mb-1">
              <span className="inline-block w-2 h-2 bg-[#F54E00]" />
              <span>EPISODE REPORT // PEATLAND SMOLDERING BASIN</span>
              <span>/</span>
              <span className="font-mono text-on-surface font-bold">CLUSTER ID #4492-C</span>
            </div>
            <h1 className="text-2xl text-on-surface font-bold tracking-tight">FIRE ACTIVITY #FA-001</h1>
            <p className="text-xs text-[#524533] mt-0.5 flex items-center gap-2">
              <span>CENTRAL KALIMANTAN — PALANGKA RAYA SUB-BASIN (CAL-04)</span>
              <span>|</span>
              <span className="font-mono bg-surface-container px-1 py-0.5 border border-[#BFC1B7]">PEAT DEPTH: 2.8m</span>
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <div className="bg-[#F54E00]/10 border border-[#F54E00] px-3 py-1.5 flex items-center gap-2 rounded">
              <span className="w-2 h-2 rounded-full bg-[#F54E00] animate-ping" />
              <span className="font-bold text-[#F54E00]">HIGH ACTIVITY</span>
            </div>
            <div className="bg-white border border-[#BFC1B7] px-3 py-1 rounded">
              <div className="text-[9px] text-outline">CONFIDENCE</div>
              <div className="font-bold text-on-surface">94%</div>
            </div>
            <Link
              href="/intelligence/FA-001"
              className="bg-primary-container text-on-primary-container border border-[#C78500] px-3 py-2 font-bold rounded shadow-sm hover:brightness-105 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">psychology</span>
              <span>AI INTELLIGENCE REPORT</span>
            </Link>
          </div>
        </section>

        {/* 2-Column Grid */}
        <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 items-start">
          {/* Left Column */}
          <div className="lg:col-span-8 space-y-4">
            {/* AI Insight Card */}
            <div className="bg-[#FDFDF8] border border-[#BFC1B7] rounded p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-[#BFC1B7] pb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary-container">psychology</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-on-surface">AI INSIGHT // RAPID FIRE CONVERGENCE</span>
                </div>
                <span className="font-mono text-[9px] bg-surface-container-high border border-[#BFC1B7] px-1 py-0.5">SYNTHESIS</span>
              </div>
              <div className="bg-[#F4F3ED] border-l-4 border-secondary-container p-3 text-sm leading-snug">
                The system detected persistent fire activity across multiple satellite observations with high sub-surface smoldering probability in degraded peatland.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                {[
                  "DETECTED BY MODIS (Terra/Aqua)",
                  "DETECTED BY VIIRS (375m I-Band)",
                  "PERSISTENT ACTIVITY (>72h window)",
                  "ACTIVITY INCREASING (+38% FRP)",
                ].map((item) => (
                  <div key={item} className="p-1.5 bg-white border border-[#BFC1B7] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#6AA84F] text-sm">check_circle</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Harmonization Diagram */}
            <div className="bg-[#FDFDF8] border border-[#BFC1B7] rounded p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-center border-b border-[#BFC1B7] pb-2">
                <span className="text-xs font-bold text-on-surface uppercase">SENSOR HARMONIZATION &amp; CLUSTER CONVERGENCE</span>
                <span className="font-mono text-[10px] text-on-surface-variant">DBSCAN-GP v1.0</span>
              </div>
              <div className="bg-[#EEEFE9] border border-[#BFC1B7] p-3 rounded">
                <div className="grid grid-cols-1 md:grid-cols-5 items-center gap-2 text-center text-xs">
                  <div className="bg-white border border-[#BFC1B7] p-2 text-left">
                    <div className="flex justify-between font-bold"><span>MODIS</span><span className="font-mono text-[10px]">1km</span></div>
                    <div className="text-sm font-bold text-[#F54E00] my-1 font-mono">12 DETECTIONS</div>
                    <div className="text-[10px] text-outline">MWIR B21/B22</div>
                  </div>
                  <div className="font-bold text-lg text-outline">+</div>
                  <div className="bg-white border border-[#BFC1B7] p-2 text-left">
                    <div className="flex justify-between font-bold"><span>VIIRS</span><span className="font-mono text-[10px]">375m</span></div>
                    <div className="text-sm font-bold text-[#F54E00] my-1 font-mono">18 DETECTIONS</div>
                    <div className="text-[10px] text-outline">I-Band I04</div>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="material-symbols-outlined text-secondary-container">arrow_forward</span>
                    <span className="font-mono text-[9px] text-secondary font-bold">AI ENGINE</span>
                  </div>
                  <div className="bg-[#F4F4E7] border-2 border-secondary-container p-2 text-left">
                    <div className="text-[10px] font-bold text-secondary-container">1 HARMONIZED EPISODE</div>
                    <div className="text-sm font-bold text-on-surface font-mono">#FA-001</div>
                    <div className="font-mono text-[9px] text-on-surface">30 Hits Unified • 94% Conf.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-[#FDFDF8] border border-[#BFC1B7] rounded p-4 shadow-sm space-y-2">
              <div className="flex justify-between items-center border-b border-[#BFC1B7] pb-2">
                <span className="text-xs font-bold text-on-surface uppercase">FIRE ACTIVITY TIMELINE // 72-HOUR SENSOR PASSES</span>
                <span className="font-mono text-[10px] text-tertiary font-bold">72 HOURS CONTINUOUS</span>
              </div>
              <div className="space-y-2 pt-1 font-mono text-xs">
                <div className="grid grid-cols-12 items-center">
                  <div className="col-span-3 text-[11px] text-on-surface font-semibold">MODIS (1km)</div>
                  <div className="col-span-9 h-6 bg-surface-container-low border border-[#BFC1B7] flex items-center justify-between px-3">
                    <span className="w-2 h-2 rounded-full bg-primary-container" /><span className="w-2 h-2 rounded-full bg-primary-container" />
                    <span className="w-2 h-2 rounded-full bg-primary-container" /><span className="w-2.5 h-2.5 rounded-full bg-tertiary" />
                    <span className="text-[10px] text-outline">12 HITS</span>
                  </div>
                </div>
                <div className="grid grid-cols-12 items-center">
                  <div className="col-span-3 text-[11px] text-on-surface font-semibold">VIIRS (375m)</div>
                  <div className="col-span-9 h-6 bg-surface-container-low border border-[#BFC1B7] flex items-center justify-between px-3">
                    <span className="w-2 h-2 rounded-full bg-tertiary" /><span className="w-2 h-2 rounded-full bg-tertiary" />
                    <span className="w-2 h-2 rounded-full bg-tertiary" /><span className="w-2.5 h-2.5 rounded-full bg-tertiary ring-1 ring-white" />
                    <span className="text-[10px] text-outline">18 HITS</span>
                  </div>
                </div>
                <div className="grid grid-cols-12 items-center">
                  <div className="col-span-3 text-[11px] text-secondary-container font-bold">HARMONIZED</div>
                  <div className="col-span-9 h-7 bg-[#EEEFE9] border border-secondary-container flex items-center justify-between px-3">
                    <span className="text-[10px] text-on-surface">SMOLDERING DYNAMICS // 42.0 MW → PEAK 142.6 MW</span>
                    <span className="font-bold text-tertiary">ACTIVE NOW</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-4 space-y-4">
            {/* Location Metadata */}
            <div className="bg-[#FDFDF8] border border-[#BFC1B7] rounded p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between border-b border-[#BFC1B7] pb-1">
                <span className="text-xs font-bold uppercase text-on-surface">LOCATION METADATA</span>
                <span className="font-mono text-[10px] text-secondary font-bold">EPSG:4326</span>
              </div>
              <div className="space-y-1.5 font-mono text-[11px] divide-y divide-surface-container">
                {[
                  ["LATITUDE:", "-2.2104° S"],
                  ["LONGITUDE:", "113.9213° E"],
                  ["PROVINCE:", "CENTRAL KALIMANTAN"],
                  ["PERSISTENCE:", "72 HOURS"],
                  ["PEAK FRP:", "142.6 MW"],
                ].map(([k, v]) => (
                  <div key={k} className={`flex justify-between pt-1 ${k === "PEAK FRP:" ? "bg-surface-container p-1" : ""}`}>
                    <span>{k}</span>
                    <span className={`font-semibold ${k === "PERSISTENCE:" || k === "PEAK FRP:" ? "text-tertiary font-bold" : ""}`}>{v}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/map"
                className="w-full mt-3 bg-secondary-container text-white py-2 rounded text-xs font-bold hover:brightness-110 flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">open_in_new</span>
                <span>OPEN IN MAP EXPLORER</span>
              </Link>
            </div>

            {/* DAOPS Protocol */}
            <div className="bg-[#FDFDF8] border border-[#BFC1B7] rounded p-4 shadow-sm space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-outline block">DAOPS PROTOCOL</span>
              <Link
                href="/intelligence/FA-001"
                className="w-full bg-[#F54E00] hover:bg-[#C43E00] text-white py-2 rounded text-xs font-bold tracking-wide flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">local_shipping</span>
                <span>DISPATCH TACTICAL UNIT</span>
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <button className="bg-white border border-[#BFC1B7] hover:bg-surface-container py-1.5 text-xs font-medium rounded flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-xs">download</span>
                  <span>GEOJSON</span>
                </button>
                <button className="bg-white border border-[#BFC1B7] hover:bg-surface-container py-1.5 text-xs font-medium rounded flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-xs">print</span>
                  <span>BRIEF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </WorkstationLayout>
  );
}
