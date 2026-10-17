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

from .clean import add_quality_flags, deduplicate_detections, harmonize, high_confidence_mask
from .features import aggregate_grid, attention_features, temporal_features
from .harmonize_events import build_harmonized_events
from .matching import match_modis_viirs
from .model import deterministic_priority, historical_baseline

FIRMS_API_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
INDONESIA_BOUNDS = "95,-11,141,6"
CACHE_SECONDS = 5 * 60
REQUEST_TIMEOUT_SECONDS = 20
FETCH_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 1
SOURCES = (
    ("MODIS_NRT", "MODIS"),
    ("VIIRS_SNPP_NRT", "VIIRS"),
    ("VIIRS_NOAA20_NRT", "VIIRS"),
    ("VIIRS_NOAA21_NRT", "VIIRS"),
)


class LiveDataError(RuntimeError):
    pass


def default_historical_db_path() -> str:
    """Path to the offline historical SQLite store (see
    scripts/build_historical_store.py). Overridable via
    FIRE_HISTORICAL_DB_PATH (used by tests); resolved fresh on every call
    so an override set after import still takes effect.
    """
    override = os.getenv("FIRE_HISTORICAL_DB_PATH")
    if override:
        return override
    return os.path.join(os.path.dirname(__file__), "..", "data", "historical.sqlite")


_cache_lock = threading.Lock()
_cache: tuple[float, dict] | None = None


def _fetch_source(map_key: str, source_id: str, sensor: str) -> tuple[pd.DataFrame, dict]:
    url = f"{FIRMS_API_BASE}/{quote(map_key, safe='')}/{source_id}/{INDONESIA_BOUNDS}/1"
    request = Request(url, headers={"User-Agent": "FireWatch-Python/1.0"})
    last_error = None
    for attempt in range(FETCH_ATTEMPTS):
        try:
            with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                body = response.read().decode("utf-8-sig")
            break
        except HTTPError as exc:
            last_error = exc
            if exc.code not in {429, 500, 502, 503, 504} or attempt == FETCH_ATTEMPTS - 1:
                raise LiveDataError(f"NASA FIRMS {source_id} is unavailable") from exc
        except (URLError, TimeoutError) as exc:
            last_error = exc
            if attempt == FETCH_ATTEMPTS - 1:
                raise LiveDataError(f"NASA FIRMS {source_id} is unavailable") from exc
        time.sleep(RETRY_BACKOFF_SECONDS * (2**attempt))
    else:
        raise LiveDataError(f"NASA FIRMS {source_id} is unavailable") from last_error
    try:
        frame = pd.read_csv(StringIO(body))
    except (pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
        raise LiveDataError(f"NASA FIRMS returned invalid data for {source_id}") from exc

    required = {"latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp"}
    if not required.issubset(frame.columns):
        raise LiveDataError(f"NASA FIRMS returned unexpected data for {source_id}")
    high_confidence = high_confidence_mask(frame)
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


def _safe_float(value) -> float | None:
    return None if pd.isna(value) else float(value)


def _safe_int(value) -> int | None:
    return None if pd.isna(value) else int(value)


def summarize_areas(areas: pd.DataFrame) -> list[dict]:
    """Serialize the per-area DataFrame for the API response.

    Deliberately excludes confidence_mean (mixes MODIS's numeric confidence
    with VIIRS's categorical confidence forced into a number) and the raw
    z_score/anomaly numbers (not yet validated for direct display). It does
    expose `baselineSource` ("historical" vs "same-batch-fallback") so the
    frontend can honestly label whether `historical_baseline()` found real
    multi-year history for that cell or fell back to same-batch stats.
    See docs/PRD review for why the rest stay out.
    """
    if areas.empty:
        return []
    summaries = []
    for area in areas.itertuples():
        summaries.append(
            {
                "areaId": str(area.area_id),
                "gridLat": float(area.grid_lat),
                "gridLon": float(area.grid_lon),
                "detections": _safe_int(area.detections),
                "modisDetections": _safe_int(area.modis_detections),
                "viirsDetections": _safe_int(area.viirs_detections),
                "activeDays": _safe_int(area.active_days),
                "consecutiveActiveDays": _safe_int(area.consecutive_active_days),
                "firstDate": str(area.first_date),
                "lastDate": str(area.last_date),
                "peakDate": str(area.peak_date),
                "frpSum": _safe_float(area.frp_sum),
                "frpMax": _safe_float(area.frp_max),
                "frpMean": _safe_float(area.frp_mean),
                "growth": _safe_float(area.growth),
                "attentionScore": _safe_float(area.attention_score),
                "attentionCriteria": str(area.attention_criteria),
                "priorityScore": _safe_float(area.priority_score),
                "priorityRank": _safe_int(area.priority_rank),
                "priorityTier": str(area.priority_tier),
                "baselineSource": str(getattr(area, "baseline_source", "same-batch-fallback")),
            }
        )
    return sorted(summaries, key=lambda item: item["priorityRank"] if item["priorityRank"] is not None else 10**9)


def process_live_frames(frames: list[pd.DataFrame], source_summaries: list[dict]) -> dict:
    if not frames:
        raise LiveDataError("All NASA FIRMS feeds are unavailable")
    detections = add_quality_flags(harmonize(pd.concat(frames, ignore_index=True, sort=False)))
    detections = detections[detections["quality_ok"]].reset_index(drop=True)
    detections = deduplicate_detections(detections)
    matches = match_modis_viirs(detections) if not detections.empty else pd.DataFrame(columns=["detection_id", "match_status", "matched_detection_id"])
    match_status = matches.set_index("detection_id")["match_status"].to_dict() if not matches.empty else {}
    # match_modis_viirs() only includes a "matched_detection_id" column when at
    # least one MATCHED pair exists (its row-dicts for MODIS_ONLY/VIIRS_ONLY
    # never set that key) -- guard against the column being entirely absent.
    matched_detection_id = (
        matches.set_index("detection_id")["matched_detection_id"].to_dict()
        if not matches.empty and "matched_detection_id" in matches.columns
        else {}
    )

    # Aggregate from harmonized events (MATCHED MODIS/VIIRS pairs collapsed to one
    # event, frp = max of the pair) so a single physical detection seen by both
    # sensors doesn't get double-counted into detections/frp_sum and inflate
    # attention/priority scores. Raw per-sensor modis/viirs_detections counts
    # below are then restored from the *raw* detections on purpose (coverage,
    # not a deduplicated count).
    events = build_harmonized_events(detections, matches)
    areas = aggregate_grid(events)
    raw_areas = aggregate_grid(detections)
    if not areas.empty and not raw_areas.empty:
        raw_counts = raw_areas[["area_id", "modis_detections", "viirs_detections"]]
        areas = areas.drop(columns=["modis_detections", "viirs_detections"]).merge(raw_counts, on="area_id", how="left")
        areas[["modis_detections", "viirs_detections"]] = areas[["modis_detections", "viirs_detections"]].fillna(0)

    areas = deterministic_priority(historical_baseline(attention_features(temporal_features(areas)), sqlite_path=default_historical_db_path()))
    area_lookup = areas.set_index("area_id").to_dict(orient="index") if not areas.empty else {}
    area_summaries = summarize_areas(areas)

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
        matched_id_raw = matched_detection_id.get(detection_id)
        matched_detection_id_value = int(matched_id_raw) if matched_id_raw is not None and matched_id_raw != -1 else None
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
                "matchedDetectionId": matched_detection_id_value,
                "attentionScore": float(area.get("attention_score", 0)),
                "priorityScore": float(area.get("priority_score", 0)),
                "priorityTier": str(area.get("priority_tier", "low")).upper(),
            }
        )

    matched_count = int((matches["match_status"] == "MATCHED").sum()) if not matches.empty else 0
    return {
        "markers": markers,
        "areas": area_summaries,
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
