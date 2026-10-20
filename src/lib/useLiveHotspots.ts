"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HotspotApiResponse } from "@/types";
import type { LiveWindow } from "./filters";
import { fetchHotspots, hotspotQueryString, type HotspotQuery } from "./hotspots";

const DEFAULT_REFRESH_MS = 5 * 60 * 1000;

interface LoadState {
  key: string;
  nonce: number;
  data: HotspotApiResponse | null;
  error: string | null;
}

/**
 * Live /api/hotspots for one time window, refreshed periodically. Data from a previous window is
 * never shown under a new window's label: `data` is null until the requested window has loaded.
 */
export function useLiveHotspots(
  window: LiveWindow,
  { refreshMs = DEFAULT_REFRESH_MS, ...query }: Omit<HotspotQuery, "window"> & { refreshMs?: number } = {}
) {
  const key = hotspotQueryString({ window, ...query }) || "default";
  const [nonce, setNonce] = useState(0);
  // The query object is re-created every render; `key` (its serialized form) drives refetching.
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });
  const [state, setState] = useState<LoadState>({ key: "", nonce: -1, data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetchHotspots({ window, ...queryRef.current, signal: controller.signal })
        .then((data) => setState({ key, nonce, data, error: null }))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          const message = error instanceof Error ? error.message : "Unable to load NASA FIRMS data.";
          setState((prev) => ({ key, nonce, data: prev.key === key ? prev.data : null, error: message }));
        });
    load();
    const interval = globalThis.setInterval(load, refreshMs);
    return () => {
      controller.abort();
      globalThis.clearInterval(interval);
    };
  }, [key, window, refreshMs, nonce]);

  const current = state.key === key;
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !current || state.nonce !== nonce,
    refresh,
  };
}
