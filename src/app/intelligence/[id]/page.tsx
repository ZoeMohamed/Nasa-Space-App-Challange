import Link from "next/link";
import WorkstationLayout from "@/components/layout/WorkstationLayout";

export const metadata = {
  title: "FIRESIGHT — AI Intelligence Dossier #FA-001",
};

export default function IntelligenceDossierPage() {
  return (
    <WorkstationLayout activeTab="ACTIVITIES">
      <div className="flex-1 overflow-y-auto bg-surface-container-lowest custom-scroll p-4 md:p-6 space-y-4">
        {/* Breadcrumb Header */}
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant">
          <Link
            href="/activity/FA-001"
            className="px-3 py-1 bg-surface-container border border-outline-variant hover:bg-surface-container-high rounded text-xs font-semibold flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>BACK TO EPISODE #FA-001</span>
          </Link>
          <span className="font-mono text-[10px] text-outline font-semibold">
            AI FIRE INTELLIGENCE SYNTHESIS // EPISODE DOSSIER #FA-001
          </span>
        </div>

        {/* Question Banner */}
        <div className="p-4 bg-[#FDFDF8] border-l-4 border-l-secondary-container border border-outline-variant rounded shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase text-secondary-container font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">psychology</span>
              <span>OPERATIONAL INQUIRY</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-on-surface tracking-tight mt-0.5">
              &ldquo;WHY SHOULD THIS AREA BE PRIORITIZED?&rdquo;
            </h1>
            <p className="text-xs text-on-surface-variant font-mono mt-0.5">
              Palangka Raya Peat Basin (CAL-04) — Lat: -2.2104°, Lng: 113.9213°
            </p>
          </div>
          <div className="px-3 py-1.5 bg-surface-container border border-outline-variant rounded font-mono text-right shrink-0">
            <div className="text-[9px] text-outline">PRIORITY RANK</div>
            <div className="text-lg font-bold text-[#F54E00]">#01 OF 28</div>
          </div>
        </div>

        {/* Synthesis Statement */}
        <div className="bg-surface-container-low border border-outline-variant rounded p-4 font-sans text-sm md:text-base leading-relaxed text-on-surface shadow-xs">
          &ldquo;The system detected persistent fire activity across multiple satellite observations. Multi-sensor temporal clustering indicates an escalating subsurface smoldering event in degraded ombrotrophic peatland with rapid thermal radiative acceleration.&rdquo;
        </div>

        {/* 4 Proof Points */}
        <div className="space-y-2">
          {[
            {
              n: 1,
              heading: "MODIS observations confirm continuous thermal anomalies",
              body: " across multiple satellite passes (Terra and Aqua MWIR B21/B22 band saturation at 4µm window).",
            },
            {
              n: 2,
              heading: "VIIRS observations corroborate high-resolution",
              body: " (375m I-Band I04) active flame fronts advancing laterally along drainage canal margins.",
            },
            {
              n: 3,
              heading: "Persistent detections across multiple timestamps spanning >72 hours",
              body: " indicate sustained underground peat seam ignition rather than surface burn.",
            },
            {
              n: 4,
              heading: "Increasing activity pattern:",
              body: " Fire Radiative Power (FRP) has escalated by ",
              highlight: "+38%",
              tail: " within the trailing 24-hour cycle.",
            },
          ].map((item) => (
            <div key={item.n} className="flex items-start gap-3 p-3 bg-white border border-outline-variant rounded text-xs">
              <span className="w-5 h-5 rounded-full bg-surface-container-highest flex items-center justify-center font-mono font-bold shrink-0">
                {item.n}
              </span>
              <div>
                <span className="font-bold text-on-surface">{item.heading}</span>
                {item.body}
                {item.highlight && (
                  <span className="font-bold text-[#F54E00]">{item.highlight}</span>
                )}
                {item.tail}
              </div>
            </div>
          ))}
        </div>

        {/* Confidence Bar & Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Confidence */}
          <div className="bg-white border border-outline-variant rounded p-4 shadow-sm space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-xs uppercase text-on-surface">MODEL CONFIDENCE SCORE</span>
              <span className="text-2xl font-bold font-mono text-[#6AA84F]">94%</span>
            </div>
            <div className="w-full h-3 bg-surface-container-high rounded overflow-hidden relative border border-outline-variant">
              <div className="bg-secondary-container h-full" style={{ width: "94%" }} />
              <div className="absolute top-0 bottom-0 left-[90%] w-0.5 bg-[#F54E00]" title="Threshold 90%" />
            </div>
            <div className="flex justify-between font-mono text-[10px] text-outline">
              <span>BASELINE 0%</span>
              <span className="text-[#F54E00] font-bold">90% ACTION THRESHOLD</span>
              <span>100%</span>
            </div>
          </div>

          {/* DAOPS Action */}
          <div className="bg-white border border-outline-variant rounded p-4 shadow-sm flex flex-col justify-between space-y-2">
            <span className="font-bold text-xs uppercase text-on-surface">DAOPS ESCALATION ACTION</span>
            <p className="text-xs text-on-surface-variant">
              Authoritative multi-sensor convergence reached. Ready to deploy ground suppression teams.
            </p>
            <div className="flex gap-2">
              <Link
                href="/map"
                className="flex-1 bg-secondary-container text-white py-2 rounded text-xs font-bold hover:brightness-110 text-center"
              >
                VIEW ON MAP
              </Link>
              <button className="flex-1 bg-[#F54E00] text-white py-2 rounded text-xs font-bold hover:brightness-110">
                DISPATCH DAOFS
              </button>
            </div>
          </div>
        </div>
      </div>
    </WorkstationLayout>
  );
}
