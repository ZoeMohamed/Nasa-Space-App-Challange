"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import StatTile from "@/components/ui/StatTile";
import { formatAdminFull, placeLabel } from "@/lib/adminRegion";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type {
  CommunityReport,
  HotspotApiResponse,
  HotspotMarker,
  IncidentPriority,
  IncidentStatus,
  IncidentSummary,
  IncidentVerification,
  OperationIncident,
  OperationNotification,
  OperationTeam,
  ReportsListResponse,
} from "@/types";

const PRIORITIES: IncidentPriority[] = ["critical", "high", "medium", "low"];
const VERIFICATIONS: IncidentVerification[] = ["confirmed", "not_confirmed", "needs_more_information"];
const STATUSES: IncidentStatus[] = ["triaging", "assigned", "in_progress", "monitoring", "resolved", "cancelled"];

const LABELS: Record<string, readonly [string, string]> = {
  unassessed: ["Belum dinilai", "Unassessed"],
  critical: ["Kritis", "Critical"],
  high: ["Tinggi", "High"],
  medium: ["Sedang", "Medium"],
  low: ["Rendah", "Low"],
  confirmed: ["Dikonfirmasi", "Confirmed"],
  not_confirmed: ["Tidak terkonfirmasi", "Not confirmed"],
  needs_more_information: ["Perlu informasi", "Needs more information"],
  new: ["Baru", "New"],
  triaging: ["Penelaahan", "Triaging"],
  assigned: ["Ditugaskan", "Assigned"],
  in_progress: ["Dalam penanganan", "In progress"],
  monitoring: ["Pemantauan", "Monitoring"],
  resolved: ["Selesai", "Resolved"],
  cancelled: ["Dibatalkan", "Cancelled"],
  satellite: ["Satelit", "Satellite"],
  citizen: ["Laporan warga", "Citizen report"],
  manual: ["Manual", "Manual"],
  created: ["Insiden dibuat", "Incident created"],
  verification: ["Verifikasi manusia", "Human verification"],
  priority: ["Prioritas manual", "Manual priority"],
  assignment: ["Penugasan tim", "Team assignment"],
  status: ["Perubahan progres", "Progress update"],
};

const PRIORITY_STYLE: Record<IncidentPriority, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-emerald-100 text-emerald-800",
  unassessed: "bg-gray-100 text-gray-600",
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : `${date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`;
}

function apiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const value = body as { error?: unknown; detail?: unknown };
    if (typeof value.error === "string") return value.error;
    if (typeof value.detail === "string") return value.detail;
  }
  return fallback;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) throw new Error(apiError(body, "Permintaan operasi gagal."));
  return body as T;
}

async function fetchDashboardData() {
  const [incidentBody, teamBody, notificationBody, hotspotResult, reportResult] = await Promise.all([
    requestJson<{ incidents: OperationIncident[]; summary: IncidentSummary }>("/api/operations/incidents"),
    requestJson<{ teams: OperationTeam[] }>("/api/operations/teams"),
    requestJson<{ notifications: OperationNotification[] }>("/api/operations/notifications"),
    requestJson<HotspotApiResponse>("/api/hotspots?window=24h&limit=30").catch(() => null),
    requestJson<ReportsListResponse>("/api/reports").catch(() => null),
  ]);
  return { incidentBody, teamBody, notificationBody, hotspotResult, reportResult };
}

function label(value: string, language: "id" | "en"): string {
  const pair = LABELS[value];
  return pair ? pair[language === "en" ? 1 : 0] : value;
}

function sourceDescription(marker: HotspotMarker): string {
  const sensor = marker.sensor ?? "sensor tidak diketahui";
  const acquired = marker.acquiredAt ? formatDate(marker.acquiredAt) : "waktu tidak tersedia";
  return `${sensor} · FRP ${marker.frp.toFixed(1)} MW · ${acquired}. Severity ${marker.severity} adalah sinyal satelit, bukan keputusan prioritas operasional.`;
}

function DecisionForm({
  title,
  choices,
  initialValue,
  buttonLabel,
  reasonPlaceholder,
  disabled = false,
  onSubmit,
}: {
  title: string;
  choices: { value: string; label: string }[];
  initialValue: string;
  buttonLabel: string;
  reasonPlaceholder: string;
  disabled?: boolean;
  onSubmit: (value: string, reason: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value, reason);
      setReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Perubahan gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
      <h4 className="text-xs font-bold text-gray-800">{title}</h4>
      <div className="mt-2 grid gap-2">
        <select
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled || choices.length === 0}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800 outline-none focus:ring-2 focus:ring-emerald-400/30"
        >
          {choices.length === 0 && <option value="">Belum ada pilihan tersedia</option>}
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>{choice.label}</option>
          ))}
        </select>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={2000}
          required
          disabled={disabled}
          rows={2}
          placeholder={reasonPlaceholder}
          className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800 outline-none focus:ring-2 focus:ring-emerald-400/30"
        />
        {error && <p role="alert" className="text-[11px] font-medium text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={disabled || busy || choices.length === 0 || !value || reason.trim().length < 10}
          className="rounded-lg bg-[#075640] px-3 py-2 text-xs font-bold text-white hover:bg-[#06442f] disabled:opacity-50"
        >
          {busy ? "Menyimpan…" : buttonLabel}
        </button>
      </div>
    </form>
  );
}

function TeamForm({ onCreated }: { onCreated: (team: OperationTeam) => void }) {
  const { tr } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError(null);
    try {
      const team = await requestJson<OperationTeam>("/api/operations/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          area: form.get("area"),
          leadName: form.get("leadName"),
          contact: form.get("contact") || undefined,
          availability: "available",
        }),
      });
      onCreated(team);
      formElement.reset();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr("Gagal membuat tim.", "Could not create team."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#cfe3d8] bg-white px-3 py-2 text-xs font-bold text-[#075640] hover:bg-[#eef5f1]">
        <span className="material-symbols-outlined text-[16px]">group_add</span>
        {tr("Tambah tim", "Add team")}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-xl border border-[#cfe3d8] bg-[#f3f9f5] p-3 sm:grid-cols-2 lg:grid-cols-5">
      <input name="name" required minLength={3} maxLength={150} placeholder={tr("Nama tim", "Team name")} className="rounded-lg border border-gray-300 px-3 py-2 text-xs" />
      <input name="area" required minLength={2} maxLength={200} placeholder={tr("Wilayah mandat", "Area of responsibility")} className="rounded-lg border border-gray-300 px-3 py-2 text-xs" />
      <input name="leadName" required minLength={2} maxLength={100} placeholder={tr("Nama ketua", "Team lead")} className="rounded-lg border border-gray-300 px-3 py-2 text-xs" />
      <input name="contact" maxLength={200} placeholder={tr("Kontak (opsional)", "Contact (optional)")} className="rounded-lg border border-gray-300 px-3 py-2 text-xs" />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-[#075640] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? "…" : tr("Simpan", "Save")}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs">{tr("Batal", "Cancel")}</button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600 sm:col-span-2 lg:col-span-5">{error}</p>}
    </form>
  );
}

export default function IncidentsPage() {
  const { tr, language } = useTranslation();
  const [incidents, setIncidents] = useState<OperationIncident[]>([]);
  const [summary, setSummary] = useState<IncidentSummary>({ total: 0, open: 0, criticalHigh: 0, unassigned: 0 });
  const [teams, setTeams] = useState<OperationTeam[]>([]);
  const [notifications, setNotifications] = useState<OperationNotification[]>([]);
  const [hotspots, setHotspots] = useState<HotspotMarker[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OperationIncident | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingSource, setCreatingSource] = useState<string | null>(null);
  const [decisionPending, setDecisionPending] = useState(false);
  const mutationLock = useRef(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { incidentBody, teamBody, notificationBody, hotspotResult, reportResult } = await fetchDashboardData();
      setIncidents(incidentBody.incidents);
      setSummary(incidentBody.summary);
      setTeams(teamBody.teams);
      setNotifications(notificationBody.notifications);
      setHotspots(hotspotResult?.markers ?? []);
      setReports(reportResult?.reports ?? []);
      setSelectedId((current) => current ?? incidentBody.incidents[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal memuat operasi insiden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData()
      .then(({ incidentBody, teamBody, notificationBody, hotspotResult, reportResult }) => {
        setIncidents(incidentBody.incidents);
        setSummary(incidentBody.summary);
        setTeams(teamBody.teams);
        setNotifications(notificationBody.notifications);
        setHotspots(hotspotResult?.markers ?? []);
        setReports(reportResult?.reports ?? []);
        setSelectedId(incidentBody.incidents[0]?.id ?? null);
        setDetailLoading(Boolean(incidentBody.incidents[0]));
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Gagal memuat operasi insiden.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    requestJson<OperationIncident>(`/api/operations/incidents/${selectedId}`, { signal: controller.signal })
      .then(setDetail)
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Gagal memuat detail insiden.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [selectedId]);

  function selectIncident(id: string) {
    if (id !== selectedId) setDetailLoading(true);
    setSelectedId(id);
  }

  const usedSources = useMemo(
    () => new Set(incidents.filter((incident) => incident.sourceId).map((incident) => `${incident.sourceType}:${incident.sourceId}`)),
    [incidents]
  );
  const hotspotCandidates = useMemo(
    () => hotspots.filter((marker) => !usedSources.has(`satellite:${marker.id}`)).slice(0, 6),
    [hotspots, usedSources]
  );
  const reportCandidates = useMemo(
    () => reports.filter((report) => report.status !== "rejected" && !usedSources.has(`citizen:${report.id}`)).slice(0, 6),
    [reports, usedSources]
  );

  function integrateIncident(updated: OperationIncident) {
    setDetail(updated);
    setSelectedId(updated.id);
    setIncidents((current) => {
      const without = current.filter((incident) => incident.id !== updated.id);
      return [updated, ...without];
    });
  }

  async function createFromHotspot(marker: HotspotMarker) {
    setCreatingSource(`satellite:${marker.id}`);
    setError(null);
    try {
      const incident = await requestJson<OperationIncident>("/api/operations/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "satellite",
          sourceId: marker.id,
          sourceSnapshot: {
            sensor: marker.sensor,
            severity: marker.severity,
            frp: marker.frp,
            confidence: marker.confidence,
            acquiredAt: marker.acquiredAt,
            matchStatus: marker.matchStatus,
          },
          title: `Indikasi satelit — ${placeLabel(marker.admin, marker.lat, marker.lng)}`,
          description: sourceDescription(marker),
          lat: marker.lat,
          lon: marker.lng,
          adminLabel: formatAdminFull(marker.admin),
          reason: "Dibuka dari antrean deteksi satelit untuk verifikasi lapangan oleh petugas.",
        }),
      });
      integrateIncident(incident);
      await loadAll();
      setSelectedId(incident.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal membuka insiden satelit.");
    } finally {
      setCreatingSource(null);
    }
  }

  async function createFromReport(report: CommunityReport) {
    setCreatingSource(`citizen:${report.id}`);
    setError(null);
    try {
      const incident = await requestJson<OperationIncident>("/api/operations/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "citizen",
          sourceId: report.id,
          sourceSnapshot: {
            reportStatus: report.status,
            observedAt: report.observedAt,
            satelliteLinkCount: report.satelliteLinks?.length ?? 0,
          },
          title: `Laporan warga — ${placeLabel(report.admin, report.lat, report.lon)}`,
          description: report.description,
          lat: report.lat,
          lon: report.lon,
          adminLabel: formatAdminFull(report.admin),
          reason: "Dibuka dari laporan warga untuk verifikasi dan koordinasi tindak lanjut lapangan.",
        }),
      });
      integrateIncident(incident);
      await loadAll();
      setSelectedId(incident.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal membuka insiden laporan warga.");
    } finally {
      setCreatingSource(null);
    }
  }

  async function mutate(action: string, value: string, reason: string) {
    if (!detail) return;
    if (mutationLock.current) throw new Error("Tunggu keputusan sebelumnya selesai disimpan.");

    mutationLock.current = true;
    setDecisionPending(true);
    try {
      const updated = await requestJson<OperationIncident>(`/api/operations/incidents/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: detail.rowVersion, action, value, reason }),
      });
      integrateIncident(updated);
      const [incidentBody, notificationBody] = await Promise.all([
        requestJson<{ incidents: OperationIncident[]; summary: IncidentSummary }>("/api/operations/incidents"),
        requestJson<{ notifications: OperationNotification[] }>("/api/operations/notifications"),
      ]);
      setIncidents(incidentBody.incidents);
      setSummary(incidentBody.summary);
      setNotifications(notificationBody.notifications);
    } finally {
      mutationLock.current = false;
      setDecisionPending(false);
    }
  }

  return (
    <WorkstationLayout activeTab="Incident Operations">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-[#075640]">{tr("Command & Coordination", "Command & Coordination")}</span>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">{tr("Operasi Insiden", "Incident Operations")}</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              {tr(
                "Ubah indikasi satelit atau laporan warga menjadi insiden yang dapat diverifikasi, diprioritaskan, ditugaskan, dan diaudit.",
                "Turn satellite signals or citizen reports into incidents that can be verified, prioritized, assigned and audited."
              )}
            </p>
          </div>
          <button type="button" onClick={() => void loadAll()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            {tr("Segarkan", "Refresh")}
          </button>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
          <strong>{tr("Akses publik:", "Public access:")}</strong>{" "}
          {tr(
            "Semua pengunjung dapat menjalankan aksi; audit dicatat sebagai Public Operator. ",
            "Every visitor can run actions; the audit trail records Public Operator. "
          )}
          <strong>{tr("Batas keselamatan:", "Safety boundary:")}</strong>{" "}
          {tr(
            "severity/FRP satelit hanya konteks observasi. Sistem tidak otomatis menyatakan kebakaran atau prioritas; keputusan manusia wajib disertai alasan dan masuk ke histori.",
            "satellite severity/FRP is observation context only. The system never auto-declares a fire or priority; human decisions require a reason and are written to history."
          )}
        </div>

        {error && (
          <Card className="flex items-start gap-3 border-red-200 bg-red-50 p-4">
            <span className="material-symbols-outlined text-red-600">error</span>
            <p className="flex-1 text-sm text-red-700">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-xs font-bold text-red-700">{tr("Tutup", "Dismiss")}</button>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile icon="emergency_home" iconTone="blue" label={tr("Total insiden", "Total incidents")} value={loading ? "…" : summary.total} caption={tr("Semua histori operasional", "All operational records")} />
          <StatTile icon="local_fire_department" iconTone="red" label={tr("Masih aktif", "Open")} value={loading ? "…" : summary.open} caption={tr("Belum selesai/dibatalkan", "Not resolved/cancelled")} />
          <StatTile icon="priority_high" iconTone="amber" label={tr("Kritis / tinggi", "Critical / high")} value={loading ? "…" : summary.criticalHigh} caption={tr("Prioritas manual petugas", "Officer-assigned priority")} />
          <StatTile icon="group_off" iconTone="gray" label={tr("Belum ditugaskan", "Unassigned")} value={loading ? "…" : summary.unassigned} caption={tr("Insiden aktif tanpa tim", "Open incidents without a team")} />
        </div>

        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{tr("Tim lapangan", "Field teams")}</h2>
              <p className="text-xs text-gray-500">{tr("Tim harus tersedia sebelum sebuah insiden dapat ditugaskan.", "A team must exist before an incident can be assigned.")}</p>
            </div>
            <TeamForm onCreated={(team) => setTeams((current) => [...current, team].sort((a, b) => a.name.localeCompare(b.name)))} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {teams.length === 0 ? (
              <span className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-500">{tr("Belum ada tim. Tambahkan tim pertama.", "No teams yet. Add the first team.")}</span>
            ) : teams.map((team) => (
              <span key={team.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
                <strong>{team.name}</strong> · {team.area} · {team.leadName}
              </span>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{tr("Kandidat dari satelit", "Satellite candidates")}</h2>
                <p className="text-xs text-gray-500">{tr("Deteksi FRP tertinggi yang belum menjadi insiden.", "Highest-FRP detections not yet opened as incidents.")}</p>
              </div>
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">{hotspotCandidates.length}</span>
            </div>
            <div className="mt-4 space-y-2">
              {hotspotCandidates.length === 0 ? <p className="text-xs text-gray-400">{tr("Tidak ada kandidat baru atau feed sedang tidak tersedia.", "No new candidates or the feed is unavailable.")}</p> : hotspotCandidates.map((marker) => (
                <div key={marker.id} className="flex items-start gap-3 rounded-xl border border-gray-200 p-3">
                  <span className="material-symbols-outlined mt-0.5 text-orange-600">satellite_alt</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-gray-900">{placeLabel(marker.admin, marker.lat, marker.lng)}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">{marker.sensor ?? "-"} · {marker.frp.toFixed(1)} MW · {marker.severity} · {marker.matchStatus ?? "-"}</p>
                  </div>
                  <button type="button" onClick={() => void createFromHotspot(marker)} disabled={creatingSource !== null} className="shrink-0 rounded-lg bg-[#075640] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">
                    {creatingSource === `satellite:${marker.id}` ? "…" : tr("Buka insiden", "Open incident")}
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{tr("Kandidat laporan warga", "Citizen-report candidates")}</h2>
                <p className="text-xs text-gray-500">{tr("Laporan yang belum menjadi insiden operasional.", "Reports not yet opened as operational incidents.")}</p>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{reportCandidates.length}</span>
            </div>
            <div className="mt-4 space-y-2">
              {reportCandidates.length === 0 ? <p className="text-xs text-gray-400">{tr("Tidak ada kandidat baru.", "No new candidates.")}</p> : reportCandidates.map((report) => (
                <div key={report.id} className="flex items-start gap-3 rounded-xl border border-gray-200 p-3">
                  <span className="material-symbols-outlined mt-0.5 text-blue-600">person_pin_circle</span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-xs font-bold text-gray-900">{report.description}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">{placeLabel(report.admin, report.lat, report.lon)} · {report.status}</p>
                  </div>
                  <button type="button" onClick={() => void createFromReport(report)} disabled={creatingSource !== null} className="shrink-0 rounded-lg bg-[#075640] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">
                    {creatingSource === `citizen:${report.id}` ? "…" : tr("Buka insiden", "Open incident")}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="max-h-[840px] overflow-y-auto p-3 custom-scroll">
            <div className="sticky top-0 z-10 bg-white px-2 pb-3 pt-2">
              <h2 className="text-lg font-bold text-gray-900">{tr("Antrean insiden", "Incident queue")}</h2>
              <p className="text-xs text-gray-500">{incidents.length} {tr("insiden", "incidents")}</p>
            </div>
            <div className="space-y-2">
              {incidents.map((incident) => (
                <button key={incident.id} type="button" onClick={() => selectIncident(incident.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === incident.id ? "border-[#075640] bg-[#f3f9f5]" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#075640]">{incident.reference}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[incident.priority]}`}>{label(incident.priority, language)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold text-gray-900">{incident.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-gray-500">
                    <span>{label(incident.status, language)}</span><span>·</span><span>{incident.assignedTeamName ?? tr("Belum ada tim", "No team")}</span>
                  </div>
                </button>
              ))}
              {!loading && incidents.length === 0 && <p className="p-4 text-center text-xs text-gray-400">{tr("Belum ada insiden. Buka salah satu kandidat di atas.", "No incidents yet. Open one of the candidates above.")}</p>}
            </div>
          </Card>

          <Card className="min-h-[500px] p-5">
            {detailLoading && <p className="text-sm text-gray-500">{tr("Memuat detail insiden…", "Loading incident…")}</p>}
            {!detailLoading && !detail && <p className="text-sm text-gray-500">{tr("Pilih insiden dari antrean.", "Select an incident from the queue.")}</p>}
            {!detailLoading && detail && (
              <div data-testid="incident-detail" className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#075640]">{detail.reference}</span>
                      <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${PRIORITY_STYLE[detail.priority]}`}>{label(detail.priority, language)}</span>
                      <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{label(detail.status, language)}</span>
                    </div>
                    <h2 className="mt-2 text-xl font-bold text-gray-900">{detail.title}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600">{detail.description}</p>
                  </div>
                  <div className="text-right text-[11px] text-gray-500">
                    <p>{label(detail.sourceType, language)} · {detail.sourceId ?? "-"}</p>
                    <p>{detail.adminLabel ?? `${detail.lat.toFixed(4)}, ${detail.lon.toFixed(4)}`}</p>
                    <p>{tr("Dibuat", "Created")}: {formatDate(detail.createdAt)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] font-bold uppercase text-gray-400">{tr("Verifikasi", "Verification")}</p><p className="mt-1 text-xs font-bold text-gray-800">{label(detail.verification, language)}</p></div>
                  <div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] font-bold uppercase text-gray-400">{tr("Prioritas", "Priority")}</p><p className="mt-1 text-xs font-bold text-gray-800">{label(detail.priority, language)}</p></div>
                  <div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] font-bold uppercase text-gray-400">{tr("Tim", "Team")}</p><p className="mt-1 text-xs font-bold text-gray-800">{detail.assignedTeamName ?? tr("Belum ditugaskan", "Unassigned")}</p></div>
                  <div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] font-bold uppercase text-gray-400">{tr("Versi data", "Data version")}</p><p className="mt-1 text-xs font-bold text-gray-800">v{detail.rowVersion}</p></div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <DecisionForm key={`${detail.id}-${detail.rowVersion}-verify`} title={tr("1. Verifikasi manusia", "1. Human verification")} choices={VERIFICATIONS.map((value) => ({ value, label: label(value, language) }))} initialValue={detail.verification === "unassessed" ? "needs_more_information" : detail.verification} buttonLabel={tr("Simpan verifikasi", "Save verification")} reasonPlaceholder={tr("Bukti dan alasan keputusan (min. 10 karakter)", "Evidence and decision reason (min. 10 characters)")} disabled={decisionPending || creatingSource !== null} onSubmit={(value, reason) => mutate("verification", value, reason)} />
                  <DecisionForm key={`${detail.id}-${detail.rowVersion}-priority`} title={tr("2. Prioritas manual", "2. Manual priority")} choices={PRIORITIES.map((value) => ({ value, label: label(value, language) }))} initialValue={detail.priority === "unassessed" ? "medium" : detail.priority} buttonLabel={tr("Simpan prioritas", "Save priority")} reasonPlaceholder={tr("Dampak, urgensi, kekuatan bukti, kebaruan", "Impact, urgency, evidence strength and freshness")} disabled={decisionPending || creatingSource !== null} onSubmit={(value, reason) => mutate("priority", value, reason)} />
                  <DecisionForm key={`${detail.id}-${detail.rowVersion}-assign`} title={tr("3. Penugasan tim", "3. Team assignment")} choices={teams.filter((team) => team.availability !== "unavailable").map((team) => ({ value: team.id, label: `${team.name} · ${team.area}` }))} initialValue={detail.assignedTeamId ?? teams.find((team) => team.availability !== "unavailable")?.id ?? ""} buttonLabel={tr("Tugaskan tim", "Assign team")} reasonPlaceholder={tr("Alasan dan ruang lingkup penugasan", "Assignment reason and scope")} disabled={decisionPending || creatingSource !== null} onSubmit={(value, reason) => mutate("assignment", value, reason)} />
                  <DecisionForm key={`${detail.id}-${detail.rowVersion}-status`} title={tr("4. Progres penanganan", "4. Response progress")} choices={STATUSES.map((value) => ({ value, label: label(value, language) }))} initialValue={detail.status === "new" ? "triaging" : detail.status} buttonLabel={tr("Perbarui progres", "Update progress")} reasonPlaceholder={tr("Kondisi lapangan dan dasar perubahan", "Field conditions and basis for change")} disabled={decisionPending || creatingSource !== null} onSubmit={(value, reason) => mutate("status", value, reason)} />
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-900">{tr("Histori yang dapat diaudit", "Auditable history")}</h3>
                  <div className="mt-3 space-y-3 border-l-2 border-[#cfe3d8] pl-4">
                    {(detail.timeline ?? []).map((item) => (
                      <div key={item.id} className="relative rounded-xl border border-gray-200 bg-white p-3 before:absolute before:-left-[21px] before:top-4 before:h-2.5 before:w-2.5 before:rounded-full before:bg-[#075640] before:ring-4 before:ring-white">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold text-gray-900">{label(item.action, language)} · {item.actor}</p>
                          <time className="text-[10px] text-gray-400">{formatDate(item.createdAt)}</time>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-gray-600">{item.reason}</p>
                        {(item.oldValue || item.newValue) && <p className="mt-1 text-[10px] text-gray-400">{item.oldValue ?? "—"} → {item.newValue?.includes("|") ? item.newValue.split("|")[1] : item.newValue}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="text-lg font-bold text-gray-900">{tr("Notifikasi operasional", "Operational notifications")}</h2>
          <p className="text-xs text-gray-500">{tr("Dibuat saat penugasan, prioritas tinggi/kritis, atau progres berubah.", "Created when assignment, high/critical priority, or progress changes.")}</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {notifications.length === 0 ? <p className="text-xs text-gray-400">{tr("Belum ada notifikasi.", "No notifications yet.")}</p> : notifications.slice(0, 9).map((notification) => (
              <button key={notification.id} type="button" onClick={() => notification.incidentId && selectIncident(notification.incidentId)} className="rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50">
                <p className="text-xs font-semibold text-gray-800">{notification.message}</p>
                <p className="mt-1 text-[10px] text-gray-400">{formatDate(notification.createdAt)}{notification.teamName ? ` · ${notification.teamName}` : ""}</p>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </WorkstationLayout>
  );
}
