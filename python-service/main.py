from fastapi import FastAPI, Header, HTTPException

from fire_pipeline.historical import load_calendar_summary, load_map_summary
from fire_pipeline.live import LiveDataError, default_historical_db_path, load_live_hotspots

app = FastAPI(title="FireWatch Live Processing API", version="1.0.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/hotspots")
@app.get("/api/live/hotspots")
def live_hotspots(
    map_key: str | None = Header(default=None, alias="X-FIRMS-Map-Key"),
) -> dict:
    try:
        return load_live_hotspots(map_key)
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
