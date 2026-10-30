"""Officer access check and a small submission rate limiter.

Officer access is a single shared passcode (OFFICER_ACCESS_KEY), the same
value configured on the Next.js frontend. The frontend only forwards it, as
the X-Officer-Key header, for browsers that signed in on /officer-login.
This is deliberately simple (hackathon scope, no user accounts), but it
fails CLOSED: when OFFICER_ACCESS_KEY is not set, nobody is an officer.
"""

from __future__ import annotations

import hmac
import os
import threading
import time
from collections import defaultdict, deque


def officer_key_configured() -> bool:
    return bool(os.getenv("OFFICER_ACCESS_KEY", "").strip())


def is_officer(presented_key: str | None) -> bool:
    expected = os.getenv("OFFICER_ACCESS_KEY", "").strip()
    if not expected or not presented_key:
        return False
    return hmac.compare_digest(presented_key.strip().encode(), expected.encode())


class SlidingWindowLimiter:
    """In-memory limiter: at most `limit` hits per key within `window_s`.

    Per-process only, so it resets on restart and is not shared between
    instances. Good enough to stop one browser or one IP from flooding the
    officer queue during a demo; not a substitute for a real gateway limit.
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
