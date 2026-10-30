import { backendHeaders } from "@/lib/officerAuth";

export const dynamic = "force-dynamic";

const PYTHON_API = process.env.PYTHON_PROCESSING_API_URL ?? "http://127.0.0.1:8000";

/**
 * Streams a report's uploaded photo through from the Python backend
 * (python-service/main.py get_report_photo) so <img src="/api/reports/{id}/photo">
 * works directly from the Community View without exposing the Python
 * service's own URL to the browser. 404s (no photo / missing file) pass
 * through as-is.
 *
 * Only the reporter (`?submitterToken=`) and signed-in officers can load a
 * photo; the backend returns 404 to everyone else, verified or not.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const upstreamUrl = new URL(`${PYTHON_API}/api/reports/${encodeURIComponent(id)}/photo`);
  const submitterToken = new URL(request.url).searchParams.get("submitterToken");
  if (submitterToken) upstreamUrl.searchParams.set("submitterToken", submitterToken);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: backendHeaders(request),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok || !upstream.body) {
      return Response.json(
        { error: "No photo available for this report.", code: "REPORT_PHOTO_NOT_FOUND" },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Report photo proxy failed", error);
    return Response.json(
      { error: "Unable to load this report's photo.", code: "REPORT_PHOTO_ERROR" },
      { status: 502 }
    );
  }
}
