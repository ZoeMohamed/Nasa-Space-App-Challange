export const dynamic = "force-dynamic";

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

/**
 * Proxies GET /api/reports/public: officer-verified reports only, with no
 * reporter token, photo or review note, and coordinates rounded to ~1 km.
 * This is the only list of other people's reports the Community View loads.
 */
export async function GET() {
  try {
    const upstream = await fetch(`${PYTHON_API}/api/reports/public`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const body = await upstream.json();
    return Response.json(body, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Fetching public community reports failed", error);
    return Response.json({ error: "Unable to load community reports.", code: "REPORTS_FETCH_ERROR" }, { status: 502 });
  }
}
