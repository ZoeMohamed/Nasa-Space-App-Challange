"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadAlertPrefs } from "../lib/alertPrefs";
import { getOrCreateSubmitterToken } from "../lib/submitterToken";
import { REPORT_STATUS_LABEL } from "../lib/reportStatus";
import type { CommunityReport, HotspotApiResponse, HotspotMarker, ReportsListResponse } from "@/types";

const SEVERITY_RANK: Record<HotspotMarker["severity"], number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

type FeedItem =
  | { kind: "hotspot"; id: string; title: string; subtitle: string; time: string; href: string }
  | { kind: "report"; id: string; title: string; subtitle: string; time: string; href: string };

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} jam lalu`;
  return `${Math.round(diffH / 24)} hari lalu`;
}

export default function NotifikasiPage() {
  const [markers, setMarkers] = useState<HotspotMarker[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [activeTab, setActiveTab] = useState<"feed" | "push_preview">("feed");
  const [markedSafe, setMarkedSafe] = useState(false);
  const prefs = useMemo(() => loadAlertPrefs(), []);

  useEffect(() => {
    let cancelled = false;
    const token = getOrCreateSubmitterToken();

    Promise.all([
      fetch("/api/hotspots", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { markers: [] })),
      token
        ? fetch(`/api/reports?submitterToken=${encodeURIComponent(token)}`, { cache: "no-store" }).then((r) =>
            r.ok ? r.json() : { reports: [] }
          )
        : Promise.resolve({ reports: [] }),
    ])
      .then(([hotspotBody, reportBody]: [HotspotApiResponse, ReportsListResponse]) => {
        if (cancelled) return;
        setMarkers(hotspotBody.markers ?? []);
        setReports(reportBody.reports ?? []);
        setState("loaded");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const items: FeedItem[] = useMemo(() => {
    const minRank = SEVERITY_RANK[prefs.minSeverity];
    const hotspotItems: FeedItem[] = markers
      .filter((m) => SEVERITY_RANK[m.severity] >= minRank)
      .filter((m) => m.acquiredAt)
      .sort((a, b) => new Date(b.acquiredAt!).getTime() - new Date(a.acquiredAt!).getTime())
      .slice(0, 15)
      .map((m) => ({
        kind: "hotspot" as const,
        id: m.id,
        title: `Titik api ${m.severity.toLowerCase()} — ${m.label}`,
        subtitle: `${m.sensor ?? m.satellite ?? "Sensor"} · FRP ${typeof m.frp === "number" ? m.frp.toFixed(1) : "—"} MW`,
        time: formatRelative(m.acquiredAt!),
        href: `/community/alert/${m.id}`,
      }));

    const reportItems: FeedItem[] = prefs.notifyReportUpdates
      ? reports
          .filter((r) => r.status !== "submitted")
          .map((r) => ({
            kind: "report" as const,
            id: r.id,
            title: `Laporan Anda: ${REPORT_STATUS_LABEL[r.status]}`,
            subtitle: r.description,
            time: formatRelative(r.reviewedAt ?? r.createdAt),
            href: `/community/reports/${r.id}`,
          }))
      : [];

    return [...reportItems, ...hotspotItems];
  }, [markers, reports, prefs]);

  return (
    <div className="max-w-xl mx-auto space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-[#123027]">Notifikasi</h1>
          <p className="text-xs text-[var(--community-ink-muted)] mt-0.5">
            Peringatan deteksi satelit &amp; perkembangan laporanmu.
          </p>
        </div>
        <Link
          href="/community/pengaturan"
          className="text-xs font-bold text-[var(--community-accent)] bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-full border border-emerald-200 transition"
        >
          Atur Filter
        </Link>
      </div>

      {/* Tab Switcher: In-App Feed vs Figma Push Notification Preview */}
      <div className="flex rounded-2xl bg-gray-100 p-1 border border-gray-200 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab("feed")}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeTab === "feed"
              ? "bg-white text-[#123027] shadow-xs"
              : "text-[var(--community-ink-muted)] hover:text-[#123027]"
          }`}
        >
          Pemberitahuan ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("push_preview")}
          className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "push_preview"
              ? "bg-[#075640] text-white shadow-xs"
              : "text-[var(--community-ink-muted)] hover:text-[#123027]"
          }`}
        >
          <span className="material-symbols-outlined text-[15px]">smartphone</span>
          <span>Pratinjau Layar Kunci HP</span>
        </button>
      </div>

      {/* Tab 1: Normal In-App Notifications Feed */}
      {activeTab === "feed" && (
        <div className="space-y-3">
          {state === "loading" && (
            <p className="text-xs text-[var(--community-ink-muted)] py-6 text-center animate-pulse">
              Memuat notifikasi…
            </p>
          )}

          {state === "error" && (
            <p className="text-xs rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
              Gagal memuat notifikasi.
            </p>
          )}

          {state === "loaded" && items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--community-border)] bg-white p-6 text-center space-y-2">
              <span className="material-symbols-outlined text-[32px] text-emerald-700">notifications_none</span>
              <p className="text-xs text-[var(--community-ink-muted)]">
                Tidak ada peringatan baru dalam radius pantau Anda saat ini.
              </p>
            </div>
          )}

          {state === "loaded" && items.length > 0 && (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    href={item.href}
                    className="block rounded-2xl border border-[var(--community-border)] bg-white p-3.5 hover:border-emerald-300 transition shadow-xs"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          item.kind === "report" ? "bg-sky-50 text-sky-700" : "bg-red-50 text-red-600"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {item.kind === "report" ? "assignment_turned_in" : "local_fire_department"}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[#123027] truncate">{item.title}</p>
                        <p className="text-[11px] text-[var(--community-ink-muted)] truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                      <span className="text-[10px] text-[var(--community-ink-muted)] shrink-0 font-medium">
                        {item.time}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tab 2: Figma Screen 02 - Push Notification Mockup on Smartphone Screen */}
      {activeTab === "push_preview" && (
        <div className="rounded-3xl bg-[#091b15] text-white p-6 shadow-2xl space-y-6 relative overflow-hidden border border-emerald-950">
          {/* Status Bar */}
          <div className="flex items-center justify-between text-xs text-white/60 font-mono">
            <span>Telkomsel</span>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">wifi</span>
              <span className="material-symbols-outlined text-[14px]">battery_full</span>
            </div>
          </div>

          {/* Big Lockscreen Clock */}
          <div className="text-center pt-2 pb-4">
            <p className="text-xs text-white/70 font-medium">Sabtu, 17 Oktober</p>
            <h2 className="text-5xl font-light tracking-tight text-white mt-1">07.14</h2>
          </div>

          {/* Notifications Stack (Figma Screen 02) */}
          <div className="space-y-3">
            {/* Notification 1: Titik Api Dekat Lokasimu */}
            <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-4 space-y-2.5 text-xs shadow-lg">
              <div className="flex items-center justify-between text-[11px] text-white/70">
                <div className="flex items-center gap-1.5 font-bold tracking-wide text-white">
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-red-600 text-[10px] text-white">🔥</span>
                  <span>AGNIBHŪMI</span>
                  <span className="text-rose-400 font-semibold">· Peringatan</span>
                </div>
                <span>sekarang</span>
              </div>

              <div>
                <h3 className="font-bold text-white text-[13px]">
                  Titik api 2,4 km dari lokasimu
                </h3>
                <p className="text-white/80 text-[11px] mt-1 leading-relaxed">
                  Terdeteksi VIIRS dan dikonfirmasi petugas di timur laut Desa Bahaur. Angin mengarah ke pemukiman. Ketuk untuk panduan keselamatan.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Link
                  href="/community/alert/demo-bahaur-01"
                  className="flex-1 py-2 text-center rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-[11px] transition active:scale-95"
                >
                  Lihat panduan
                </Link>
                <button
                  type="button"
                  onClick={() => setMarkedSafe(!markedSafe)}
                  className={`flex-1 py-2 text-center rounded-xl text-[11px] font-bold transition active:scale-95 ${
                    markedSafe
                      ? "bg-emerald-600 text-white"
                      : "bg-white/10 hover:bg-white/15 text-white/90"
                  }`}
                >
                  {markedSafe ? "✓ Anda Aman" : "Saya aman"}
                </button>
              </div>
            </div>

            {/* Notification 2: Kualitas Udara */}
            <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-3.5 space-y-1 text-xs shadow-lg">
              <div className="flex items-center justify-between text-[11px] text-white/70">
                <div className="flex items-center gap-1.5 font-bold tracking-wide text-white">
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-emerald-600 text-[10px] text-white">🍃</span>
                  <span>AGNIBHŪMI</span>
                </div>
                <span>06.30</span>
              </div>
              <h3 className="font-bold text-white text-xs">
                Kualitas udara tidak sehat (ISPU 168)
              </h3>
              <p className="text-white/70 text-[11px] leading-relaxed">
                Kurangi aktivitas luar ruang dan gunakan masker N95, terutama untuk anak dan lansia.
              </p>
            </div>

            {/* Notification 3: Laporan Warga Divalidasi */}
            <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-3.5 space-y-1 text-xs shadow-lg">
              <div className="flex items-center justify-between text-[11px] text-white/70">
                <div className="flex items-center gap-1.5 font-bold tracking-wide text-white">
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-blue-600 text-[10px] text-white">📋</span>
                  <span>AGNIBHŪMI</span>
                </div>
                <span>kemarin</span>
              </div>
              <h3 className="font-bold text-white text-xs">
                Laporan CR-024 sedang divalidasi petugas
              </h3>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
