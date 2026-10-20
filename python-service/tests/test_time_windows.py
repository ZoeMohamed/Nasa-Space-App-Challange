from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from fire_pipeline import live
from fire_pipeline.live import WINDOW_HOURS_BY_KEY, chunk_plan, process_live_frames


def _detection(day_offset: int, lat: float, frp: float, sensor="MODIS"):
    when = datetime.now(timezone.utc) - timedelta(days=day_offset, hours=1)
    return {
        "latitude": lat, "longitude": 104.8, "brightness": 330,
        "acq_date": when.strftime("%Y-%m-%d"), "acq_time": int(when.strftime("%H%M")),
        "satellite": "Terra", "confidence": 92, "frp": frp,
        "sensor": sensor, "source": "MODIS_NRT", "source_file": "MODIS_NRT",
    }


SUMMARIES = [{"id": "MODIS_NRT", "sensor": "MODIS", "rawCount": 0, "highConfidenceCount": 0, "available": True}]


@pytest.fixture(autouse=True)
def _no_historical_store(monkeypatch, tmp_path):
    monkeypatch.setenv("FIRE_HISTORICAL_DB_PATH", str(tmp_path / "none.sqlite"))


def test_chunk_plan_respects_firms_day_range_limit_and_covers_window():
    today = pd.Timestamp("2026-10-20")
    for key in ("7d", "30d"):
        plan = chunk_plan(WINDOW_HOURS_BY_KEY[key], today)
        assert all(1 <= n <= live.FIRMS_MAX_DAY_RANGE for _, n in plan)
        earliest = min(pd.Timestamp(start) for start, _ in plan)
        assert (today - earliest).days + 1 >= WINDOW_HOURS_BY_KEY[key] // 24 + 1
        assert pd.Timestamp(plan[0][0]) + pd.Timedelta(days=plan[0][1] - 1) == today


def test_7d_chunks_are_reused_by_30d_window():
    today = pd.Timestamp("2026-10-20")
    assert set(chunk_plan(WINDOW_HOURS_BY_KEY["7d"], today)) <= set(chunk_plan(WINDOW_HOURS_BY_KEY["30d"], today))


def test_window_cutoff_keeps_only_detections_inside_window():
    frame = pd.DataFrame([_detection(0, -2.1, 50), _detection(3, -2.6, 60), _detection(20, -3.1, 70)])
    in_24h = process_live_frames([frame], SUMMARIES)
    in_7d = process_live_frames([frame], SUMMARIES, window_hours=7 * 24)
    in_30d = process_live_frames([frame], SUMMARIES, window_hours=30 * 24)
    assert len(in_24h["markers"]) == 1
    assert len(in_7d["markers"]) == 2
    assert len(in_30d["markers"]) == 3
    assert in_7d["meta"]["windowHours"] == 168


def test_marker_cap_keeps_highest_frp_and_reports_the_cut():
    frame = pd.DataFrame([_detection(1, -2.0 - i * 0.3, frp) for i, frp in enumerate([10, 90, 50, 70])])
    result = process_live_frames([frame], SUMMARIES, window_hours=7 * 24, max_markers=2)
    assert sorted(m["frp"] for m in result["markers"]) == [70, 90]
    assert result["meta"]["markers"] == {"total": 4, "shown": 2, "truncated": True, "selection": "highest-frp"}
    # Areas are still computed from every detection, not just the shown markers.
    assert sum(area["detections"] for area in result["areas"]) == 4


def test_unknown_window_is_rejected():
    with pytest.raises(ValueError):
        live.load_live_hotspots(map_key="dummy", window="90d")


def test_daily_summary_counts_every_detection_even_when_markers_are_capped():
    frame = pd.DataFrame([_detection(1, -2.0 - i * 0.3, frp) for i, frp in enumerate([10, 90, 50, 70])])
    result = process_live_frames([frame], SUMMARIES, window_hours=7 * 24, max_markers=1)
    daily = result["daily"]
    assert sum(row["modis"] for row in daily) == 4
    assert sum(row["high"] + row["medium"] + row["low"] for row in daily) == 4
    assert sum(row["high"] for row in daily) == 1  # only frp 90 is > 70


def test_slow_firms_download_is_cut_off_and_not_retried(monkeypatch):
    calls = {"n": 0}

    class SlowResponse:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self, _size):
            calls["n"] += 1
            return b"x"  # never ends on its own

    monkeypatch.setattr(live, "urlopen", lambda *a, **k: SlowResponse())
    monkeypatch.setattr(live, "DOWNLOAD_DEADLINE_SECONDS", 0.05)
    attempts = {"n": 0}
    original = live._read_with_deadline

    def counting(request):
        attempts["n"] += 1
        return original(request)

    monkeypatch.setattr(live, "_read_with_deadline", counting)
    with pytest.raises(live.LiveDataError, match="timed out"):
        live._fetch_source("key", "MODIS_NRT", "MODIS", day_range=5, start_date="2026-10-16")
    assert attempts["n"] == 1


def test_extended_window_result_is_reused_while_chunks_are_unchanged(monkeypatch):
    frame = pd.DataFrame([_detection(1, -2.1, 50)])
    fetched = {"frames": [frame]}
    monkeypatch.setattr(live, "_fetch_extended_window", lambda key, hours: (fetched["frames"], SUMMARIES))
    calls = {"n": 0}
    original = live.build_live_result

    def counting(*args, **kwargs):
        calls["n"] += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(live, "build_live_result", counting)
    live._processed_cache.clear()
    first = live.load_live_result(map_key="k", window="7d")
    second = live.load_live_result(map_key="k", window="7d")
    assert calls["n"] == 1 and first is second
    fetched["frames"] = [frame.copy()]  # a refetched chunk is a new object
    live.load_live_result(map_key="k", window="7d")
    assert calls["n"] == 2


def test_render_view_filters_before_cap_and_reports_totals():
    frame = pd.DataFrame([_detection(0, -2.0 - i * 0.05, 10 + i) for i in range(6)])
    result = live.build_live_result([frame], SUMMARIES, window_hours=48)
    all_ids = result.markers.id.tolist()

    near = live.render_view(result, near=(-2.0, 104.8, 12.0), limit=None)  # ~0.05° ≈ 5.6 km apart
    assert 1 <= len(near["markers"]) < 6
    assert all(m["lat"] >= -2.11 for m in near["markers"])

    capped = live.render_view(result, limit=2)
    assert capped["meta"]["markers"] == {"total": 6, "shown": 2, "truncated": True, "selection": "highest-frp"}
    assert [m["frp"] for m in capped["markers"]] == [15.0, 14.0]

    one = live.render_view(result, marker_id=all_ids[3])
    assert [m["id"] for m in one["markers"]] == [all_ids[3]]
    assert live.render_view(result, marker_id="does-not-exist")["markers"] == []

    recent = live.render_view(result, order="recent", limit=None)
    times = [m["acquiredAt"] for m in recent["markers"]]
    assert times == sorted(times, reverse=True)
