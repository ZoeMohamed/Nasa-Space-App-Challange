/**
 * Per-device "submitter token" for community fire reports.
 *
 * IMPORTANT: this is NOT a verified identity. It's a random UUID generated
 * once in this browser and persisted in localStorage purely so a repeat
 * visitor's own report history ("Laporan Saya") can be looked up again on
 * later visits — it is never shown to other members of the public and
 * proves nothing about who actually submitted a report. See
 * python-service/fire_pipeline/reports.py (submitter_token is just an
 * opaque string the backend stores and filters by, no auth check).
 */

const SUBMITTER_TOKEN_KEY = "agnibhumi_submitter_token";

export function getOrCreateSubmitterToken(): string {
  if (typeof window === "undefined") {
    // SSR/build-time guard — callers only use this inside client effects/handlers.
    return "";
  }

  try {
    const existing = window.localStorage.getItem(SUBMITTER_TOKEN_KEY);
    if (existing) return existing;

    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(SUBMITTER_TOKEN_KEY, created);
    return created;
  } catch {
    // localStorage unavailable (private mode / blocked storage) — fall back to a
    // session-only token so submission still works, just without cross-visit memory.
    return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
