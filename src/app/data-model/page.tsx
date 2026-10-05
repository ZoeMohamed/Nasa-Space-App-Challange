"use client";

import { useState } from "react";
import WorkstationLayout from "@/components/layout/WorkstationLayout";

const JSON_RESPONSE = `{
  "status": "success",
  "timestamp": "2026-10-05T08:53:14Z",
  "count": 1248,
  "data": {
    "activity_id": "FA-001",
    "cluster_ref": "CAL-04-PLK",
    "location": {
      "latitude": -2.2104,
      "longitude": 113.9213,
      "province": "Central Kalimantan",
      "district": "Palangka Raya Peat Basin"
    },
    "severity": "HIGH",
    "confidence": 0.94,
    "radiative_power_mw": 142.6,
    "sources": ["MODIS", "VIIRS"],
    "persistence_hours": 72
  }
}`;

export default function DataModelPage() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON_RESPONSE);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <WorkstationLayout activeTab="DATA / MODEL">
      <div className="flex-1 bg-surface-container-lowest p-4 md:p-6 overflow-y-auto custom-scroll space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-3 border-b border-outline-variant">
          <div>
            <div className="font-mono text-[10px] text-on-surface-variant">
              SYSTEM TELEMETRY // REST API v1.0 // DBSCAN-GP v1.0.4
            </div>
            <h1 className="text-2xl font-bold text-on-surface tracking-tight">DATA / MODEL PIPELINE</h1>
            <p className="text-xs text-on-surface-variant max-w-2xl mt-0.5">
              Monitor satellite data sources, spatio-temporal harmonization engine, and FastAPI endpoints.
            </p>
          </div>
          <div>
            <span className="px-2.5 py-1 bg-[#d8e8d0] text-[#1e4612] font-mono text-xs font-bold rounded border border-[#6AA84F]">
              ALL SERVICES OPERATIONAL
            </span>
          </div>
        </div>

        {/* End-to-End Pipeline */}
        <section className="space-y-2">
          <span className="text-xs font-bold text-on-surface uppercase tracking-wide flex items-center gap-1.5">
            <span className="w-2 h-2 bg-secondary-container" />
            END-TO-END PROCESSING PIPELINE
          </span>
          <div className="bg-surface-container-low border border-outline-variant rounded p-4 overflow-x-auto">
            <div className="flex items-center min-w-[860px] justify-between text-xs font-mono">
              {/* Ingestion */}
              <div className="w-48 bg-white border border-secondary-container rounded p-2.5 shadow-xs space-y-1">
                <div className="flex justify-between font-bold">
                  <span>MODIS + VIIRS</span>
                  <span className="text-[#6AA84F]">LIVE</span>
                </div>
                <div className="text-[10px] text-outline">NASA FIRMS NRT Ingestion</div>
                <div className="text-[10px] font-semibold text-on-surface">4,263 raw thermal hits/10d</div>
              </div>
              <span className="material-symbols-outlined text-outline">arrow_forward</span>
              {/* Harmonization */}
              <div className="w-52 bg-white border border-primary-container rounded p-2.5 shadow-xs space-y-1">
                <div className="flex justify-between font-bold">
                  <span>DBSCAN-GP ML</span>
                  <span className="text-primary">ACTIVE</span>
                </div>
                <div className="text-[10px] text-outline">Spatio-Temporal Clustering</div>
                <div className="text-[10px] font-semibold text-on-surface">98.2% Cross-Sensor Align</div>
              </div>
              <span className="material-symbols-outlined text-outline">arrow_forward</span>
              {/* Clean Episodes */}
              <div className="w-48 bg-white border border-[#6AA84F] rounded p-2.5 shadow-xs space-y-1">
                <div className="flex justify-between font-bold">
                  <span>CLEAN EPISODES</span>
                  <span className="text-[#6AA84F]">1,129</span>
                </div>
                <div className="text-[10px] text-outline">Non-Redundant Events</div>
                <div className="text-[10px] font-semibold text-tertiary">-73.4% Duplication</div>
              </div>
              <span className="material-symbols-outlined text-outline">arrow_forward</span>
              {/* API Gateway */}
              <div className="w-48 bg-white border border-[#6AA84F] rounded p-2.5 shadow-xs space-y-1">
                <div className="flex justify-between font-bold">
                  <span>FASTAPI REST</span>
                  <span className="text-[#6AA84F]">16ms</span>
                </div>
                <div className="text-[10px] text-outline">GeoJSON / JSON Payloads</div>
                <div className="text-[10px] font-semibold text-on-surface">Uptime: 99.98%</div>
              </div>
            </div>
          </div>
        </section>

        {/* API Inspector */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface uppercase tracking-wide flex items-center gap-1.5">
              <span className="w-2 h-2 bg-secondary-container" />
              REST ENDPOINT INSPECTOR (/api/fire-activities)
            </span>
            <span className="font-mono text-[10px] text-outline">OPENAPI 3.1</span>
          </div>
          <div className="bg-white border border-outline-variant rounded p-4 shadow-sm space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-outline-variant font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-secondary-container text-white font-bold rounded text-[10px]">GET</span>
                <span className="font-semibold text-on-surface">/api/fire-activities?region=kalimantan&amp;limit=1</span>
                <span className="px-1.5 rounded bg-[#d8e8d0] text-[#1e4612] text-[10px] font-bold">200 OK</span>
              </div>
              <button
                onClick={handleCopy}
                className="px-2.5 py-1 bg-surface-container rounded text-[11px] font-semibold hover:bg-surface-container-high flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs">content_copy</span>
                <span>{copied ? "COPIED" : "COPY JSON"}</span>
              </button>
            </div>
            <div className="bg-surface-container-low p-3 rounded font-mono text-xs overflow-x-auto text-on-surface">
              <pre>{JSON_RESPONSE}</pre>
            </div>
          </div>
        </section>

        {/* Service Health Grid */}
        <section className="space-y-2">
          <span className="text-xs font-bold text-on-surface uppercase tracking-wide flex items-center gap-1.5">
            <span className="w-2 h-2 bg-[#6AA84F]" />
            SERVICE HEALTH MATRIX
          </span>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-[10px]">
            {[
              { name: "NASA FIRMS API", status: "LIVE", latency: "38ms", ok: true },
              { name: "MODIS NRT Feed", status: "ACTIVE", latency: "—", ok: true },
              { name: "VIIRS NRT Feed", status: "ACTIVE", latency: "—", ok: true },
              { name: "DBSCAN-GP Cluster", status: "PROCESSING", latency: "1.2s", ok: true },
              { name: "Harmony Engine", status: "ONLINE", latency: "88ms", ok: true },
              { name: "FastAPI Gateway", status: "NOMINAL", latency: "16ms", ok: true },
              { name: "GeoJSON Export", status: "READY", latency: "—", ok: true },
              { name: "DAOPS Uplink", status: "SECURED", latency: "—", ok: true },
            ].map((svc) => (
              <div key={svc.name} className="bg-white border border-outline-variant rounded p-2.5 space-y-1">
                <div className="font-semibold text-on-surface truncate">{svc.name}</div>
                <div className="flex items-center justify-between">
                  <span className={svc.ok ? "text-[#6AA84F] font-bold" : "text-tertiary font-bold"}>{svc.status}</span>
                  <span className="text-outline">{svc.latency}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </WorkstationLayout>
  );
}
