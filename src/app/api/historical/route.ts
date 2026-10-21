export const dynamic = "force-dynamic";

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

const FORWARDED_PARAMS = ["min_lat", "max_lat", "min_lon", "max_lon", "province", "admin_code", "polygon"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const upstreamParams = new URLSearchParams();

  for (const key of FORWARDED_PARAMS) {
    const value = searchParams.get(key);
    if (value !== null) upstreamParams.set(key, value);
  }

  const query = upstreamParams.toString();

  try {
    const upstream = await fetch(
      `${PYTHON_API}/api/historical/calendar${query ? `?${query}` : ""}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      }
    );
    const body = await upstream.json();

    if (!upstream.ok) {
      throw new Error(`Python processing failed (${upstream.status})`);
    }

    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Historical Python processing failed", error);
    return Response.json(
      {
        error: "Historical NASA FIRMS data is temporarily unavailable.",
        code: "PYTHON_PROCESSING_ERROR",
      },
      { status: 502 }
    );
  }
}
