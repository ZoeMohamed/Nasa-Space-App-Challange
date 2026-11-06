"use client";

import { useEffect, useState } from "react";
import { getOrCreateSubmitterToken } from "./submitterToken";
import type { ReportsListResponse } from "@/types";

/**
 * Number of this device's own reports whose status moved past "submitted". There is no
 * read/unread flag in the backend, so this is an honestly-derived proxy, not an invented count.
 */
export function useUnreadReportCount(): number {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const token = getOrCreateSubmitterToken();
    if (!token) return;
    let cancelled = false;
    fetch(`/api/reports?submitterToken=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<ReportsListResponse>) : null))
      .then((body) => {
        if (!cancelled && body) setUnread(body.reports.filter((r) => r.status !== "submitted").length);
      })
      .catch(() => {
        /* best-effort badge */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return unread;
}
