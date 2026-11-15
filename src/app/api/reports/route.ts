import { pythonHeaders } from "@/lib/pythonProxy";

export const dynamic = "force-dynamic";

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

/**
 * Proxies GET /api/reports to the Python processing service's community-reports
 * store (python-service/fire_pipeline/reports.py). List items intentionally omit
 * `satelliteLinks` — that field is only populated on the single-report detail
 * fetch, see src/app/api/reports/[id]/route.ts.
 *
 * Anonymous callers receive only the reduced verified-report view. A
 * reporter token narrows the response to that browser's own reports.
 */
export async function GET(request: Request) {
  const incomingUrl = new URL(request.url);
  const submitterToken = incomingUrl.searchParams.get("submitterToken");
  const upstreamUrl = new URL(`${PYTHON_API}${submitterToken ? "/api/reports" : "/api/reports/public"}`);
  const status = incomingUrl.searchParams.get("status");
  if (submitterToken) upstreamUrl.searchParams.set("submitterToken", submitterToken);
  if (status) upstreamUrl.searchParams.set("status", status);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: pythonHeaders(request),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const body = await upstream.json();

    // Pass the upstream status/body through as-is (rather than collapsing
    // everything to a generic 502) so callers — notably 422 validation
    // failures — see the real status and message instead of a swallowed one.
    if (!upstream.ok) {
      return Response.json(body, { status: upstream.status });
    }

    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Fetching community reports failed", error);
    return Response.json(
      {
        error: "Unable to load community reports.",
        code: "REPORTS_FETCH_ERROR",
      },
      { status: 502 }
    );
  }
}

/**
 * Proxies POST /api/reports (community report submission) to the Python
 * backend. Forwards the JSON body as-is — {lat, lon, description,
 * observedAt?, submitterToken, photoBase64?} — and relays the upstream
 * status code and body verbatim, including 422 validation failures, so the
 * client can surface the backend's real error message instead of a generic
 * "failed" toast.
 */
export async function POST(request: Request) {
  if (process.env.ENABLE_CITIZEN_REPORTS !== "true") {
    return Response.json(
      {
        error: "Citizen reporting is not open while the public-access review workflow is disabled.",
        code: "REPORTING_DISABLED",
      },
      { status: 503 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${PYTHON_API}/api/reports`, {
      method: "POST",
      headers: pythonHeaders(request, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const body = await upstream.json();

    return Response.json(body, { status: upstream.status });
  } catch (error) {
    console.error("Report submission proxy failed", error);
    return Response.json(
      { error: "Unable to submit the report right now. Please try again." },
      { status: 502 }
    );
  }
}
