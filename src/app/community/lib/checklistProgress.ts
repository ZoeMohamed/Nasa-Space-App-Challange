/**
 * Local-only progress store for the Emergency Preparedness Checklist
 * (/community/edukasi/siaga) — same pattern as alertPrefs.ts. There is no
 * backend endpoint for per-user checklist state, so checked items are
 * persisted purely in this browser's localStorage. Nothing here is synced
 * to a server or shared across devices.
 */

const CHECKLIST_KEY = "agnibhumi_checklist_progress";
const QUIZ_KEY = "agnibhumi_simulasi_progress";

export function loadCheckedItems(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CHECKLIST_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function saveCheckedItems(state: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state));
  } catch {
    // best-effort only — local device storage can fail (private mode, full quota)
  }
}

export function loadQuizProgress(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(QUIZ_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function saveQuizProgress(state: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUIZ_KEY, JSON.stringify(state));
  } catch {
    // best-effort only
  }
}
