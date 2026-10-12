from fastapi import FastAPI, Header, HTTPException

from fire_pipeline.live import LiveDataError, load_live_hotspots

app = FastAPI(title="FireWatch Live Processing API", version="1.0.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/live/hotspots")
def live_hotspots(
    map_key: str | None = Header(default=None, alias="X-FIRMS-Map-Key"),
) -> dict:
    try:
        return load_live_hotspots(map_key)
    except LiveDataError as exc:
        status = 503 if "not configured" in str(exc) else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc
