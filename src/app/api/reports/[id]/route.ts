export const dynamic = "force-dynamic";

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

/**
 * Proxies GET /api/reports/{id} to the Python community-reports store. Full
 * detail including `satelliteLinks` (the correlated live satellite markers),
 * unlike the list endpoint in src/app/api/reports/route.ts.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/reports/[id]">) {
  const { id } = await ctx.params;

  try {
    const upstream = await fetch(`${PYTHON_API}/api/reports/${encodeURIComponent(id)}`, {
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
 *
 * IMPORTANT: the upstream endpoint has zero access control (an explicit,
 * approved decision for this project stage) — this proxy does not add any
 * either. Anyone who can reach this route can change a report's status. The
 * citizen-reports page surfaces this plainly to the operator; see the banner
 * in src/app/citizen-reports/page.tsx.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/reports/[id]">) {
  const { id } = await ctx.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body.", code: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${PYTHON_API}/api/reports/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    const body = await upstream.json();

    if (upstream.status === 404) {
      return Response.json({ error: "Report not found.", code: "REPORT_NOT_FOUND" }, { status: 404 });
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
