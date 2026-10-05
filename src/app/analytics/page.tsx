import Link from "next/link";
import WorkstationLayout from "@/components/layout/WorkstationLayout";

export const metadata = {
  title: "FIRESIGHT — Analytics",
};

export default function AnalyticsPage() {
  return (
    <WorkstationLayout activeTab="ANALYTICS">
      <div className="flex-1 flex flex-col min-w-0 bg-[#FBFBFA] overflow-y-auto custom-scroll">
        {/* Header Banner */}
        <div className="p-4 md:p-6 pb-3 border-b border-[#BFC1B7] bg-surface-container-lowest shrink-0">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center gap-2 font-mono text-[10px] text-on-surface-variant">
              <span className="bg-surface-container px-1 rounded font-bold">MULTI-SENSOR ANALYTICS</span>
              <span>•</span>
              <span className="text-tertiary font-bold">CONFIDENCE: HIGH (KLHK VERIFIED)</span>
            </div>
            <h1 className="text-2xl font-bold text-on-surface tracking-tight">
              ANALYTICS / FIRE ACTIVITY INTELLIGENCE
            </h1>
            <p className="text-xs text-on-surface-variant max-w-3xl">
              Harmonized spatial-temporal trends, sensor observation variance, and ML anomaly detection across Sumatra &amp; Kalimantan.
            </p>
          </div>
          <div className="flex items-center gap-4 mt-3 pt-2 border-t border-[#F4F3ED] font-mono text-xs">
            <span className="pb-1 border-b-2 border-secondary-container text-secondary-container font-bold">01 HISTORICAL (2026 NRT)</span>
            <span className="text-outline cursor-pointer hover:text-on-surface">02 MODIS / VIIRS RATIO</span>
            <span className="text-outline cursor-pointer hover:text-on-surface">03 ANOMALIES</span>
          </div>
        </div>

        {/* Filter Strip */}
        <div className="px-4 md:px-6 py-2 bg-surface-container-low border-b border-[#BFC1B7] flex flex-wrap items-center justify-between gap-2 text-xs font-mono shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-white border border-[#BFC1B7] px-2 py-0.5 rounded">YEAR: 2026</span>
            <span className="bg-white border border-[#BFC1B7] px-2 py-0.5 rounded">REGION: SUMATRA &amp; KALIMANTAN</span>
            <span className="bg-white border border-[#BFC1B7] px-2 py-0.5 rounded">RESOLUTION: 10-DAY COMPOSITE</span>
          </div>
          <button className="bg-white border border-[#BFC1B7] hover:bg-surface px-3 py-1 rounded font-semibold flex items-center gap-1 shadow-xs">
            <span className="material-symbols-outlined text-xs">download</span>
            <span>EXPORT CSV</span>
          </button>
        </div>

        {/* Grid Body */}
        <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column */}
          <div className="lg:col-span-8 space-y-4">
            {/* Historical Chart */}
            <div className="bg-white border border-[#BFC1B7] rounded p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-center border-b border-[#BFC1B7] pb-2 font-mono">
                <span className="text-xs font-bold uppercase text-on-surface">HISTORICAL FIRE ACTIVITY OVER TIME (FRP MW)</span>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-[#2F80FA] font-bold">Harmonized</span>
                  <span className="text-[#F0A000]">VIIRS 375m</span>
                  <span className="text-[#65675E]">MODIS 1km</span>
                </div>
              </div>
              <div className="relative w-full h-56">
                <svg className="w-full h-full" viewBox="0 0 700 200">
                  <line x1="0" y1="40" x2="700" y2="40" stroke="#f4f3ed"/>
                  <line x1="0" y1="90" x2="700" y2="90" stroke="#f4f3ed"/>
                  <line x1="0" y1="140" x2="700" y2="140" stroke="#f4f3ed"/>
                  <rect x="450" y="0" width="220" height="170" fill="#F0A000" fillOpacity="0.06"/>
                  <text x="460" y="20" fill="#825500" fontSize="9" fontFamily="JetBrains Mono" fontWeight="bold">PEAK PEAT FIRE SEASON</text>
                  <path d="M 20 160 L 120 155 L 220 145 L 320 135 L 420 110 L 520 60 L 620 75" fill="none" stroke="#65675E" strokeDasharray="3 3" strokeWidth="1.5"/>
                  <path d="M 20 150 L 120 145 L 220 130 L 320 115 L 420 80 L 520 30 L 620 50" fill="none" stroke="#F0A000" strokeDasharray="4 4" strokeWidth="2"/>
                  <path d="M 20 155 L 120 148 L 220 135 L 320 122 L 420 90 L 520 40 L 620 60" fill="none" stroke="#2F80FA" strokeWidth="2.5"/>
                  <circle cx="520" cy="40" r="5" fill="#2F80FA" stroke="#fff" strokeWidth="2"/>
                </svg>
              </div>
              <div className="flex justify-between font-mono text-[10px] text-outline pt-1 border-t border-[#F4F3ED]">
                <span>JAN</span><span>MAR</span><span>MAY</span><span>JUL</span>
                <span className="text-[#2F80FA] font-bold">SEP (PEAK)</span><span>NOV</span>
              </div>
            </div>

            {/* Sub-deck */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-[#BFC1B7] rounded p-3 shadow-sm space-y-2">
                <span className="text-xs font-bold uppercase text-on-surface block border-b border-[#BFC1B7] pb-1">TOP ACTIVE REGIONS (DAOPS RANK)</span>
                <div className="divide-y divide-[#F4F3ED] text-xs font-mono">
                  {[
                    { rank: "01", name: "CENTRAL KALIMANTAN", count: "4,820", level: "CRITICAL", color: "#F54E00" },
                    { rank: "02", name: "SOUTH SUMATRA", count: "3,140", level: "ELEVATED", color: "#F0A000" },
                    { rank: "03", name: "RIAU", count: "2,290", level: "ELEVATED", color: "#F0A000" },
                  ].map((r) => (
                    <div key={r.rank} className="py-1.5 flex justify-between">
                      <span>{r.rank} {r.name}</span>
                      <span className="font-bold" style={{ color: r.color }}>{r.count} [{r.level}]</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-[#BFC1B7] rounded p-3 shadow-sm space-y-2">
                <span className="text-xs font-bold uppercase text-on-surface block border-b border-[#BFC1B7] pb-1">DEDUPLICATION EFFICIENCY</span>
                <div className="grid grid-cols-3 gap-2 font-mono text-center">
                  {[
                    { label: "MODIS", value: "1,842", color: "#2F80FA" },
                    { label: "VIIRS", value: "2,421", color: "#F0A000" },
                    { label: "DEDUPED", value: "-73%", color: "#6AA84F" },
                  ].map((d) => (
                    <div key={d.label} className="p-1 bg-surface-container rounded">
                      <div className="text-[9px] text-outline">{d.label}</div>
                      <div className="text-sm font-bold" style={{ color: d.color }}>{d.value}</div>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-outline font-mono text-center pt-1">
                  Merged into 1,129 non-redundant episode clusters
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-4 space-y-4">
            {/* Pattern & Climate */}
            <div className="bg-white border border-[#BFC1B7] rounded p-4 shadow-sm space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface block border-b border-[#BFC1B7] pb-1">PATTERN &amp; CLIMATE SUMMARY</span>
              <div className="space-y-2 font-mono text-xs">
                <div>
                  <div className="text-[10px] text-outline">PEAK WINDOW</div>
                  <div className="font-bold text-on-surface">SEPTEMBER–OCTOBER</div>
                </div>
                <div>
                  <div className="text-[10px] text-outline">CURRENT TREND</div>
                  <div className="font-bold text-tertiary flex items-center gap-1">
                    <span>INCREASING</span>
                    <span className="text-[10px] bg-tertiary/10 px-1 rounded">+12.4% vs 24h</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-outline">PEAT SOIL MOISTURE DEFICIT</div>
                  <div className="font-bold text-on-surface">HIGH (ENSO-DRIVEN)</div>
                </div>
                <div>
                  <div className="text-[10px] text-outline">FIRE WEATHER INDEX</div>
                  <div className="font-bold text-[#F54E00]">EXTREME (FWI &gt; 30)</div>
                </div>
              </div>
            </div>

            {/* Model Anomalies */}
            <div className="bg-white border border-[#BFC1B7] rounded p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-center border-b border-[#BFC1B7] pb-1 font-mono">
                <span className="text-xs font-bold text-on-surface">MODEL ANOMALIES</span>
                <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
              </div>
              <div className="p-2.5 bg-surface-container-low border border-[#F54E00] rounded space-y-1">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="bg-[#F54E00] text-white px-1 font-bold rounded">HIGH ANOMALY</span>
                  <span className="text-outline">18m ago</span>
                </div>
                <div className="text-xs font-bold text-on-surface">CENTRAL KALIMANTAN (CAL-04)</div>
                <p className="text-[11px] text-on-surface-variant">Sub-surface peat burn. Above diurnal cycle.</p>
                <Link
                  href="/activity/FA-001"
                  className="text-xs font-bold text-secondary-container hover:underline block pt-1"
                >
                  INSPECT #FA-001 →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </WorkstationLayout>
  );
}
