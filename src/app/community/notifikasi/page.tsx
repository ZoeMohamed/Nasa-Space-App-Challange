"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadAlertPrefs } from "../lib/alertPrefs";
import { getRegionOption, matchesRegion } from "@/lib/filters";
import { formatAdminShort } from "@/lib/adminRegion";
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
  const prefs = useMemo(() => loadAlertPrefs(), []);

  useEffect(() => {
    let cancelled = false;
    const token = getOrCreateSubmitterToken();

    Promise.all([
      // Most recent detections in the user's alert province, picked server-side from ALL detections.
      fetch(
        `/api/hotspots?order=recent&limit=200${getRegionOption(prefs.region).provinsi ? `&province=${encodeURIComponent(getRegionOption(prefs.region).provinsi as string)}` : ""}`,
        { cache: "no-store" }
      ).then((r) => (r.ok ? r.json() : { markers: [] })),
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
  }, [prefs.region]);

  const items: FeedItem[] = useMemo(() => {
    const minRank = SEVERITY_RANK[prefs.minSeverity];
    const alertRegion = getRegionOption(prefs.region);
    const hotspotItems: FeedItem[] = markers
      .filter((m) => matchesRegion(m.admin, alertRegion))
      .filter((m) => SEVERITY_RANK[m.severity] >= minRank)
      .filter((m) => m.acquiredAt)
      .sort((a, b) => new Date(b.acquiredAt!).getTime() - new Date(a.acquiredAt!).getTime())
      .slice(0, 15)
      .map((m) => ({
        kind: "hotspot" as const,
        id: m.id,
        title: `Titik api ${m.severity.toLowerCase()} — ${formatAdminShort(m.admin) ?? m.label}`,
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

  const alertRegion = getRegionOption(prefs.region);
  const severityLabel = { LOW: "Semua tingkat", MEDIUM: "Sedang ke atas", HIGH: "Tinggi saja" }[prefs.minSeverity];

  const feed = (
    <div className="space-y-3">
      {state === "loading" && (
        <p className="text-xs text-[var(--community-ink-muted)] py-6 text-center animate-pulse">Memuat notifikasi…</p>
      )}
      {state === "error" && (
        <p className="text-xs rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700">Gagal memuat notifikasi.</p>
      )}
      {state === "loaded" && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--community-border)] bg-white p-8 text-center space-y-2">
          <span className="material-symbols-outlined text-[32px] text-emerald-700">notifications_none</span>
          <p className="text-sm text-[var(--community-ink-muted)]">
            Tidak ada peringatan baru untuk {alertRegion.label} saat ini.
          </p>
        </div>
      )}
      {state === "loaded" && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <Link
                href={item.href}
                className="block rounded-2xl border border-[var(--community-border)] bg-white p-3.5 md:p-4 hover:border-emerald-300 transition"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-xl ${
                      item.kind === "report" ? "bg-sky-50 text-sky-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {item.kind === "report" ? "assignment_turned_in" : "local_fire_department"}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs md:text-sm font-bold text-[#123027] truncate">{item.title}</p>
                    <p className="text-[11px] md:text-xs text-[var(--community-ink-muted)] truncate mt-0.5">{item.subtitle}</p>
                  </div>
                  <span className="text-[10px] md:text-[11px] text-[var(--community-ink-muted)] shrink-0 font-medium">{item.time}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const now = new Date();
  const lockScreen = (
    <div className="rounded-[2rem] bg-[#091b15] text-white p-5 space-y-5 border border-emerald-950">
      <div className="text-center pt-1">
        <p className="text-xs text-white/70" suppressHydrationWarning>
          {now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" })}
        </p>
        <p className="text-4xl font-light tracking-tight mt-1" suppressHydrationWarning>
          {now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-center text-xs text-white/60 pb-2">Belum ada notifikasi untuk ditampilkan.</p>
      ) : (
        <div className="space-y-2.5">
          {items.slice(0, 3).map((item) => (
            <Link
              key={`lock-${item.kind}-${item.id}`}
              href={item.href}
              className="block rounded-2xl bg-white/10 border border-white/10 p-3 space-y-1 hover:bg-white/15 transition"
            >
              <div className="flex items-center justify-between text-[11px] text-white/70">
                <span className="flex items-center gap-1.5 font-bold text-white">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded ${item.kind === "report" ? "bg-blue-600" : "bg-red-600"}`}
                  >
                    <span className="material-symbols-outlined text-[11px]">
                      {item.kind === "report" ? "assignment" : "local_fire_department"}
                    </span>
                  </span>
                  AGNIBHŪMI
                </span>
                <span>{item.time}</span>
              </div>
              <p className="text-[13px] font-bold leading-snug">{item.title}</p>
              <p className="text-[11px] text-white/75 truncate">{item.subtitle}</p>
            </Link>
          ))}
        </div>
      )}
      <p className="text-[10px] text-white/50 text-center leading-relaxed">
        Pratinjau dari notifikasi di atas. Notifikasi push ke HP belum tersedia di prototipe ini.
      </p>
    </div>
  );

  return (
    <div className="max-w-xl md:max-w-5xl mx-auto space-y-5 animate-fadeIn">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-[#123027]">Notifikasi</h1>
          <p className="text-xs md:text-sm text-[var(--community-ink-muted)] mt-0.5">
            Peringatan deteksi satelit &amp; perkembangan laporanmu.
          </p>
        </div>
        <Link
          href="/community/pengaturan"
          className="md:hidden text-xs font-bold text-[var(--community-accent)] bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-full border border-emerald-200 transition"
        >
          Atur Filter
        </Link>
      </div>

      {/* Mobile: tabs */}
      <div className="md:hidden space-y-4">
        <div className="flex rounded-2xl bg-gray-100 p-1 border border-gray-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab("feed")}
            className={`flex-1 py-2 rounded-xl transition ${activeTab === "feed" ? "bg-white text-[#123027] shadow-xs" : "text-[var(--community-ink-muted)]"}`}
          >
            Pemberitahuan ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("push_preview")}
            className={`flex-1 py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTab === "push_preview" ? "bg-[#075640] text-white shadow-xs" : "text-[var(--community-ink-muted)]"
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">smartphone</span>
            Pratinjau Layar Kunci
          </button>
        </div>
        {activeTab === "feed" ? feed : lockScreen}
      </div>

      {/* Desktop: feed + side panel */}
      <div className="hidden md:grid md:grid-cols-[1fr_340px] md:gap-6 items-start">
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-[#123027]">Pemberitahuan ({items.length})</h2>
          {feed}
        </section>
        <aside className="space-y-4 sticky top-24">
          <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-3">
            <h2 className="text-sm font-bold text-[#123027]">Filter aktif</h2>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--community-ink-muted)]">Wilayah</dt>
                <dd className="font-semibold text-[#123027] text-right">{alertRegion.label}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--community-ink-muted)]">Tingkat titik api</dt>
                <dd className="font-semibold text-[#123027] text-right">{severityLabel}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--community-ink-muted)]">Update laporanku</dt>
                <dd className="font-semibold text-[#123027] text-right">{prefs.notifyReportUpdates ? "Aktif" : "Mati"}</dd>
              </div>
            </dl>
            <Link
              href="/community/pengaturan"
              className="block text-center rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 py-2 text-xs font-bold text-[var(--community-accent)] transition"
            >
              Ubah filter
            </Link>
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-[#123027]">Pratinjau layar kunci HP</h2>
            {lockScreen}
          </div>
        </aside>
      </div>
    </div>
  );
}
