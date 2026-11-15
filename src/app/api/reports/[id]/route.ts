import { pythonHeaders } from "@/lib/pythonProxy";

export const dynamic = "force-dynamic";

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

/**
 * Proxies GET /api/reports/{id} to the Python community-reports store. Full
 * detail including `satelliteLinks` (the correlated live satellite markers),
 * unlike the list endpoint in src/app/api/reports/route.ts.
 *
 * Full detail is returned only when the originating reporter token matches;
 * otherwise only a verified, reduced public view can be returned upstream.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/reports/[id]">) {
  const { id } = await ctx.params;
  const upstreamUrl = new URL(`${PYTHON_API}/api/reports/${encodeURIComponent(id)}`);
  const submitterToken = new URL(request.url).searchParams.get("submitterToken");
  if (submitterToken) upstreamUrl.searchParams.set("submitterToken", submitterToken);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: pythonHeaders(request),
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
 * Public review is disabled by default because there is no officer
 * authentication in the selected public-access deployment mode.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/reports/[id]">) {
  const { id } = await ctx.params;

  if (process.env.ENABLE_PUBLIC_REPORT_REVIEW !== "true") {
    return Response.json(
      { error: "Public report review is disabled.", code: "REPORT_REVIEW_DISABLED" },
      { status: 403 }
    );
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
      headers: pythonHeaders(request, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    const body = await upstream.json();

    if (upstream.status === 404) {
      return Response.json({ error: "Report not found.", code: "REPORT_NOT_FOUND" }, { status: 404 });
    }

    if (upstream.status === 401) {
      return Response.json({ error: "Public review bridge is unavailable.", code: "REPORT_BRIDGE_UNAVAILABLE" }, { status: 503 });
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
