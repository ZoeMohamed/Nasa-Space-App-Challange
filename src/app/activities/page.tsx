"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import { FIRE_ACTIVITIES } from "@/lib/data";

export default function FireActivitiesPage() {
  const router = useRouter();
  const [filterText, setFilterText] = useState("");
  const [selectedRow, setSelectedRow] = useState<string | null>(null);

  const filtered = FIRE_ACTIVITIES.filter(
    (r) =>
      r.id.toLowerCase().includes(filterText.toLowerCase()) ||
      r.location.toLowerCase().includes(filterText.toLowerCase()) ||
      r.sector.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <WorkstationLayout activeTab="ACTIVITIES">
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="px-4 md:px-6 py-3 border-b border-outline-variant bg-surface-container-lowest flex flex-wrap justify-between items-end gap-3 shrink-0">
          <div>
            <div className="font-mono text-[10px] text-on-surface-variant tracking-wider uppercase">
              HARMONIZED DETECTIONS // MODIS + VIIRS NRT
            </div>
            <h1 className="text-2xl font-bold text-on-surface tracking-tight mt-0.5">
              FIRE ACTIVITIES
            </h1>
            <p className="text-xs text-on-surface-variant max-w-2xl mt-0.5">
              Browse fire activity episodes generated from harmonized MODIS and
              VIIRS observations across the Indonesian archipelago.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-surface-container-low border border-outline-variant rounded flex flex-col">
              <span className="text-[9px] font-mono text-outline uppercase font-semibold">TOTAL</span>
              <span className="font-mono text-sm font-bold text-on-surface">1,248</span>
            </div>
            <div className="px-3 py-1 bg-[#F54E00]/10 border border-[#F54E00]/40 rounded flex flex-col">
              <span className="text-[9px] font-mono text-tertiary uppercase font-semibold">HIGH SEVERITY</span>
              <span className="font-mono text-sm font-bold text-[#F54E00]">312</span>
            </div>
            <div className="px-3 py-1 bg-surface-container-low border border-outline-variant rounded flex flex-col">
              <span className="text-[9px] font-mono text-outline uppercase font-semibold">AVG CONF</span>
              <span className="font-mono text-sm font-bold text-secondary-container">89.4%</span>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="px-4 py-2 bg-surface-container border-b border-outline-variant flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-sm text-outline">
                search
              </span>
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Search activity, sector ID..."
                className="w-full h-7 pl-7 pr-2 text-xs font-mono bg-white border border-outline-variant rounded focus:border-secondary-container focus:outline-none"
              />
            </div>
            <button
              onClick={() => setFilterText("")}
              className="h-7 px-2.5 bg-white border border-outline-variant rounded text-xs font-medium hover:bg-surface-container-high"
            >
              CLEAR
            </button>
            <button className="h-7 px-2.5 bg-white border border-outline-variant rounded text-xs font-medium hover:bg-surface-container-high hidden sm:flex items-center gap-1">
              <span>CONFIDENCE: &gt;80%</span>
              <span className="material-symbols-outlined text-[13px]">arrow_drop_down</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-on-surface-variant font-semibold">
              {filtered.length} OF 1,248 ACTIVITIES
            </span>
            <button
              onClick={() => router.push("/activity/FA-001")}
              className="h-7 px-3 bg-secondary-container text-white rounded text-xs font-semibold hover:brightness-110"
            >
              VIEW #FA-001 DETAIL
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto custom-scroll">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-[#FDFDF8] border-b border-outline-variant z-10 font-mono text-[10px] uppercase text-[#65675E] tracking-wider font-bold">
              <tr>
                <th className="py-2.5 px-3 border-r border-outline-variant/60">ID</th>
                <th className="py-2.5 px-3 border-r border-outline-variant/60">LOCATION / SECTOR</th>
                <th className="py-2.5 px-3 border-r border-outline-variant/60">SEVERITY</th>
                <th className="py-2.5 px-3 border-r border-outline-variant/60">CONFIDENCE</th>
                <th className="py-2.5 px-3 border-r border-outline-variant/60">LAST DETECTED</th>
                <th className="py-2.5 px-3 border-r border-outline-variant/60">SOURCES</th>
                <th className="py-2.5 px-3 border-r border-outline-variant/60">STATUS</th>
                <th className="py-2.5 px-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low text-xs">
              {filtered.map((row) => {
                const isSelected = selectedRow === row.id;
                return (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedRow(row.id)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[#E5E7E0] border-l-4 border-l-secondary-container"
                        : "hover:bg-[#F8F8F2]"
                    }`}
                  >
                    <td className="py-2 px-3 font-mono font-bold text-secondary-container">{row.id}</td>
                    <td className="py-2 px-3">
                      <div className="font-semibold text-on-surface">{row.location}</div>
                      <div className="text-[10px] text-on-surface-variant font-mono">{row.sector}</div>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                        row.severity.includes("HIGH")
                          ? "bg-[#F54E00]/10 border border-[#F54E00] text-[#F54E00]"
                          : "bg-primary-container/20 border border-[#C78500] text-[#633F00]"
                      }`}>
                        {row.severity}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2 font-mono">
                        <span>{row.conf}%</span>
                        <div className="w-12 h-1.5 bg-outline-variant/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-secondary-container rounded-full"
                            style={{ width: `${row.conf}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px]">
                      <div>{row.last}</div>
                      <div className="text-[10px] text-tertiary font-bold">{row.ago}</div>
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 bg-on-surface text-surface text-[10px] font-mono font-semibold rounded">
                        {row.sensors}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6AA84F]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#6AA84F] animate-pulse" />
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/activity/${row.id}`);
                        }}
                        className="px-2 py-1 bg-surface-container-lowest hover:bg-surface border border-outline-variant rounded font-mono text-[10px] font-semibold text-secondary-container inline-flex items-center gap-0.5 shadow-xs"
                      >
                        <span>Inspect</span>
                        <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-2 bg-surface-container-low border-t border-outline-variant flex flex-wrap items-center justify-between text-xs shrink-0">
          <span className="font-mono text-[10px] text-on-surface-variant">
            SHOWING 1–{filtered.length} OF 1,248 ACTIVITIES
          </span>
          <div className="flex items-center gap-1 font-mono text-xs">
            <button className="w-6 h-6 flex items-center justify-center bg-secondary-container text-white font-bold rounded">01</button>
            <button className="w-6 h-6 flex items-center justify-center bg-white border border-outline-variant rounded">02</button>
            <button className="w-6 h-6 flex items-center justify-center bg-white border border-outline-variant rounded">03</button>
            <button
              onClick={() => router.push("/activity/FA-001")}
              className="ml-3 px-3 py-1 bg-white hover:bg-surface-container border border-outline-variant rounded font-bold text-tertiary"
            >
              FLAG FOR DAOPS DISPATCH
            </button>
          </div>
        </div>
      </div>
    </WorkstationLayout>
  );
}
