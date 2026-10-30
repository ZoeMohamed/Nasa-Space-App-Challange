import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { OFFICER_COOKIE, isValidOfficerCookie } from "@/lib/officerAuth";

/**
 * Officer-only pages. Citizen reports hold reporters' exact locations, photos
 * and review notes, so the page itself is gated here. The data it loads is
 * gated again in the API route handlers and on the Python backend, so this
 * redirect is a convenience, not the only lock.
 *
 * The satellite-data pages (/operator, /calendar, /map, ...) stay public on
 * purpose: they only show NASA data that is public anyway.
 */
export function proxy(request: NextRequest) {
  if (isValidOfficerCookie(request.cookies.get(OFFICER_COOKIE)?.value)) {
    return NextResponse.next();
  }
  const loginUrl = new URL("/officer-login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/citizen-reports/:path*"],
};
