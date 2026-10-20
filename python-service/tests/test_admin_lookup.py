import sqlite3

import pytest
import shapely

from fire_pipeline.admin_lookup import (
    AdminIndex,
    attach_admin,
    attach_dominant_area_admin,
    format_admin_label,
    get_admin_index,
)


def _square(minx, miny, size=1.0):
    return shapely.box(minx, miny, minx + size, miny + size)


@pytest.fixture
def store(tmp_path):
    path = tmp_path / "admin.sqlite"
    con = sqlite3.connect(path)
    con.execute(
        """CREATE TABLE kecamatan (adm3_pcode TEXT PRIMARY KEY, adm3_name TEXT, adm2_pcode TEXT, adm2_name TEXT,
        adm1_pcode TEXT, adm1_name TEXT, minx REAL, miny REAL, maxx REAL, maxy REAL, geom_wkb BLOB)"""
    )
    con.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
    for code, name, geom in [("K1", "Alpha", _square(0, 0)), ("K2", "Beta", _square(1, 0))]:
        con.execute(
            "INSERT INTO kecamatan VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (code, name, "B1", "Kab. Uji", "P1", "Provinsi Uji", *shapely.bounds(geom), shapely.to_wkb(geom)),
        )
    con.commit()
    con.close()
    return str(path)


def test_point_inside_polygon_is_exact(store):
    admin = AdminIndex(store).lookup(lat=0.5, lon=0.5)
    assert admin["kecamatan"] == "Alpha"
    assert admin["provinsi"] == "Provinsi Uji"
    assert admin["approximate"] is False


def test_point_just_outside_falls_back_to_nearest_flagged_approximate(store):
    admin = AdminIndex(store).lookup(lat=0.5, lon=2.01)  # 0.01° east of Beta
    assert admin["kecamatan"] == "Beta"
    assert admin["approximate"] is True
    assert format_admin_label(admin).startswith("± ")


def test_point_far_from_any_polygon_is_none(store):
    assert AdminIndex(store).lookup(lat=10.0, lon=10.0) is None


def test_missing_store_degrades_to_none(tmp_path):
    assert get_admin_index(str(tmp_path / "does-not-exist.sqlite")) is None
    items = [{"lat": 0.5, "lng": 0.5}]
    attach_admin(items, sqlite_path=str(tmp_path / "does-not-exist.sqlite"))
    assert items[0]["admin"] is None


def test_area_gets_kecamatan_with_most_detections(store):
    markers = [
        {"lat": 0.5, "lng": 0.5, "areaId": "A"},
        {"lat": 0.5, "lng": 1.5, "areaId": "A"},
        {"lat": 0.6, "lng": 1.6, "areaId": "A"},
    ]
    attach_admin(markers, sqlite_path=store)
    areas = [{"areaId": "A"}, {"areaId": "EMPTY"}]
    attach_dominant_area_admin(areas, markers)
    assert areas[0]["admin"]["kecamatan"] == "Beta"
    assert areas[0]["admin"]["dominantShare"] == pytest.approx(2 / 3, abs=1e-3)
    assert areas[0]["admin"]["kecamatanCount"] == 2
    assert areas[1]["admin"] is None


def test_cells_touching_province_includes_border_cells_in_both(store, tmp_path):
    from fire_pipeline.admin_lookup import cells_touching_province

    # Provinces split at lon 1.0: the cell starting at lon 0.875 straddles both.
    con = sqlite3.connect(store)
    con.execute("UPDATE kecamatan SET adm1_name = 'Provinsi Timur' WHERE adm3_pcode = 'K2'")
    con.commit()
    con.close()
    lats = [0.25, 0.25, 0.25]
    lons = [0.25, 0.875, 1.5]
    west = cells_touching_province(lats, lons, "provinsi uji", sqlite_path=store)
    east = cells_touching_province(lats, lons, "Provinsi Timur", sqlite_path=store)
    assert west == {(0.25, 0.25), (0.25, 0.875)}
    assert east == {(0.25, 0.875), (0.25, 1.5)}


def test_search_ranks_kecamatan_before_kabupaten_and_points_resolve_back(store):
    index = AdminIndex(store)
    hits = index.search("alp")
    assert hits[0]["level"] == "kecamatan" and hits[0]["kecamatan"] == "Alpha"
    assert index.lookup(hits[0]["lat"], hits[0]["lon"])["kecamatan"] == "Alpha"

    kab_hits = index.search("kab. uji")
    assert kab_hits == [hit for hit in kab_hits if hit["level"] == "kabupatenKota"]
    assert len(kab_hits) == 1  # one hit per kabupaten, not one per kecamatan inside it
    assert index.lookup(kab_hits[0]["lat"], kab_hits[0]["lon"]) is not None


def test_search_ignores_too_short_queries(store):
    assert AdminIndex(store).search("a") == []


def test_cells_intersecting_admin_finds_area_smaller_than_a_cell(tmp_path):
    from fire_pipeline.admin_lookup import cells_intersecting_admin

    path = tmp_path / "small.sqlite"
    con = sqlite3.connect(path)
    con.execute(
        """CREATE TABLE kecamatan (adm3_pcode TEXT PRIMARY KEY, adm3_name TEXT, adm2_pcode TEXT, adm2_name TEXT,
        adm1_pcode TEXT, adm1_name TEXT, minx REAL, miny REAL, maxx REAL, maxy REAL, geom_wkb BLOB)"""
    )
    con.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
    tiny = shapely.box(0.30, 0.30, 0.33, 0.33)  # well inside cell (0.25, 0.25), missed by 1/6-1/2-5/6 sampling
    con.execute(
        "INSERT INTO kecamatan VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ("ID0101001", "Kecil", "ID0101", "Kab", "ID01", "Prov", *shapely.bounds(tiny), shapely.to_wkb(tiny)),
    )
    con.commit()
    con.close()
    cells = cells_intersecting_admin([0.0, 0.25, 0.5], [0.0, 0.25, 0.5], "ID0101001", sqlite_path=str(path))
    assert cells == {(0.25, 0.25)}
    assert cells_intersecting_admin([0.25], [0.25], "ID0101", sqlite_path=str(path)) == {(0.25, 0.25)}  # kabupaten level
