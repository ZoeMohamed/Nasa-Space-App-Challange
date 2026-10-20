"""Read-WRITE SQLite store for community-submitted fire reports.

Unlike `historical.py` (a read-only store built offline by
scripts/build_historical_store.py), this module owns `data/reports.sqlite`
end to end: it creates the schema on first use (`CREATE TABLE IF NOT
EXISTS`) and both reads and writes at request time from the FastAPI routes
in main.py.

Deployment note: on a platform with an ephemeral filesystem (e.g. Vercel's
serverless functions), this is a bigger problem than it is for
`historical.sqlite`. The historical store is read-only, so re-deploying or
cold-starting a fresh instance just means re-reading the same bytes shipped
with the build. This store is written to at runtime (every report
submission and status update is an INSERT/UPDATE), so on an ephemeral
filesystem those writes can vanish between invocations/deploys -- there is
no durability guarantee here without moving to a persistent database or
external storage. That migration is explicitly out of scope for this
change; this docstring exists so it isn't silently forgotten.
"""

from __future__ import annotations

import os
import sqlite3
import uuid
from datetime import datetime, timezone

from .admin_lookup import attach_admin

ALLOWED_STATUSES = {"submitted", "under_review", "satellite_matched", "verified", "rejected"}


def default_reports_db_path() -> str:
    """Path to the runtime reports SQLite store. Overridable via
    FIRE_REPORTS_DB_PATH (used by tests, same pattern as
    FIRE_HISTORICAL_DB_PATH in live.py); resolved fresh on every call so an
    override set after import still takes effect.
    """
    override = os.getenv("FIRE_REPORTS_DB_PATH")
    if override:
        return override
    return os.path.join(os.path.dirname(__file__), "..", "data", "reports.sqlite")


def _connect(sqlite_path: str | None = None) -> sqlite3.Connection:
    path = sqlite_path or default_reports_db_path()
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    _ensure_schema(connection)
    return connection


def _ensure_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            observed_at TEXT NOT NULL,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL,
            submitter_token TEXT NOT NULL,
            photo_filename TEXT,
            review_note TEXT,
            reviewed_at TEXT
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS report_satellite_links (
            report_id TEXT NOT NULL,
            marker_id TEXT NOT NULL,
            distance_km REAL,
            time_diff_min REAL,
            created_at TEXT NOT NULL
        )
        """
    )
    connection.commit()


def _validate_lat_lon(lat, lon) -> tuple[float, float]:
    if lat is None or lon is None:
        raise ValueError("lat and lon are required")
    try:
        lat_value = float(lat)
        lon_value = float(lon)
    except (TypeError, ValueError) as exc:
        raise ValueError("lat and lon must be numbers") from exc
    if not (-90 <= lat_value <= 90):
        raise ValueError(f"lat must be between -90 and 90, got {lat_value}")
    if not (-180 <= lon_value <= 180):
        raise ValueError(f"lon must be between -180 and 180, got {lon_value}")
    return lat_value, lon_value


def _validate_description(description) -> str:
    if description is None or not str(description).strip():
        raise ValueError("description must not be empty")
    return str(description).strip()


def _validate_submitter_token(submitter_token) -> str:
    if submitter_token is None or not str(submitter_token).strip():
        raise ValueError("submitterToken must not be empty")
    return str(submitter_token).strip()


def _validate_status(status) -> str:
    if status not in ALLOWED_STATUSES:
        raise ValueError(f"status must be one of {sorted(ALLOWED_STATUSES)}, got {status!r}")
    return status


def _row_to_report(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "createdAt": row["created_at"],
        "observedAt": row["observed_at"],
        "lat": row["lat"],
        "lon": row["lon"],
        "description": row["description"],
        "status": row["status"],
        "submitterToken": row["submitter_token"],
        "photoFilename": row["photo_filename"],
        "reviewNote": row["review_note"],
        "reviewedAt": row["reviewed_at"],
    }


def create_report(
    lat,
    lon,
    description,
    observed_at=None,
    submitter_token=None,
    photo_filename=None,
    sqlite_path: str | None = None,
) -> dict:
    """Validate and insert a new report. Raises ValueError (caller maps to
    HTTP 422) on invalid lat/lon, empty description, or missing
    submitter_token -- never silently stores garbage.
    """
    lat_value, lon_value = _validate_lat_lon(lat, lon)
    description_value = _validate_description(description)
    submitter_token_value = _validate_submitter_token(submitter_token)

    report_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    observed_at_value = str(observed_at).strip() if observed_at else created_at
    status = "submitted"

    connection = _connect(sqlite_path)
    try:
        connection.execute(
            """
            INSERT INTO reports
                (id, created_at, observed_at, lat, lon, description, status,
                 submitter_token, photo_filename, review_note, reviewed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
            """,
            (
                report_id,
                created_at,
                observed_at_value,
                lat_value,
                lon_value,
                description_value,
                status,
                submitter_token_value,
                photo_filename,
            ),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    finally:
        connection.close()
    return _row_to_report(row)


def list_reports(submitter_token=None, status=None, sqlite_path: str | None = None) -> list[dict]:
    query = "SELECT * FROM reports"
    clauses, params = [], []
    if submitter_token:
        clauses.append("submitter_token = ?")
        params.append(submitter_token)
    if status:
        clauses.append("status = ?")
        params.append(status)
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY created_at DESC"

    connection = _connect(sqlite_path)
    try:
        rows = connection.execute(query, params).fetchall()
    finally:
        connection.close()
    reports = [_row_to_report(row) for row in rows]
    attach_admin(reports, lat_key="lat", lon_key="lon")
    return reports


def get_report(report_id: str, sqlite_path: str | None = None) -> dict | None:
    """Fetch one report with its correlated satellite links joined in, as
    `report["satelliteLinks"]`. Returns None if report_id doesn't exist
    (caller maps to HTTP 404).
    """
    connection = _connect(sqlite_path)
    try:
        row = connection.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
        if row is None:
            return None
        link_rows = connection.execute(
            """
            SELECT marker_id, distance_km, time_diff_min, created_at
            FROM report_satellite_links
            WHERE report_id = ?
            ORDER BY distance_km
            """,
            (report_id,),
        ).fetchall()
    finally:
        connection.close()

    report = _row_to_report(row)
    attach_admin([report], lat_key="lat", lon_key="lon")
    report["satelliteLinks"] = [
        {
            "markerId": link["marker_id"],
            "distanceKm": link["distance_km"],
            "timeDiffMin": link["time_diff_min"],
            "createdAt": link["created_at"],
        }
        for link in link_rows
    ]
    return report


def update_report_status(
    report_id: str, status, review_note=None, sqlite_path: str | None = None
) -> dict | None:
    """Update a report's status (and optional review note). Raises
    ValueError (caller maps to HTTP 422) if `status` isn't one of
    ALLOWED_STATUSES. Returns None if report_id doesn't exist (caller maps
    to HTTP 404) -- status is validated before the existence check, so an
    invalid status always 422s regardless of whether the id exists.
    """
    status_value = _validate_status(status)
    connection = _connect(sqlite_path)
    try:
        existing = connection.execute("SELECT id FROM reports WHERE id = ?", (report_id,)).fetchone()
        if existing is None:
            return None
        reviewed_at = datetime.now(timezone.utc).isoformat()
        connection.execute(
            "UPDATE reports SET status = ?, review_note = ?, reviewed_at = ? WHERE id = ?",
            (status_value, review_note, reviewed_at, report_id),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    finally:
        connection.close()
    return _row_to_report(row)


def update_photo_filename(report_id: str, photo_filename: str, sqlite_path: str | None = None) -> None:
    """Record the saved photo's filename against an already-created report
    (the photo is written to disk only after the report row exists, since
    the filename is derived from the generated report id).
    """
    connection = _connect(sqlite_path)
    try:
        connection.execute(
            "UPDATE reports SET photo_filename = ? WHERE id = ?", (photo_filename, report_id)
        )
        connection.commit()
    finally:
        connection.close()


def save_links(report_id: str, links: list[dict], sqlite_path: str | None = None) -> None:
    """Persist correlation results from correlation.correlate_report() --
    one row per {"markerId", "distanceKm", "timeDiffMin", ...} dict. No-op
    on an empty list.
    """
    if not links:
        return
    created_at = datetime.now(timezone.utc).isoformat()
    connection = _connect(sqlite_path)
    try:
        connection.executemany(
            """
            INSERT INTO report_satellite_links
                (report_id, marker_id, distance_km, time_diff_min, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (report_id, link["markerId"], link["distanceKm"], link["timeDiffMin"], created_at)
                for link in links
            ],
        )
        connection.commit()
    finally:
        connection.close()
