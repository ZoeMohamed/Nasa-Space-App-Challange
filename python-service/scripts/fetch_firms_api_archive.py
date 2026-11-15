#!/usr/bin/env python3
"""Download real Indonesia fire detections from the production NASA FIRMS API.

The FIRMS Area API accepts at most five days per request. This script reads the
official availability endpoint, downloads every available Standard Processing
and NRT chunk used by AGNIBHUMI, clips the bounding-box response to Indonesia's
ADM0 boundary, and writes one CSV per source for build_historical_store.py.

NASA_FIRMS_MAP_KEY must be present in the environment. The key is never written
to logs or the provenance manifest.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import shutil
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import shapely
from shapely.geometry import shape


FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api"
BOUNDARY_API = "https://www.geoboundaries.org/api/current/gbOpen/IDN/ADM0/"
SOURCES = (
    "MODIS_SP",
    "MODIS_NRT",
    "VIIRS_SNPP_SP",
    "VIIRS_SNPP_NRT",
    "VIIRS_NOAA20_SP",
    "VIIRS_NOAA20_NRT",
)
DAY_RANGE = 5
USER_AGENT = "AGNIBHUMI/1.0 (NASA FIRMS production archive ingest)"
_GEOMETRY_LOCK = threading.Lock()


def _get(url: str, attempts: int = 5) -> bytes:
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=90) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                return response.read()
        except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            if attempt == attempts - 1:
                raise RuntimeError(f"FIRMS request failed after {attempts} attempts: {type(exc).__name__}") from exc
            time.sleep(2**attempt)
    raise AssertionError("unreachable")


def _json(url: str) -> dict:
    return json.loads(_get(url))


def _availability(map_key: str) -> dict[str, tuple[date, date]]:
    body = _get(f"{FIRMS_BASE}/data_availability/csv/{map_key}/all").decode("utf-8")
    rows = csv.DictReader(io.StringIO(body))
    return {
        row["data_id"]: (date.fromisoformat(row["min_date"]), date.fromisoformat(row["max_date"]))
        for row in rows
    }


def _boundary() -> tuple[object, dict]:
    metadata = _json(BOUNDARY_API)
    geojson = _json(metadata["gjDownloadURL"])
    features = geojson.get("features") or []
    if not features:
        raise RuntimeError("Indonesia boundary download contained no features")
    geometry = shapely.union_all([shape(feature["geometry"]) for feature in features])
    return geometry, metadata


def _chunks(start: date, end: date):
    current = start
    while current <= end:
        days = min(DAY_RANGE, (end - current).days + 1)
        yield current, days
        current += timedelta(days=days)


def _valid_cached_chunk(path: Path) -> bool:
    if not path.exists() or path.stat().st_size == 0:
        return False
    with path.open("r", encoding="utf-8", newline="") as handle:
        return handle.readline().startswith("latitude,")


def _fetch_chunk(
    map_key: str,
    source: str,
    bounds: str,
    start: date,
    days: int,
    boundary,
    destination: Path,
) -> tuple[str, int | None, int, bool]:
    if _valid_cached_chunk(destination):
        with destination.open("r", encoding="utf-8", newline="") as handle:
            kept = max(sum(1 for _ in handle) - 1, 0)
        # Cached chunks contain the already-clipped Indonesia result. The
        # original bounding-box row count is no longer available, so return
        # None instead of inventing a value for provenance.
        return start.isoformat(), None, kept, True

    url = f"{FIRMS_BASE}/area/csv/{map_key}/{source}/{bounds}/{days}/{start.isoformat()}"
    body = _get(url).decode("utf-8-sig")
    if not body.startswith("latitude,"):
        raise RuntimeError(f"NASA FIRMS returned an invalid CSV for {source} {start.isoformat()}")

    frame = pd.read_csv(io.StringIO(body))
    received = len(frame)
    if received:
        # GEOS can crash when the same large multipolygon is queried by several Python threads.
        # Network I/O remains parallel; only this fast in-memory point-in-country step is serialized.
        with _GEOMETRY_LOCK:
            inside = shapely.intersects_xy(boundary, frame["longitude"].to_numpy(), frame["latitude"].to_numpy())
        frame = frame.loc[inside]

    temporary = destination.with_suffix(".tmp")
    frame.to_csv(temporary, index=False)
    temporary.replace(destination)
    return start.isoformat(), received, len(frame), False


def _combine_chunks(source: str, chunk_dir: Path, output: Path) -> int:
    files = sorted(chunk_dir.glob(f"{source}-*.csv"))
    if not files:
        raise RuntimeError(f"No downloaded chunks found for {source}")

    row_count = 0
    temporary = output.with_suffix(".tmp")
    with temporary.open("wb") as target:
        for index, source_file in enumerate(files):
            with source_file.open("rb") as chunk:
                header = chunk.readline()
                if index == 0:
                    target.write(header)
                shutil.copyfileobj(chunk, target)
            with source_file.open("r", encoding="utf-8", newline="") as chunk:
                row_count += max(sum(1 for _ in chunk) - 1, 0)
    temporary.replace(output)
    return row_count


def run(args) -> dict:
    map_key = os.getenv("NASA_FIRMS_MAP_KEY")
    if not map_key:
        raise SystemExit("NASA_FIRMS_MAP_KEY is required")

    output_dir = Path(args.output_dir).resolve()
    chunk_dir = output_dir / "chunks"
    chunk_dir.mkdir(parents=True, exist_ok=True)

    availability = _availability(map_key)
    boundary, boundary_meta = _boundary()
    min_lon, min_lat, max_lon, max_lat = boundary.bounds
    bounds = f"{min_lon:.6f},{min_lat:.6f},{max_lon:.6f},{max_lat:.6f}"

    selected_sources = args.source or list(SOURCES)
    manifest = {
        "provider": "NASA FIRMS production API",
        "api": FIRMS_BASE,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "country": "Indonesia",
        "boundary": {
            "id": boundary_meta["boundaryID"],
            "source": boundary_meta["boundarySource"],
            "license": boundary_meta["boundaryLicense"],
            "url": boundary_meta["gjDownloadURL"],
        },
        "sources": {},
    }

    for source in selected_sources:
        if source not in availability:
            raise RuntimeError(f"NASA FIRMS did not report availability for {source}")
        available_start, available_end = availability[source]
        start = max(available_start, date.fromisoformat(args.start_date)) if args.start_date else available_start
        end = min(available_end, date.fromisoformat(args.end_date)) if args.end_date else available_end
        if start > end:
            continue

        jobs = list(_chunks(start, end))
        received_total = 0
        kept_total = 0
        cached_total = 0
        print(f"{source}: {start}..{end} ({len(jobs)} API requests)", flush=True)
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {
                executor.submit(
                    _fetch_chunk,
                    map_key,
                    source,
                    bounds,
                    chunk_start,
                    days,
                    boundary,
                    chunk_dir / f"{source}-{chunk_start.isoformat()}.csv",
                ): chunk_start
                for chunk_start, days in jobs
            }
            for completed, future in enumerate(as_completed(futures), 1):
                _, received, kept, cached = future.result()
                if received is not None:
                    received_total += received
                kept_total += kept
                cached_total += int(cached)
                if completed % 100 == 0 or completed == len(futures):
                    print(f"  {completed}/{len(futures)} chunks, {kept_total:,} Indonesia rows", flush=True)

        output = output_dir / f"{source}.csv"
        rows = _combine_chunks(source, chunk_dir, output)
        manifest["sources"][source] = {
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "requests": len(jobs),
            "cachedRequests": cached_total,
            "receivedBoundingBoxRows": None if cached_total else received_total,
            "indonesiaRows": rows,
            "file": output.name,
        }

    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Production FIRMS files and provenance: {output_dir}", flush=True)
    return manifest


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="python-service/data/firms_api")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--source", action="append", choices=SOURCES)
    parser.add_argument("--start-date", help="Optional lower date bound for a partial refresh")
    parser.add_argument("--end-date", help="Optional upper date bound for a partial refresh")
    return parser.parse_args(argv)


if __name__ == "__main__":
    run(parse_args())
