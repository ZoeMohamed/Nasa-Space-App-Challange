export const dynamic = "force-dynamic";

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";
const FORWARDED_PARAMS = ["days", "start_date", "end_date", "min_lat", "max_lat", "min_lon", "max_lon"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const value = searchParams.get(key);
    if (value !== null) params.set(key, value);
  }

  try {
    const upstream = await fetch(`${PYTHON_API}/api/historical/map?${params.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const body = await upstream.json();
    if (!upstream.ok) throw new Error(`Python processing failed (${upstream.status})`);
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Historical map processing failed", error);
    return Response.json(
      { error: "Historical NASA FIRMS map data is temporarily unavailable.", code: "PYTHON_PROCESSING_ERROR" },
      { status: 502 }
    );
  }
}