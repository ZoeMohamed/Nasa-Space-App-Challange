"""Small in-memory submission rate limiter for the public endpoint."""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

class SlidingWindowLimiter:
    """In-memory limiter: at most `limit` hits per key within `window_s`.

    Per-process only, so it resets on restart and is not shared between
    instances. Good enough to stop one browser or one IP from flooding the
    public queue; not a substitute for a real gateway limit.
    """

    def __init__(self, limit: int, window_s: float):
        self.limit = limit
        self.window_s = window_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, *keys: str | None) -> bool:
        now = time.monotonic()
        active = [k for k in keys if k]
        with self._lock:
            for key in active:
                hits = self._hits[key]
                while hits and now - hits[0] > self.window_s:
                    hits.popleft()
                if len(hits) >= self.limit:
                    return False
            for key in active:
                self._hits[key].append(now)
        return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


report_limiter = SlidingWindowLimiter(
    limit=_env_int("REPORT_RATE_LIMIT", 5),
    window_s=_env_int("REPORT_RATE_WINDOW_S", 600),
)
