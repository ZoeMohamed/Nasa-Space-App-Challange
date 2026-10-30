import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Officer sign-in for the hackathon build: one shared passcode,
 * OFFICER_ACCESS_KEY, set both here (Vercel) and on the Python backend
 * (Render). No user accounts.
 *
 * - The browser never sees the key. After a correct passcode,
 *   /api/officer/login sets an httpOnly cookie holding an HMAC derived from
 *   the key, so the cookie is useless if the key is rotated.
 * - Server-side route handlers that proxy officer-only backend endpoints
 *   check that cookie and, only then, attach the real key as X-Officer-Key.
 * - Fails closed: with OFFICER_ACCESS_KEY unset, nobody can sign in.
 *
 * Server-only module (uses node:crypto and the secret); never import it from
 * a "use client" file.
 */

export const OFFICER_COOKIE = "agni_officer";
export const OFFICER_SESSION_MAX_AGE_S = 12 * 60 * 60;

function officerKey(): string | null {
  const key = process.env.OFFICER_ACCESS_KEY?.trim();
  return key ? key : null;
}

export function officerAuthConfigured(): boolean {
  return officerKey() !== null;
}

/** The value stored in the officer cookie, or null when auth is not configured. */
export function officerSessionValue(): string | null {
  const key = officerKey();
  if (!key) return null;
  return createHmac("sha256", key).update("agnibhumi-officer-session-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isValidPasscode(passcode: unknown): boolean {
  const key = officerKey();
  return typeof passcode === "string" && key !== null && safeEqual(passcode.trim(), key);
}

export function isValidOfficerCookie(value: string | undefined | null): boolean {
  const expected = officerSessionValue();
  return Boolean(value) && expected !== null && safeEqual(value as string, expected);
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function isOfficerRequest(request: Request): boolean {
  return isValidOfficerCookie(readCookie(request, OFFICER_COOKIE));
}

/**
 * Headers to send to the Python backend: the officer key only for signed-in
 * officers, plus the caller's IP so the backend's per-IP report limit works
 * behind this proxy.
 */
export function backendHeaders(request: Request, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const key = officerKey();
  if (key && isOfficerRequest(request)) headers["X-Officer-Key"] = key;
  const forwarded = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  if (forwarded) headers["X-Forwarded-For"] = forwarded;
  return headers;
}
