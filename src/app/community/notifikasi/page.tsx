"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadAlertPrefs } from "../lib/alertPrefs";
import { getRegionOption, labelOf, matchesRegion } from "@/lib/filters";
import { formatAdminShort } from "@/lib/adminRegion";
import { getOrCreateSubmitterToken } from "../lib/submitterToken";
import { reportStatusLabel } from "../lib/reportStatus";
import type { CommunityReport, HotspotApiResponse, HotspotMarker, ReportsListResponse } from "@/types";
import { useTranslation, pick, type Language } from "@/lib/i18n/LanguageContext";

const SEVERITY_RANK: Record<HotspotMarker["severity"], number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

type FeedItem =
  | { kind: "hotspot"; id: string; title: string; subtitle: string; time: string; href: string }
  | { kind: "report"; id: string; title: string; subtitle: string; time: string; href: string };

function formatRelative(iso: string, language: Language): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return pick(language, "baru saja", "just now");
  if (diffMin < 60) return pick(language, `${diffMin} menit lalu`, `${diffMin} min ago`);
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return pick(language, `${diffH} jam lalu`, `${diffH} h ago`);
  const days = Math.round(diffH / 24);
  return pick(language, `${days} hari lalu`, `${days} d ago`);
}

const SEVERITY_WORD: Record<HotspotMarker["severity"], readonly [string, string]> = {
  LOW: ["rendah", "low"],
  MEDIUM: ["sedang", "medium"],
  HIGH: ["tinggi", "high"],
};

export default function NotifikasiPage() {
  const { tr, language } = useTranslation();
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
        title: pick(
          language,
          `Titik api ${SEVERITY_WORD[m.severity][0]}. ${formatAdminShort(m.admin) ?? m.label}`,
          `${SEVERITY_WORD[m.severity][1][0].toUpperCase()}${SEVERITY_WORD[m.severity][1].slice(1)} hotspot. ${formatAdminShort(m.admin) ?? m.label}`
        ),
        subtitle: `${m.sensor ?? m.satellite ?? "Sensor"} · FRP ${typeof m.frp === "number" ? m.frp.toFixed(1) : "-"} MW`,
        time: formatRelative(m.acquiredAt!, language),
        href: `/community/alert/${m.id}`,
      }));

    const reportItems: FeedItem[] = prefs.notifyReportUpdates
      ? reports
          .filter((r) => r.status !== "submitted")
          .map((r) => ({
            kind: "report" as const,
            id: r.id,
            title: `${pick(language, "Laporan Anda", "Your report")}: ${reportStatusLabel(r.status, language)}`,
            subtitle: r.description,
            time: formatRelative(r.reviewedAt ?? r.createdAt, language),
            href: `/community/reports/${r.id}`,
          }))
      : [];

    return [...reportItems, ...hotspotItems];
  }, [markers, reports, prefs, language]);

  const alertRegion = getRegionOption(prefs.region);
  const severityLabel = {
    LOW: tr("Semua tingkat", "All levels"),
    MEDIUM: tr("Sedang ke atas", "Medium and above"),
    HIGH: tr("Tinggi saja", "High only"),
  }[prefs.minSeverity];
  const regionLabel = labelOf(alertRegion, language);

  const feed = (
    <div className="space-y-3">
      {state === "loading" && (
        <p className="text-xs text-[var(--community-ink-muted)] py-6 text-center animate-pulse">{tr("Memuat notifikasi…", "Loading notifications…")}</p>
      )}
      {state === "error" && (
        <p className="text-xs rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700">{tr("Gagal memuat notifikasi.", "Failed to load notifications.")}</p>
      )}
      {state === "loaded" && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--community-border)] bg-white p-8 text-center space-y-2">
          <span className="material-symbols-outlined text-[32px] text-emerald-700">notifications_none</span>
          <p className="text-sm text-[var(--community-ink-muted)]">
            {tr(`Tidak ada peringatan baru untuk ${regionLabel} saat ini.`, `No new alerts for ${regionLabel} right now.`)}
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
          {now.toLocaleDateString(language === "en" ? "en-GB" : "id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" })}
        </p>
        <p className="text-4xl font-light tracking-tight mt-1" suppressHydrationWarning>
          {now.toLocaleTimeString(language === "en" ? "en-GB" : "id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-center text-xs text-white/60 pb-2">{tr("Belum ada notifikasi untuk ditampilkan.", "No notifications to show yet.")}</p>
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
        {tr(
          "Pratinjau dari notifikasi di atas. Notifikasi push ke HP belum tersedia di prototipe ini.",
          "A preview of the notifications above. Push notifications to phones aren't available in this prototype yet."
        )}
      </p>
    </div>
  );

  return (
    <div className="max-w-xl md:max-w-5xl mx-auto space-y-5 animate-fadeIn">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-[#123027]">{tr("Notifikasi", "Notifications")}</h1>
          <p className="text-xs md:text-sm text-[var(--community-ink-muted)] mt-0.5">
            {tr("Peringatan deteksi satelit & perkembangan laporanmu.", "Satellite detection alerts & updates on your reports.")}
          </p>
        </div>
        <Link
          href="/community/pengaturan"
          className="md:hidden text-xs font-bold text-[var(--community-accent)] bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-full border border-emerald-200 transition"
        >
          {tr("Atur Filter", "Set Filters")}
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
            {tr("Pemberitahuan", "Alerts")} ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("push_preview")}
            className={`flex-1 py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTab === "push_preview" ? "bg-[#075640] text-white shadow-xs" : "text-[var(--community-ink-muted)]"
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">smartphone</span>
            {tr("Pratinjau Layar Kunci", "Lock Screen Preview")}
          </button>
        </div>
        {activeTab === "feed" ? feed : lockScreen}
      </div>

      {/* Desktop: feed + side panel */}
      <div className="hidden md:grid md:grid-cols-[1fr_340px] md:gap-6 items-start">
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-[#123027]">{tr("Pemberitahuan", "Alerts")} ({items.length})</h2>
          {feed}
        </section>
        <aside className="space-y-4 sticky top-24">
          <div className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-3">
            <h2 className="text-sm font-bold text-[#123027]">{tr("Filter aktif", "Active filters")}</h2>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--community-ink-muted)]">{tr("Wilayah", "Area")}</dt>
                <dd className="font-semibold text-[#123027] text-right">{regionLabel}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--community-ink-muted)]">{tr("Tingkat titik api", "Hotspot level")}</dt>
                <dd className="font-semibold text-[#123027] text-right">{severityLabel}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--community-ink-muted)]">{tr("Update laporanku", "My report updates")}</dt>
                <dd className="font-semibold text-[#123027] text-right">{prefs.notifyReportUpdates ? tr("Aktif", "On") : tr("Mati", "Off")}</dd>
              </div>
            </dl>
            <Link
              href="/community/pengaturan"
              className="block text-center rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 py-2 text-xs font-bold text-[var(--community-accent)] transition"
            >
              {tr("Ubah filter", "Change filters")}
            </Link>
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-[#123027]">{tr("Pratinjau layar kunci HP", "Phone lock screen preview")}</h2>
            {lockScreen}
          </div>
        </aside>
      </div>
    </div>
  );
}
