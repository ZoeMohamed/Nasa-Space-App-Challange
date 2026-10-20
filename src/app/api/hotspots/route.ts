export const dynamic = "force-dynamic";
// Cold 7d/30d processing can exceed the default function timeout (the backend cache warmer
// normally avoids cold requests; this is the safety net).
export const maxDuration = 60;

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
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

  const searchParams = new URL(request.url).searchParams;
  const includeAllConfidence = searchParams.get("includeAllConfidence") === "true";
  const windowParam = searchParams.get("window");
  const liveWindow = windowParam === "7d" || windowParam === "30d" ? windowParam : "24h";
  const upstreamParams = new URLSearchParams();
  if (includeAllConfidence) upstreamParams.set("include_all_confidence", "true");
  if (liveWindow !== "24h") upstreamParams.set("window", liveWindow);
  // Server-side slicing (applied before the marker cap) — see python-service/main.py live_hotspots().
  const FORWARD: [string, string][] = [
    ["province", "province"],
    ["nearLat", "near_lat"],
    ["nearLon", "near_lon"],
    ["nearKm", "near_km"],
    ["markerId", "marker_id"],
    ["limit", "limit"],
    ["order", "order"],
  ];
  for (const [from, to] of FORWARD) {
    const value = searchParams.get(from);
    if (value) upstreamParams.set(to, value);
  }
  const upstreamQuery = upstreamParams.toString();

  try {
    const upstream = await fetch(
      `${PYTHON_API}/api/live/hotspots${upstreamQuery ? `?${upstreamQuery}` : ""}`,
      {
        cache: "no-store",
        headers: { "X-FIRMS-Map-Key": mapKey },
        // 30d = 28 date-chunked FIRMS requests on a cold cache (~3 min measured).
        signal: AbortSignal.timeout(liveWindow === "24h" ? 60_000 : 300_000),
      }
    );
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
