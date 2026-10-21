export const dynamic = "force-dynamic";
// Uses the cached 30-day live window; slow only when that window is still cold.
export const maxDuration = 60;

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

const FORWARDED_PARAMS = ["min_lat", "max_lat", "min_lon", "max_lon", "province", "admin_code", "polygon"];

/** Calendar months after the archive ends, from live data on the archive's definitions (python-service/main.py historical_live_months). */
export async function GET(request: Request) {
  const mapKey = process.env.NASA_FIRMS_MAP_KEY;
  if (!mapKey) {
    return Response.json({ error: "NASA FIRMS is not configured on this server.", code: "FIRMS_KEY_MISSING" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const upstreamParams = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const value = searchParams.get(key);
    if (value !== null) upstreamParams.set(key, value);
  }
  const query = upstreamParams.toString();

  try {
    const upstream = await fetch(`${PYTHON_API}/api/historical/live-months${query ? `?${query}` : ""}`, {
      cache: "no-store",
      headers: { "X-FIRMS-Map-Key": mapKey },
      signal: AbortSignal.timeout(300_000),
    });
    const body = await upstream.json();
    if (!upstream.ok) {
      throw new Error(`Python processing failed (${upstream.status})`);
    }
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Live calendar months failed", error);
    return Response.json(
      { error: "Live calendar months are temporarily unavailable.", code: "PYTHON_PROCESSING_ERROR" },
      { status: 502 }
    );
  }
}
