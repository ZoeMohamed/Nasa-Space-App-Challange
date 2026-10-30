import { OFFICER_COOKIE } from "@/lib/officerAuth";

export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": `${OFFICER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`, "Cache-Control": "no-store" } }
  );
}
