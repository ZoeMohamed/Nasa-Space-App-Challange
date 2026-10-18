export const dynamic = "force-dynamic";

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return Response.json({ error: "lat and lon query params are required." }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `${PYTHON_API}/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      }
    );
    const body = await upstream.json();

    if (!upstream.ok) {
      throw new Error(`Python processing failed (${upstream.status})`);
    }

    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Weather/air-quality fetch failed", error);
    return Response.json(
      {
        error: "Weather and air quality data is temporarily unavailable.",
        code: "WEATHER_FETCH_ERROR",
      },
      { status: 502 }
    );
  }
}
