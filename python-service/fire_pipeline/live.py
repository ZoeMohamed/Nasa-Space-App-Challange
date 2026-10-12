from __future__ import annotations

import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from io import StringIO
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

from .clean import add_quality_flags, harmonize
from .features import aggregate_grid, attention_features, temporal_features
from .matching import match_modis_viirs
from .model import deterministic_priority, historical_baseline

FIRMS_API_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
INDONESIA_BOUNDS = "95,-11,141,6"
CACHE_SECONDS = 5 * 60
REQUEST_TIMEOUT_SECONDS = 20
SOURCES = (
    ("MODIS_NRT", "MODIS"),
    ("VIIRS_SNPP_NRT", "VIIRS"),
    ("VIIRS_NOAA20_NRT", "VIIRS"),
    ("VIIRS_NOAA21_NRT", "VIIRS"),
)


class LiveDataError(RuntimeError):
    pass


_cache_lock = threading.Lock()
_cache: tuple[float, dict] | None = None


def _fetch_source(map_key: str, source_id: str, sensor: str) -> tuple[pd.DataFrame, dict]:
    url = f"{FIRMS_API_BASE}/{quote(map_key, safe='')}/{source_id}/{INDONESIA_BOUNDS}/1"
    request = Request(url, headers={"User-Agent": "FireWatch-Python/1.0"})
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8-sig")
    except (HTTPError, URLError, TimeoutError) as exc:
        raise LiveDataError(f"NASA FIRMS {source_id} is unavailable") from exc
    try:
        frame = pd.read_csv(StringIO(body))
    except (pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
        raise LiveDataError(f"NASA FIRMS returned invalid data for {source_id}") from exc

    required = {"latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp"}
    if not required.issubset(frame.columns):
        raise LiveDataError(f"NASA FIRMS returned unexpected data for {source_id}")
    confidence_text = frame["confidence"].astype(str).str.strip().str.lower()
    confidence_number = pd.to_numeric(frame["confidence"], errors="coerce")
    high_confidence = confidence_number.gt(80) | confidence_text.eq("h")
    live = frame.loc[high_confidence].copy()
    live["sensor"] = sensor
    live["source"] = source_id
    live["source_file"] = source_id
    return live, {
        "id": source_id,
        "sensor": sensor,
        "rawCount": int(len(frame)),
        "highConfidenceCount": int(high_confidence.sum()),
        "available": True,
    }


def _severity(frp: float) -> str:
    if frp > 70:
        return "HIGH"
    if frp >= 25:
        return "MEDIUM"
    return "LOW"


def process_live_frames(frames: list[pd.DataFrame], source_summaries: list[dict]) -> dict:
    if not frames:
        raise LiveDataError("All NASA FIRMS feeds are unavailable")
    detections = add_quality_flags(harmonize(pd.concat(frames, ignore_index=True, sort=False)))
    detections = detections[detections["quality_ok"]].reset_index(drop=True)
    matches = match_modis_viirs(detections) if not detections.empty else pd.DataFrame(columns=["detection_id", "match_status"])
    match_status = matches.set_index("detection_id")["match_status"].to_dict() if not matches.empty else {}
    areas = aggregate_grid(detections)
    areas = deterministic_priority(historical_baseline(attention_features(temporal_features(areas))))
    area_lookup = areas.set_index("area_id").to_dict(orient="index") if not areas.empty else {}

    markers, seen = [], set()
    for detection_id, row in detections.iterrows():
        grid_lat = round(float(np.floor(row.latitude / 0.25) * 0.25), 6)
        grid_lon = round(float(np.floor(row.longitude / 0.25) * 0.25), 6)
        area_id = f"{grid_lat}_{grid_lon}"
        area = area_lookup.get(area_id, {})
        acquired = pd.Timestamp(row.acq_datetime)
        source = str(row.get("source", row.get("source_file", row.sensor)))
        marker_id = f"{source}-{acquired.strftime('%Y%m%d%H%M')}-{row.latitude:.5f}-{row.longitude:.5f}"
        if marker_id in seen:
            continue
        seen.add(marker_id)
        confidence = float(row.confidence_num) if pd.notna(row.get("confidence_num")) else None
        markers.append(
            {
                "id": marker_id,
                "lat": float(row.latitude),
                "lng": float(row.longitude),
                "label": f"{row.sensor} active fire",
                "frp": float(row.frp),
                "severity": _severity(float(row.frp)),
                "sensor": str(row.sensor),
                "source": source,
                "satellite": str(row.get("satellite", "Unknown")),
                "confidence": confidence,
                "confidenceLabel": f"{confidence:.0f}%" if confidence is not None else str(row.get("confidence_raw", "High")),
                "acquiredAt": acquired.strftime("%Y-%m-%dT%H:%M:00Z"),
                "areaId": area_id,
                "matchStatus": str(match_status.get(detection_id, "UNMATCHED")),
                "attentionScore": float(area.get("attention_score", 0)),
                "priorityScore": float(area.get("priority_score", 0)),
                "priorityTier": str(area.get("priority_tier", "low")).upper(),
            }
        )

    matched_count = int((matches["match_status"] == "MATCHED").sum()) if not matches.empty else 0
    return {
        "markers": markers,
        "meta": {
            "provider": "NASA FIRMS",
            "area": "Indonesia",
            "windowHours": 24,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sources": source_summaries,
            "degraded": any(not source["available"] for source in source_summaries),
            "processing": {
                "engine": "Python fire_pipeline",
                "qualityRows": int(len(detections)),
                "matchedDetections": matched_count,
                "areasAnalyzed": int(len(areas)),
                "steps": ["clean", "match", "grid", "attention", "priority"],
            },
        },
    }


def load_live_hotspots(map_key: str | None = None) -> dict:
    global _cache
    key = map_key or os.getenv("NASA_FIRMS_MAP_KEY")
    if not key:
        raise LiveDataError("NASA_FIRMS_MAP_KEY is not configured")
    with _cache_lock:
        if _cache and _cache[0] > time.monotonic():
            return _cache[1]
        frames, summaries_by_id = [], {}
        with ThreadPoolExecutor(max_workers=len(SOURCES)) as executor:
            futures = {
                executor.submit(_fetch_source, key, source_id, sensor): (source_id, sensor)
                for source_id, sensor in SOURCES
            }
            for future in as_completed(futures):
                source_id, sensor = futures[future]
                try:
                    frame, summary = future.result()
                    frames.append(frame)
                    summaries_by_id[source_id] = summary
                except LiveDataError:
                    summaries_by_id[source_id] = {
                        "id": source_id,
                        "sensor": sensor,
                        "rawCount": 0,
                        "highConfidenceCount": 0,
                        "available": False,
                        "error": "Temporarily unavailable",
                    }
        summaries = [summaries_by_id[source_id] for source_id, _ in SOURCES]
        result = process_live_frames(frames, summaries)
        _cache = (time.monotonic() + CACHE_SECONDS, result)
        return result
