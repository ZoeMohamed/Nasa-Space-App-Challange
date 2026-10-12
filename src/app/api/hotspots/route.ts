export const dynamic = "force-dynamic";

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

export async function GET() {
  const mapKey = process.env.NASA_FIRMS_MAP_KEY;

  if (!mapKey) {
    return Response.json(
      {
        error: "NASA FIRMS is not configured on this server.",
        code: "FIRMS_KEY_MISSING",
      },
      { status: 503 }
    );
  }

  try {
    const upstream = await fetch(`${PYTHON_API}/api/live/hotspots`, {
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
    console.error("Live Python hotspot processing failed", error);
    return Response.json(
      {
        error: "Live NASA processing is temporarily unavailable.",
        code: "PYTHON_PROCESSING_ERROR",
      },
      { status: 502 }
    );
  }
}
