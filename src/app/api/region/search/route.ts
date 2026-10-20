export const dynamic = "force-dynamic";

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ available: true, results: [] });

  try {
    const upstream = await fetch(`${PYTHON_API}/api/region/search?q=${encodeURIComponent(q)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) throw new Error(`Python processing failed (${upstream.status})`);
    return Response.json(await upstream.json(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Region search failed", error);
    return Response.json({ error: "Pencarian lokasi sedang tidak tersedia.", results: [] }, { status: 502 });
  }
}
