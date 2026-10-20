#!/usr/bin/env python3
"""Offline build: kecamatan (ADM3) boundary store for point -> kecamatan/kab-kota/provinsi lookup.

Source: OCHA Common Operational Dataset - Administrative Boundaries (COD-AB) for Indonesia,
https://data.humdata.org/dataset/cod-ab-idn (BPS-derived, license CC BY-IGO, free).
Download `idn_admin_boundaries.gdb.zip`, unzip it, and pass the `.gdb` directory.

Known limitation: this dataset has 34 provinces -- it predates the 2022 Papua split (Papua
Selatan, Papua Tengah, Papua Pegunungan, Papua Barat Daya), so points there resolve to the
pre-2022 parent province names.

Usage (pyogrio is a build-only dependency, not needed at runtime):
    .venv/bin/pip install pyogrio
    .venv/bin/python -I scripts/build_admin_boundaries.py /path/to/idn_admin_boundaries.gdb \\
        --out data/admin_boundaries.sqlite
"""

import argparse
import datetime as dt
import os
import sqlite3

import pyogrio
import shapely

FIELDS = ["adm3_name", "adm3_pcode", "adm2_name", "adm2_pcode", "adm1_name", "adm1_pcode", "valid_on", "version"]
# ~55 m at the equator: keeps the store small while staying far below FIRMS pixel size (375 m-1 km).
DEFAULT_TOLERANCE_DEG = 0.0005


def build(gdb_path: str, out_path: str, tolerance: float = DEFAULT_TOLERANCE_DEG) -> int:
    meta, _, geometry, field_data = pyogrio.raw.read(gdb_path, layer="idn_admin3", columns=FIELDS)
    columns = dict(zip(meta["fields"], field_data))
    geoms = shapely.from_wkb(geometry)
    geoms = shapely.make_valid(shapely.simplify(geoms, tolerance, preserve_topology=True))
    bounds = shapely.bounds(geoms)

    if os.path.exists(out_path):
        os.remove(out_path)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    con = sqlite3.connect(out_path)
    con.execute(
        """CREATE TABLE kecamatan (
            adm3_pcode TEXT PRIMARY KEY, adm3_name TEXT NOT NULL,
            adm2_pcode TEXT, adm2_name TEXT, adm1_pcode TEXT, adm1_name TEXT,
            minx REAL, miny REAL, maxx REAL, maxy REAL, geom_wkb BLOB NOT NULL)"""
    )
    con.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
    rows = [
        (
            columns["adm3_pcode"][i], columns["adm3_name"][i],
            columns["adm2_pcode"][i], columns["adm2_name"][i],
            columns["adm1_pcode"][i], columns["adm1_name"][i],
            *map(float, bounds[i]), shapely.to_wkb(geoms[i]),
        )
        for i in range(len(geoms))
    ]
    con.executemany("INSERT INTO kecamatan VALUES (?,?,?,?,?,?,?,?,?,?,?)", rows)
    con.executemany(
        "INSERT INTO meta VALUES (?,?)",
        [
            ("source", "OCHA COD-AB Indonesia (BPS), https://data.humdata.org/dataset/cod-ab-idn"),
            ("license", "CC BY-IGO"),
            ("dataset_version", str(columns["version"][0])),
            ("dataset_valid_on", str(columns["valid_on"][0])),
            ("simplify_tolerance_deg", str(tolerance)),
            ("built_at", dt.datetime.now(dt.timezone.utc).isoformat()),
        ],
    )
    con.commit()
    con.close()
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("gdb_path")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data", "admin_boundaries.sqlite"))
    parser.add_argument("--tolerance", type=float, default=DEFAULT_TOLERANCE_DEG)
    args = parser.parse_args()
    count = build(args.gdb_path, args.out, args.tolerance)
    print(f"Wrote {count} kecamatan to {os.path.abspath(args.out)} ({os.path.getsize(args.out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
