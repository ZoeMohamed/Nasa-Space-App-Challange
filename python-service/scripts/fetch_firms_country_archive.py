#!/usr/bin/env python3
"""Download the official yearly NASA FIRMS files for Indonesia.

FIRMS publishes one Standard Processing CSV per country, sensor, and year at
``/data/country``.  This downloader keeps the original files, combines each
sensor into the input expected by ``build_historical_store.py``, and writes a
provenance manifest.  The current year is intentionally not synthesized here;
the application merges current NRT observations from the authenticated Area
API at request time.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path


BASE_URL = "https://firms.modaps.eosdis.nasa.gov/data/country"
INDEX_URL = f"{BASE_URL}/yearly_summary_files.txt"
USER_AGENT = "AGNIBHUMI/1.0 (NASA FIRMS production archive ingest)"
PRODUCTS = {
    "MODIS_SP": re.compile(r"^modis_(\d{4})_Indonesia\.csv$"),
    "VIIRS_SNPP_SP": re.compile(r"^viirs-snpp_(\d{4})_Indonesia\.csv$"),
    "VIIRS_NOAA20_SP": re.compile(r"^viirs-jpss1_(\d{4})_Indonesia\.csv$"),
}


def _request(url: str):
    return urllib.request.Request(url, headers={"User-Agent": USER_AGENT})


def _read_index() -> dict[str, list[dict[str, object]]]:
    with urllib.request.urlopen(_request(INDEX_URL), timeout=90) as response:
        rows = csv.DictReader(line.decode("utf-8") for line in response)
        selected = {product: [] for product in PRODUCTS}
        for row in rows:
            filename = row["filename"]
            for product, pattern in PRODUCTS.items():
                match = pattern.match(filename)
                if match:
                    selected[product].append(
                        {
                            "filename": filename,
                            "year": int(match.group(1)),
                            "publishedSize": int(row["size"]),
                            "updated": row["updated"],
                        }
                    )
        for files in selected.values():
            files.sort(key=lambda item: int(item["year"]))
        return selected


def _valid_csv(path: Path, expected_size: int) -> bool:
    if not path.exists() or path.stat().st_size != expected_size:
        return False
    with path.open("rb") as handle:
        return handle.readline().startswith(b"latitude,longitude,")


def _download(item: dict[str, object], destination: Path) -> dict[str, object]:
    expected_size = int(item["publishedSize"])
    if not _valid_csv(destination, expected_size):
        temporary = destination.with_suffix(".tmp")
        with urllib.request.urlopen(_request(f"{BASE_URL}/{item['filename']}"), timeout=180) as response:
            with temporary.open("wb") as target:
                shutil.copyfileobj(response, target)
        if not _valid_csv(temporary, expected_size):
            temporary.unlink(missing_ok=True)
            raise RuntimeError(f"Invalid FIRMS file: {item['filename']}")
        temporary.replace(destination)

    digest = hashlib.sha256()
    with destination.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return {**item, "sha256": digest.hexdigest(), "size": destination.stat().st_size}


def _combine(files: list[dict[str, object]], chunks: Path, destination: Path) -> int:
    temporary = destination.with_suffix(".tmp")
    row_count = 0
    header: bytes | None = None
    with temporary.open("wb") as target:
        for item in files:
            with (chunks / str(item["filename"])).open("rb") as source:
                current_header = source.readline()
                if header is None:
                    header = current_header
                    target.write(current_header)
                elif current_header != header:
                    raise RuntimeError(f"FIRMS schema changed in {item['filename']}")
                for line in source:
                    target.write(line)
                    row_count += 1
    temporary.replace(destination)
    return row_count


def run(output_dir: str, workers: int) -> dict[str, object]:
    output = Path(output_dir).resolve()
    chunks = output / "yearly"
    chunks.mkdir(parents=True, exist_ok=True)
    selected = _read_index()

    manifest: dict[str, object] = {
        "provider": "NASA LANCE FIRMS",
        "dataset": "Yearly country summaries, Standard Processing",
        "country": "Indonesia",
        "indexUrl": INDEX_URL,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "products": {},
    }

    for product, files in selected.items():
        if not files:
            raise RuntimeError(f"No official Indonesia files found for {product}")
        print(f"{product}: {len(files)} yearly files", flush=True)
        completed: list[dict[str, object]] = []
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(_download, item, chunks / str(item["filename"])): item
                for item in files
            }
            for index, future in enumerate(as_completed(futures), 1):
                completed.append(future.result())
                if index % 5 == 0 or index == len(files):
                    print(f"  downloaded {index}/{len(files)}", flush=True)
        completed.sort(key=lambda item: int(item["year"]))
        combined = output / f"{product}.csv"
        rows = _combine(completed, chunks, combined)
        manifest["products"][product] = {
            "firstYear": completed[0]["year"],
            "lastYear": completed[-1]["year"],
            "rows": rows,
            "combinedFile": combined.name,
            "files": completed,
        }
        print(f"  combined {rows:,} rows -> {combined}", flush=True)

    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="python-service/data/firms_country_archive")
    parser.add_argument("--workers", type=int, default=6)
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    run(arguments.output_dir, arguments.workers)
