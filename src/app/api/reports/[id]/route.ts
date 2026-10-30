import { backendHeaders, isOfficerRequest } from "@/lib/officerAuth";

export const dynamic = "force-dynamic";

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

/**
 * Proxies GET /api/reports/{id} to the Python community-reports store. Full
 * detail including `satelliteLinks` (the correlated live satellite markers),
 * unlike the list endpoint in src/app/api/reports/route.ts.
 *
 * The reporter (matching `?submitterToken=`) and signed-in officers get the
 * full report. Anyone else gets a verified report in its reduced public
 * shape, or 404 for reports that are not verified.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/reports/[id]">) {
  const { id } = await ctx.params;
  const upstreamUrl = new URL(`${PYTHON_API}/api/reports/${encodeURIComponent(id)}`);
  const submitterToken = new URL(request.url).searchParams.get("submitterToken");
  if (submitterToken) upstreamUrl.searchParams.set("submitterToken", submitterToken);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: backendHeaders(request),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    if (upstream.status === 404) {
      return Response.json({ error: "Report not found.", code: "REPORT_NOT_FOUND" }, { status: 404 });
    }

    const body = await upstream.json();

    if (!upstream.ok) {
      throw new Error(`Python processing failed (${upstream.status})`);
    }

    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Fetching community report detail failed", error);
    return Response.json(
      { error: "Unable to load this report.", code: "REPORT_FETCH_ERROR" },
      { status: 502 }
    );
  }
}

/**
 * Proxies PATCH /api/reports/{id} to update a report's review status.
 * Officers only: checked here (signed-in cookie) and again on the backend
 * (X-Officer-Key), because a "verified" report raises nearby citizens' area
 * status to "Awas".
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/reports/[id]">) {
  const { id } = await ctx.params;

  if (!isOfficerRequest(request)) {
    return Response.json({ error: "Officer sign-in required.", code: "OFFICER_AUTH_REQUIRED" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body.", code: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${PYTHON_API}/api/reports/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: backendHeaders(request, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    const body = await upstream.json();

    if (upstream.status === 404) {
      return Response.json({ error: "Report not found.", code: "REPORT_NOT_FOUND" }, { status: 404 });
    }

    if (upstream.status === 401) {
      return Response.json({ error: "Officer sign-in required.", code: "OFFICER_AUTH_REQUIRED" }, { status: 401 });
    }

    if (upstream.status === 422) {
      return Response.json(
        { error: "Invalid status value.", code: "INVALID_STATUS", detail: body },
        { status: 422 }
      );
    }

    if (!upstream.ok) {
      throw new Error(`Python processing failed (${upstream.status})`);
    }

    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Updating community report status failed", error);
    return Response.json(
      { error: "Unable to update this report's status.", code: "REPORT_UPDATE_ERROR" },
      { status: 502 }
    );
  }
}
