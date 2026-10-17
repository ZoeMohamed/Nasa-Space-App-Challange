"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import { FIRE_ACTIVITIES } from "@/lib/data";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

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
      <div className="max-w-[1400px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <div className="text-sm text-gray-500 font-medium mb-1">Harmonized detections</div>
            <h1 className="text-3xl font-bold text-gray-900">Fire Activities</h1>
            <p className="text-sm text-gray-500 max-w-2xl mt-1">
              Jelajahi aktivitas kebakaran dari observasi MODIS dan VIIRS yang diharmonisasi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/activity/FA-001")}
            className="h-9 px-4 rounded-lg bg-gray-900 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
          >
            Buka detail aktivitas
          </button>
        </div>

        {/* Filter Toolbar */}
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative w-full sm:w-72">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">
                search
              </span>
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Cari aktivitas atau lokasi…"
                className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10"
              />
            </div>
            <button
              type="button"
              onClick={() => setFilterText("")}
              className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Bersihkan
            </button>
          </div>
          <span className="text-xs font-medium text-gray-500">{filtered.length} dari {FIRE_ACTIVITIES.length} aktivitas demo</span>
        </Card>

        {/* Table */}
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10 text-[10px] uppercase text-gray-500 tracking-wider font-bold">
              <tr>
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Lokasi / Sektor</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Confidence</th>
                <th className="py-3 px-4">Deteksi terakhir</th>
                <th className="py-3 px-4">Sumber</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {filtered.map((row) => {
                const isSelected = selectedRow === row.id;
                return (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedRow(row.id)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-emerald-50 border-l-4 border-l-emerald-600"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700">{row.id}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-gray-900">{row.location}</div>
                      <div className="text-[10px] text-gray-500 font-mono">{row.sector}</div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge tone={row.severity.includes("HIGH") ? "high" : "medium"}>
                        {row.severity}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 font-mono text-gray-700">
                        <span>{row.conf}%</span>
                        <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${row.conf}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-gray-700">
                      <div>{row.last}</div>
                      <div className="text-[10px] text-orange-600 font-bold">{row.ago}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-1.5 py-0.5 bg-gray-900 text-white text-[10px] font-mono font-semibold rounded">
                        {row.sensors}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/activity/${row.id}`);
                        }}
                        className="px-2.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-semibold text-blue-700 inline-flex items-center gap-0.5"
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
        </Card>

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between text-xs">
          <span className="text-[11px] text-gray-500">
            Menampilkan 1–{filtered.length} dari {FIRE_ACTIVITIES.length} aktivitas demo
          </span>
          <div className="flex items-center gap-1 text-xs">
            <button className="w-7 h-7 flex items-center justify-center bg-emerald-700 text-white font-bold rounded-lg">1</button>
            <button className="w-7 h-7 flex items-center justify-center bg-white border border-gray-200 rounded-lg">2</button>
            <button className="w-7 h-7 flex items-center justify-center bg-white border border-gray-200 rounded-lg">3</button>
            <button
              onClick={() => router.push("/activity/FA-001")}
              className="ml-3 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg font-semibold text-orange-700"
            >
              Flag untuk dispatch
            </button>
          </div>
        </div>
      </div>
    </WorkstationLayout>
  );
}
