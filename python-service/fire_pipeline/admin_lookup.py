"""Point -> kecamatan / kabupaten-kota / provinsi lookup (offline point-in-polygon).

Reads the store built by scripts/build_admin_boundaries.py (OCHA COD-AB Indonesia, BPS
boundaries valid 2020-04-01, 34 provinces -- predates the 2022 Papua split). No external API.

A point that falls in no polygon (offshore, or in a gap introduced by simplifying coastlines)
gets the nearest kecamatan within NEAREST_MAX_DEG instead, flagged `approximate: True`, so it is
never presented as an exact containment. Beyond that distance the result is None.
"""

import os
import sqlite3
from functools import lru_cache

import numpy as np
import shapely

NEAREST_MAX_DEG = 0.02  # ~2.2 km


def default_admin_db_path() -> str:
    return os.environ.get(
        "ADMIN_BOUNDARIES_DB",
        os.path.join(os.path.dirname(__file__), "..", "data", "admin_boundaries.sqlite"),
    )


class AdminIndex:
    def __init__(self, sqlite_path: str):
        con = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
        try:
            rows = con.execute(
                "SELECT adm3_name, adm3_pcode, adm2_name, adm2_pcode, adm1_name, adm1_pcode, geom_wkb FROM kecamatan"
            ).fetchall()
            self.meta = dict(con.execute("SELECT key, value FROM meta").fetchall())
        finally:
            con.close()
        self.records = [
            {
                "kecamatan": r[0], "kecamatanCode": r[1],
                "kabupatenKota": r[2], "kabupatenKotaCode": r[3],
                "provinsi": r[4], "provinsiCode": r[5],
            }
            for r in rows
        ]
        self.tree = shapely.STRtree(shapely.from_wkb([r[6] for r in rows]))
        self._kab_points: dict[str, shapely.Point] = {}

    def lookup_many(self, lats, lons) -> list[dict | None]:
        lats = np.asarray(lats, dtype=float)
        lons = np.asarray(lons, dtype=float)
        if lats.size == 0:
            return []
        points = shapely.points(lons, lats)
        result: list[dict | None] = [None] * len(points)

        point_idx, poly_idx = self.tree.query(points, predicate="within")
        for p, g in zip(point_idx, poly_idx):
            if result[p] is None:
                result[p] = {**self.records[g], "approximate": False}

        missing = [i for i, r in enumerate(result) if r is None]
        if missing:
            near_pt, near_poly = self.tree.query_nearest(
                points[missing], max_distance=NEAREST_MAX_DEG, all_matches=False
            )
            for local, g in zip(near_pt, near_poly):
                result[missing[local]] = {**self.records[g], "approximate": True}
        return result

    def lookup(self, lat: float, lon: float) -> dict | None:
        return self.lookup_many([lat], [lon])[0]

    def search(self, query: str, limit: int = 8) -> list[dict]:
        """Place-name search over kecamatan and kabupaten/kota names (case-insensitive).

        Each hit carries a point guaranteed to lie inside its polygon (point_on_surface), so
        picking it yields a location that the point-in-polygon lookup resolves back to the
        same place. Kecamatan hits rank before kabupaten/kota hits; prefix matches first.
        """
        needle = " ".join(query.casefold().split())
        if len(needle) < 2:
            return []
        candidates: list[tuple[tuple, str, int | str]] = []
        seen_kab: set[str] = set()
        for i, rec in enumerate(self.records):
            kec = rec["kecamatan"].casefold()
            if needle in kec:
                candidates.append(((0, 0 if kec.startswith(needle) else 1, len(kec)), "kecamatan", i))
            kab = rec["kabupatenKota"].casefold()
            if needle in kab and rec["kabupatenKotaCode"] not in seen_kab:
                seen_kab.add(rec["kabupatenKotaCode"])
                candidates.append(((1, 0 if kab.startswith(needle) else 1, len(kab)), "kabupatenKota", i))
        candidates.sort(key=lambda item: item[0])

        results = []
        for _, level, i in candidates[:limit]:
            rec = self.records[i]
            if level == "kecamatan":
                point = shapely.point_on_surface(self.tree.geometries[i])
                label = f"Kec. {rec['kecamatan']}, {rec['kabupatenKota']}, {rec['provinsi']}"
                kecamatan = rec["kecamatan"]
            else:
                point = self._kab_point(rec["kabupatenKotaCode"])
                label = f"{rec['kabupatenKota']}, {rec['provinsi']}"
                kecamatan = None
            results.append({
                "level": level,
                "label": label,
                "code": rec["kecamatanCode"] if level == "kecamatan" else rec["kabupatenKotaCode"],
                "kecamatan": kecamatan,
                "kabupatenKota": rec["kabupatenKota"],
                "provinsi": rec["provinsi"],
                "lat": round(float(point.y), 5),
                "lon": round(float(point.x), 5),
            })
        return results

    def _kab_point(self, kab_code: str):
        cached = self._kab_points.get(kab_code)
        if cached is None:
            parts = [g for g, r in zip(self.tree.geometries, self.records) if r["kabupatenKotaCode"] == kab_code]
            cached = shapely.point_on_surface(shapely.union_all(parts))
            self._kab_points[kab_code] = cached
        return cached


@lru_cache(maxsize=4)
def _load_index(path: str) -> AdminIndex | None:
    if not os.path.exists(path):
        return None
    return AdminIndex(path)


def get_admin_index(sqlite_path: str | None = None) -> AdminIndex | None:
    """Returns None when the store hasn't been built, so callers degrade to coordinates only."""
    return _load_index(os.path.abspath(sqlite_path or default_admin_db_path()))


def attach_admin(items: list[dict], lat_key: str = "lat", lon_key: str = "lng", sqlite_path: str | None = None) -> None:
    """Sets item["admin"] in place (None when unresolved or the store isn't built)."""
    index = get_admin_index(sqlite_path)
    if index is None or not items:
        for item in items:
            item["admin"] = None
        return
    resolved = index.lookup_many([i[lat_key] for i in items], [i[lon_key] for i in items])
    for item, admin in zip(items, resolved):
        item["admin"] = admin


def attach_dominant_area_admin(areas: list[dict], markers: list[dict]) -> None:
    """A 0.25° cell can span several kecamatan, so an area gets the kecamatan holding the most of
    its own detections (adminBasis="dominant-detections"), not a guess from the cell center."""
    counts: dict[str, dict[str, list]] = {}
    for marker in markers:
        admin = marker.get("admin")
        if not admin:
            continue
        bucket = counts.setdefault(marker["areaId"], {})
        entry = bucket.setdefault(admin["kecamatanCode"], [0, admin])
        entry[0] += 1
    for area in areas:
        bucket = counts.get(area["areaId"])
        if not bucket:
            area["admin"] = None
            continue
        top_count, top_admin = max(bucket.values(), key=lambda e: e[0])
        total = sum(e[0] for e in bucket.values())
        area["admin"] = {
            **top_admin,
            "adminBasis": "dominant-detections",
            "dominantShare": round(top_count / total, 3),
            "kecamatanCount": len(bucket),
        }


def format_admin_label(admin: dict | None) -> str | None:
    if not admin:
        return None
    label = f"Kec. {admin['kecamatan']}, {admin['kabupatenKota']}, {admin['provinsi']}"
    return f"± {label}" if admin.get("approximate") else label


CELL_SAMPLE_FRACTIONS = (1 / 6, 1 / 2, 5 / 6)


def cells_touching_province(grid_lats, grid_lons, provinsi: str, cell_size: float = 0.25, sqlite_path: str | None = None) -> set[tuple[float, float]]:
    """Grid cells (SW corner) with at least one of 9 sample points inside `provinsi`.

    Historical rows are 0.25° aggregates with no individual points, so a border cell can count
    for two provinces -- reported as-is rather than guessing which side its fires were on.
    Returns an empty set when the boundary store isn't built.
    """
    index = get_admin_index(sqlite_path)
    cells = sorted({(float(a), float(b)) for a, b in zip(grid_lats, grid_lons)})
    if index is None or not cells:
        return set()
    lats, lons, owners = [], [], []
    for cell in cells:
        for fy in CELL_SAMPLE_FRACTIONS:
            for fx in CELL_SAMPLE_FRACTIONS:
                lats.append(cell[0] + fy * cell_size)
                lons.append(cell[1] + fx * cell_size)
                owners.append(cell)
    target = provinsi.casefold()
    return {
        owner
        for owner, admin in zip(owners, index.lookup_many(lats, lons))
        if admin and admin["provinsi"].casefold() == target
    }


def filter_frame_to_province(data, provinsi: str | None, sqlite_path: str | None = None):
    """Filter a DataFrame with grid_lat/grid_lon columns to cells touching `provinsi`."""
    if not provinsi or data.empty:
        return data
    keep = cells_touching_province(data.grid_lat, data.grid_lon, provinsi, sqlite_path=sqlite_path)
    mask = [(float(a), float(b)) in keep for a, b in zip(data.grid_lat, data.grid_lon)]
    return data[mask]


def _code_field(code: str) -> str:
    """BPS-style p-codes nest by length: ID62 (provinsi), ID6271 (kab/kota), ID6271012 (kecamatan)."""
    return {4: "provinsiCode", 6: "kabupatenKotaCode"}.get(len(code), "kecamatanCode")


@lru_cache(maxsize=64)
def _admin_geometry(sqlite_path: str, code: str):
    index = get_admin_index(sqlite_path)
    if index is None:
        return None
    field = _code_field(code)
    parts = [geom for geom, rec in zip(index.tree.geometries, index.records) if rec[field] == code]
    if not parts:
        return None
    geometry = shapely.union_all(parts)
    shapely.prepare(geometry)
    return geometry


def cells_intersecting_admin(grid_lats, grid_lons, code: str, cell_size: float = 0.25, sqlite_path: str | None = None) -> set[tuple[float, float]]:
    """Grid cells (SW corner) whose 0.25° box intersects the polygon of a kecamatan / kabupaten-kota /
    provinsi p-code. Exact box-polygon intersection (not point sampling), so a kecamatan smaller than
    one cell is still found. Border cells count for every area they touch."""
    path = os.path.abspath(sqlite_path or default_admin_db_path())
    geometry = _admin_geometry(path, code)
    cells = sorted({(float(a), float(b)) for a, b in zip(grid_lats, grid_lons)})
    if geometry is None or not cells:
        return set()
    boxes = shapely.box([c[1] for c in cells], [c[0] for c in cells], [c[1] + cell_size for c in cells], [c[0] + cell_size for c in cells])
    hits = shapely.intersects(geometry, boxes)
    return {cell for cell, hit in zip(cells, hits) if hit}


def filter_frame_to_admin(data, code: str | None, sqlite_path: str | None = None):
    """Filter a DataFrame with grid_lat/grid_lon columns to cells intersecting admin area `code`."""
    if not code or data.empty:
        return data
    keep = cells_intersecting_admin(data.grid_lat, data.grid_lon, code, sqlite_path=sqlite_path)
    mask = [(float(a), float(b)) in keep for a, b in zip(data.grid_lat, data.grid_lon)]
    return data[mask]


# --- user-drawn area of interest ------------------------------------------------------------------

MAX_POLYGON_POINTS = 200


def parse_polygon(text: str | None):
    """A user-drawn area from "lat,lon;lat,lon;..." (at least 3 points, at most MAX_POLYGON_POINTS).

    Raises ValueError with a readable message for anything malformed, out of range, or with no area.
    A self-intersecting outline (e.g. points clicked out of order) is repaired with make_valid.
    """
    if not text:
        return None
    try:
        points = [tuple(float(value) for value in pair.split(",")) for pair in text.strip().strip(";").split(";")]
    except ValueError as exc:
        raise ValueError("polygon must be 'lat,lon;lat,lon;...'") from exc
    if any(len(point) != 2 for point in points):
        raise ValueError("polygon must be 'lat,lon;lat,lon;...'")
    if not 3 <= len(points) <= MAX_POLYGON_POINTS:
        raise ValueError(f"polygon needs 3 to {MAX_POLYGON_POINTS} points")
    if any(not (-90 <= lat <= 90 and -180 <= lon <= 180) for lat, lon in points):
        raise ValueError("polygon point out of range")
    polygon = shapely.make_valid(shapely.Polygon([(lon, lat) for lat, lon in points]))
    if polygon.is_empty or polygon.area == 0:
        raise ValueError("polygon has no area")
    shapely.prepare(polygon)
    return polygon


def cells_intersecting_polygon(grid_lats, grid_lons, polygon, cell_size: float = 0.25) -> set[tuple[float, float]]:
    """Grid cells (SW corner) whose 0.25° box intersects `polygon` -- same rule as an admin area."""
    cells = sorted({(float(a), float(b)) for a, b in zip(grid_lats, grid_lons)})
    if polygon is None or not cells:
        return set()
    boxes = shapely.box([c[1] for c in cells], [c[0] for c in cells], [c[1] + cell_size for c in cells], [c[0] + cell_size for c in cells])
    return {cell for cell, hit in zip(cells, shapely.intersects(polygon, boxes)) if hit}


def filter_frame_to_polygon(data, polygon):
    """Filter a DataFrame with grid_lat/grid_lon columns to cells intersecting a drawn area."""
    if polygon is None or data.empty:
        return data
    keep = cells_intersecting_polygon(data.grid_lat, data.grid_lon, polygon)
    mask = [(float(a), float(b)) in keep for a, b in zip(data.grid_lat, data.grid_lon)]
    return data[mask]
