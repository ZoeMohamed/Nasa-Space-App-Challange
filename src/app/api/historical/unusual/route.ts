export const dynamic = "force-dynamic";
// Needs the live 24 h result (same cache as /api/hotspots) plus the archive comparison.
export const maxDuration = 60;

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

const FORWARDED_PARAMS = ["min_lat", "max_lat", "min_lon", "max_lon", "province", "admin_code", "polygon"];

/** Live 24 h cells vs their archive baseline on a comparable sensor population (python-service/main.py historical_unusual). */
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
    const upstream = await fetch(`${PYTHON_API}/api/historical/unusual${query ? `?${query}` : ""}`, {
      cache: "no-store",
      headers: { "X-FIRMS-Map-Key": mapKey },
      signal: AbortSignal.timeout(60_000),
    });
    const body = await upstream.json();
    if (!upstream.ok) {
      throw new Error(`Python processing failed (${upstream.status})`);
    }
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unusual-activity comparison failed", error);
    return Response.json(
      { error: "Live-vs-archive comparison is temporarily unavailable.", code: "PYTHON_PROCESSING_ERROR" },
      { status: 502 }
    );
  }
}
