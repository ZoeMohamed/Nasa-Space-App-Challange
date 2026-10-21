import base64
import binascii
import os

import pandas as pd

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from fire_pipeline import reports as reports_store
from fire_pipeline.admin_lookup import get_admin_index, parse_polygon
from fire_pipeline.correlation import correlate_report
from fire_pipeline.historical import available_references, compare_live_to_baseline, load_calendar_summary, load_map_summary
from fire_pipeline.live import (
    REFERENCE_PLATFORMS,
    WINDOW_HOURS_BY_KEY,
    LiveDataError,
    default_historical_db_path,
    enabled_windows,
    load_live_hotspots,
    ensure_reference_counts,
    load_live_result,
    start_cache_warmer,
)
from fire_pipeline.live_calendar import live_months
from fire_pipeline.weather import fetch_weather_and_air_quality

app = FastAPI(title="AGNIBHUMI Live Processing API", version="1.1.0")


@app.on_event("startup")
def _warm_live_caches() -> None:
    """With NASA_FIRMS_MAP_KEY set on the backend and WARM_CACHE=1, pre-process every enabled
    window at startup and keep it fresh, so a demo never waits for a cold 7d/30d fetch."""
    key = os.getenv("NASA_FIRMS_MAP_KEY")
    if key and os.getenv("WARM_CACHE", "0") == "1":
        start_cache_warmer(key, enabled_windows())

MAX_PHOTO_BYTES = 5 * 1024 * 1024
_IMAGE_SIGNATURES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"GIF87a": "image/gif",
    b"GIF89a": "image/gif",
}


def _report_photos_dir() -> str:
    """Directory for saved report photos. Overridable via
    FIRE_REPORT_PHOTOS_DIR (used by tests); resolved fresh on every call,
    same pattern as fire_pipeline.live.default_historical_db_path.

    Deployment note: like reports.sqlite (see fire_pipeline/reports.py),
    this is local disk written at runtime -- on a platform with an
    ephemeral filesystem (e.g. Vercel) these files are not guaranteed to
    survive across invocations/deploys. No object storage integration is
    in scope here; this is a known prototype limitation.
    """
    override = os.getenv("FIRE_REPORT_PHOTOS_DIR")
    if override:
        return override
    return os.path.join(os.path.dirname(__file__), "data", "report_photos")


def _sniff_image_media_type(header: bytes) -> str | None:
    for signature, media_type in _IMAGE_SIGNATURES.items():
        if header.startswith(signature):
            return media_type
    return None


def _decode_and_validate_photo(photo_base64: str) -> bytes:
    """Decode a client-supplied base64 photo and reject anything that
    isn't plausibly a small image -- never trust the client blindly.
    Raises ValueError (caller maps to HTTP 422) on any problem.
    """
    try:
        photo_bytes = base64.b64decode(photo_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("photoBase64 is not valid base64") from exc
    if not photo_bytes:
        raise ValueError("photoBase64 decoded to empty content")
    if len(photo_bytes) > MAX_PHOTO_BYTES:
        raise ValueError("photo exceeds the maximum allowed size of 5MB")
    if _sniff_image_media_type(photo_bytes[:8]) is None:
        raise ValueError("photoBase64 does not look like a supported image (jpeg/png/gif)")
    return photo_bytes


class ReportCreateRequest(BaseModel):
    lat: float
    lon: float
    description: str
    observedAt: str | None = None
    submitterToken: str
    photoBase64: str | None = None


class ReportStatusUpdateRequest(BaseModel):
    status: str
    reviewNote: str | None = None


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/hotspots")
@app.get("/api/live/hotspots")
def live_hotspots(
    map_key: str | None = Header(default=None, alias="X-FIRMS-Map-Key"),
    include_all_confidence: bool = False,
    window: str = "24h",
    province: str | None = None,
    near_lat: float | None = None,
    near_lon: float | None = None,
    near_km: float | None = None,
    marker_id: str | None = None,
    limit: int = 3000,
    order: str = "frp",
) -> dict:
    """Live harmonized hotspots for `window` ("24h" default, "7d", "30d").

    Default confidence = FIRMS nominal + high; `include_all_confidence` adds "low". Filters
    (`province`, `near_lat`/`near_lon`/`near_km` up to 200 km, `marker_id`) are applied before
    the marker cap (`limit`, max 5000; `order` = "frp" or "recent"), so filtered requests get
    every matching marker. `meta.markers` reports total vs shown.
    """
    if window not in WINDOW_HOURS_BY_KEY:
        raise HTTPException(status_code=422, detail=f"window must be one of {sorted(WINDOW_HOURS_BY_KEY)}")
    if window not in enabled_windows():
        raise HTTPException(status_code=422, detail=f"window {window} is not enabled on this server (LIVE_WINDOWS)")
    if order not in {"frp", "recent"}:
        raise HTTPException(status_code=422, detail='order must be "frp" or "recent"')
    near = None
    if near_lat is not None and near_lon is not None:
        near = (near_lat, near_lon, min(max(near_km or 25.0, 0.1), 200.0))
    try:
        return load_live_hotspots(
            map_key,
            include_all_confidence=include_all_confidence,
            window=window,
            province=province,
            near=near,
            marker_id=marker_id,
            limit=max(1, min(limit, 5000)),
            order=order,
        )
    except LiveDataError as exc:
        status = 503 if "not configured" in str(exc) else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc


def _polygon(text: str | None):
    """Parse a drawn area of interest ("lat,lon;lat,lon;..."); 422 with the reason if malformed."""
    try:
        return parse_polygon(text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/historical/calendar")
def historical_calendar(
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lon: float | None = None,
    max_lon: float | None = None,
    province: str | None = None,
    admin_code: str | None = None,
    polygon: str | None = None,
) -> dict:
    """Monthly aggregated historical totals plus per-grid-cell monthly
    baseline stats, read from the offline historical SQLite store (see
    scripts/build_historical_store.py). Returns {"months": [], "cells": []}
    if that store hasn't been built yet. Optional bounding-box query params
    (min_lat/max_lat/min_lon/max_lon) restrict which grid cells are
    included; omit all four to get every cell in the store.
    """
    bounds = None
    if None not in (min_lat, max_lat, min_lon, max_lon):
        bounds = (min_lat, max_lat, min_lon, max_lon)
    return load_calendar_summary(default_historical_db_path(), bounds=bounds, province=province, admin_code=admin_code, polygon=_polygon(polygon))


@app.get("/api/historical/map")
def historical_map(
    days: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lon: float | None = None,
    max_lon: float | None = None,
    province: str | None = None,
    admin_code: str | None = None,
) -> dict:
    if days not in {None, 7, 30} or (days is None and (start_date is None or end_date is None)):
        raise HTTPException(status_code=400, detail="Historical map range must be 7 or 30 days, or include start_date and end_date")
    bounds = None
    if None not in (min_lat, max_lat, min_lon, max_lon):
        bounds = (min_lat, max_lat, min_lon, max_lon)
    try:
        return load_map_summary(default_historical_db_path(), days=days, bounds=bounds, start_date=start_date, end_date=end_date, province=province, admin_code=admin_code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid historical map date range") from exc


@app.get("/api/historical/unusual")
def historical_unusual(
    map_key: str | None = Header(default=None, alias="X-FIRMS-Map-Key"),
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lon: float | None = None,
    max_lon: float | None = None,
    province: str | None = None,
    admin_code: str | None = None,
    polygon: str | None = None,
) -> dict:
    """Live 24 h grid cells vs their own archive daily baseline, on a comparable sensor population.

    The reference VIIRS platform is the first of REFERENCE_PLATFORMS that is available BOTH in this
    live snapshot (its FIRMS feed and MODIS_NRT answered) and in the archive (a table exists). When
    none is, the answer is `comparable: false` with the reason -- a count from a different VIIRS
    satellite is never compared against a Suomi-NPP baseline, because their daily counts differ.
    """
    area = _polygon(polygon)
    bounds = None
    if None not in (min_lat, max_lat, min_lon, max_lon):
        bounds = (min_lat, max_lat, min_lon, max_lon)
    try:
        result = ensure_reference_counts(load_live_result(map_key, window="24h"))
    except LiveDataError as exc:
        status = 503 if "not configured" in str(exc) else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    sqlite_path = default_historical_db_path()
    live_populations = result.meta.get("referencePopulations", {})
    archive_refs = available_references(sqlite_path)
    chosen = next((p for p in REFERENCE_PLATFORMS if live_populations.get(p, {}).get("available") and p in archive_refs), None)
    context = {
        "windowHours": 24,
        "generatedAt": result.meta.get("generatedAt"),
        "livePopulations": live_populations,
        "archiveReferences": archive_refs,
    }
    if chosen is None:
        reasons = []
        for platform in REFERENCE_PLATFORMS:
            live_info = live_populations.get(platform, {})
            if not live_info.get("available"):
                reasons.append(f"{platform}: live {live_info.get('reason') or 'unavailable'}")
            elif platform not in archive_refs:
                reasons.append(f"{platform}: no archive table built")
        return {"comparable": False, "reason": "; ".join(reasons), "summary": None, "cells": [], **context}
    # Seasonal baseline for the month the live window ends in (UTC).
    month = pd.Timestamp(result.meta.get("generatedAt") or pd.Timestamp.now(tz="UTC")).month
    comparison = compare_live_to_baseline(result.areas, sqlite_path, chosen, bounds=bounds, province=province, admin_code=admin_code, month=month, polygon=area)
    return {**comparison, **context}


@app.get("/api/historical/live-months")
def historical_live_months(
    map_key: str | None = Header(default=None, alias="X-FIRMS-Map-Key"),
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lon: float | None = None,
    max_lon: float | None = None,
    province: str | None = None,
    admin_code: str | None = None,
    polygon: str | None = None,
) -> dict:
    """Calendar months after the archive's end, from the longest enabled live window, on the
    archive's definitions (see fire_pipeline/live_calendar.py). Slow only on a cold live cache."""
    area = _polygon(polygon)
    bounds = None
    if None not in (min_lat, max_lat, min_lon, max_lon):
        bounds = (min_lat, max_lat, min_lon, max_lon)
    windows = [w for w in ("30d", "7d") if w in enabled_windows()]
    if not windows:
        return {"available": False, "reason": "no multi-day live window enabled (LIVE_WINDOWS)", "months": [], "monthToDate": None}
    try:
        result = load_live_result(map_key, window=windows[0])
    except LiveDataError as exc:
        status = 503 if "not configured" in str(exc) else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    return live_months(result, default_historical_db_path(), bounds=bounds, province=province, admin_code=admin_code, polygon=area)


@app.get("/api/weather")
def weather(lat: float, lon: float) -> dict:
    """Real current wind + air quality for one point (Open-Meteo, no API
    key). Never raises on a partial upstream failure -- see
    fetch_weather_and_air_quality()'s docstring; `wind`/`airQuality` are
    null and `errors` lists what failed instead.
    """
    return fetch_weather_and_air_quality(lat, lon)


@app.get("/api/region/search")
def region_search(q: str, limit: int = 8) -> dict:
    """Place-name search (kecamatan / kabupaten-kota) for picking a location without GPS."""
    index = get_admin_index()
    if index is None:
        return {"available": False, "results": []}
    return {"available": True, "results": index.search(q, limit=max(1, min(limit, 20)))}


@app.get("/api/region")
def region(lat: float, lon: float) -> dict:
    """Offline point-in-polygon lookup -> kecamatan / kabupaten-kota / provinsi.
    `admin` is null when the point is outside Indonesia's boundaries or the
    boundary store hasn't been built (`available: false`)."""
    index = get_admin_index()
    if index is None:
        return {"available": False, "admin": None, "source": None}
    return {
        "available": True,
        "admin": index.lookup(lat, lon),
        "source": {
            "name": index.meta.get("source"),
            "license": index.meta.get("license"),
            "validOn": index.meta.get("dataset_valid_on"),
        },
    }


@app.post("/api/reports", status_code=201)
def submit_report(payload: ReportCreateRequest) -> dict:
    """Submit a community fire report.

    Validates the photo (if any) before persisting anything, so an invalid
    photo never leaves a half-created report behind. Runs satellite
    correlation synchronously right after the report is saved; if the live
    hotspot feed is unavailable (e.g. NASA_FIRMS_MAP_KEY not configured, or
    the upstream fetch fails) the report is still saved with zero
    correlated links -- correlation failure must never block submission --
    and the response includes a `correlationWarning` note instead of
    erroring.
    """
    photo_bytes = None
    if payload.photoBase64:
        try:
            photo_bytes = _decode_and_validate_photo(payload.photoBase64)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        report = reports_store.create_report(
            lat=payload.lat,
            lon=payload.lon,
            description=payload.description,
            observed_at=payload.observedAt,
            submitter_token=payload.submitterToken,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if photo_bytes is not None:
        photos_dir = _report_photos_dir()
        os.makedirs(photos_dir, exist_ok=True)
        photo_filename = f"{report['id']}.jpg"
        with open(os.path.join(photos_dir, photo_filename), "wb") as handle:
            handle.write(photo_bytes)
        reports_store.update_photo_filename(report["id"], photo_filename)

    correlation_warning = None
    try:
        # Every marker near the report (not the capped national list), so correlation is complete.
        live_data = load_live_hotspots(near=(report["lat"], report["lon"], 10.0), limit=None)
        links = correlate_report(
            {"lat": report["lat"], "lon": report["lon"], "observed_at": report["observedAt"]},
            live_data.get("markers", []),
        )
        reports_store.save_links(report["id"], links)
    except Exception as exc:  # noqa: BLE001 -- live-fetch failure must not block submission
        correlation_warning = str(exc)

    detail = reports_store.get_report(report["id"])
    if correlation_warning:
        detail["correlationWarning"] = correlation_warning
    return detail


@app.get("/api/reports")
def list_reports(submitterToken: str | None = None, status: str | None = None) -> dict:
    return {"reports": reports_store.list_reports(submitter_token=submitterToken, status=status)}


@app.get("/api/reports/{report_id}")
def get_report(report_id: str) -> dict:
    report = reports_store.get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@app.patch("/api/reports/{report_id}")
def update_report(report_id: str, payload: ReportStatusUpdateRequest) -> dict:
    """Update a report's review status (e.g. moving it to under_review,
    verified, or rejected) and optionally attach a reviewer note.

    *** NO AUTHENTICATION OR AUTHORIZATION CHECK ***
    This endpoint is deliberately left open in the current prototype: any
    caller who can reach this API can change any report's status. This is
    an explicit, approved decision for this phase of the project -- NOT an
    oversight -- and is called out here precisely so it is visible to
    reviewers and must be revisited (e.g. gating this behind an
    operator/reviewer auth check) before any production exposure.
    """
    try:
        updated = reports_store.update_report_status(report_id, payload.status, review_note=payload.reviewNote)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return reports_store.get_report(report_id)


@app.get("/api/reports/{report_id}/photo")
def get_report_photo(report_id: str):
    report = reports_store.get_report(report_id)
    if report is None or not report.get("photoFilename"):
        raise HTTPException(status_code=404, detail="No photo for this report")
    path = os.path.join(_report_photos_dir(), report["photoFilename"])
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Photo file is missing on disk")
    with open(path, "rb") as handle:
        header = handle.read(8)
    media_type = _sniff_image_media_type(header) or "application/octet-stream"
    return FileResponse(path, media_type=media_type)
