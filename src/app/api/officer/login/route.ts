import { OFFICER_COOKIE, OFFICER_SESSION_MAX_AGE_S, isValidPasscode, officerAuthConfigured, officerSessionValue } from "@/lib/officerAuth";

export const dynamic = "force-dynamic";

// Small per-instance brake on passcode guessing.
const attempts = new Map<string, number[]>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  if (!officerAuthConfigured()) {
    return Response.json(
      { error: "Officer sign-in is not configured on this server (OFFICER_ACCESS_KEY).", code: "OFFICER_AUTH_DISABLED" },
      { status: 503 }
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (tooManyAttempts(ip)) {
    return Response.json({ error: "Too many attempts. Try again in a few minutes.", code: "TOO_MANY_ATTEMPTS" }, { status: 429 });
  }

  let passcode: unknown;
  try {
    passcode = ((await request.json()) as { passcode?: unknown }).passcode;
  } catch {
    return Response.json({ error: "Invalid JSON body.", code: "INVALID_BODY" }, { status: 400 });
  }

  if (!isValidPasscode(passcode)) {
    return Response.json({ error: "Wrong passcode.", code: "WRONG_PASSCODE" }, { status: 401 });
  }

  const cookie = [
    `${OFFICER_COOKIE}=${officerSessionValue()}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${OFFICER_SESSION_MAX_AGE_S}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}
