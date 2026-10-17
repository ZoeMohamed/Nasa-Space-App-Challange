/**
 * Local-only alert-area preferences ("07 Community — Atur Area Peringatan",
 * Figma node 185:3013). There is no backend endpoint for push-notification
 * targeting, so this is honestly a per-device preference persisted in
 * localStorage — it narrows which REGION_OPTIONS bounds + severity the
 * Notifikasi page treats as "relevant to me" when filtering the real
 * /api/hotspots feed, not a server-side subscription.
 */

export interface AlertPrefs {
  region: string;
  minSeverity: "LOW" | "MEDIUM" | "HIGH";
  notifyReportUpdates: boolean;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  region: "indonesia",
  minSeverity: "LOW",
  notifyReportUpdates: true,
};

const KEY = "agnibhumi_alert_prefs";

export function loadAlertPrefs(): AlertPrefs {
  if (typeof window === "undefined") return DEFAULT_ALERT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ALERT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AlertPrefs>;
    return { ...DEFAULT_ALERT_PREFS, ...parsed };
  } catch {
    return DEFAULT_ALERT_PREFS;
  }
}

export function saveAlertPrefs(prefs: AlertPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // best-effort only
  }
}
