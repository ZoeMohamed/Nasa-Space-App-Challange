import base64
import binascii
import os

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from fire_pipeline import reports as reports_store
from fire_pipeline.correlation import correlate_report
from fire_pipeline.historical import load_calendar_summary, load_map_summary
from fire_pipeline.live import LiveDataError, default_historical_db_path, load_live_hotspots
from fire_pipeline.weather import fetch_weather_and_air_quality

app = FastAPI(title="FireWatch Live Processing API", version="1.0.0")

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
) -> dict:
    try:
        return load_live_hotspots(map_key, include_all_confidence=include_all_confidence)
    except LiveDataError as exc:
        status = 503 if "not configured" in str(exc) else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@app.get("/api/historical/calendar")
def historical_calendar(
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lon: float | None = None,
    max_lon: float | None = None,
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
    return load_calendar_summary(default_historical_db_path(), bounds=bounds)


@app.get("/api/historical/map")
def historical_map(
    days: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lon: float | None = None,
    max_lon: float | None = None,
) -> dict:
    if days not in {None, 7, 30} or (days is None and (start_date is None or end_date is None)):
        raise HTTPException(status_code=400, detail="Historical map range must be 7 or 30 days, or include start_date and end_date")
    bounds = None
    if None not in (min_lat, max_lat, min_lon, max_lon):
        bounds = (min_lat, max_lat, min_lon, max_lon)
    try:
        return load_map_summary(default_historical_db_path(), days=days, bounds=bounds, start_date=start_date, end_date=end_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid historical map date range") from exc


@app.get("/api/weather")
def weather(lat: float, lon: float) -> dict:
    """Real current wind + air quality for one point (Open-Meteo, no API
    key). Never raises on a partial upstream failure -- see
    fetch_weather_and_air_quality()'s docstring; `wind`/`airQuality` are
    null and `errors` lists what failed instead.
    """
    return fetch_weather_and_air_quality(lat, lon)


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
        live_data = load_live_hotspots()
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
