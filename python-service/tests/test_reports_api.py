import base64
import io

from fastapi.testclient import TestClient
from PIL import Image

import main
from fire_pipeline.access import report_limiter
from fire_pipeline.live import LiveDataError

PUBLIC_HEADERS: dict[str, str] = {}

# A real, minimal 1x1 transparent PNG, base64-encoded.
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY"
    "42YAAAAASUVORK5CYII="
)


def _configure_storage(tmp_path, monkeypatch):
    monkeypatch.setenv("FIRE_REPORTS_DB_PATH", str(tmp_path / "reports.sqlite"))
    monkeypatch.setenv("FIRE_REPORT_PHOTOS_DIR", str(tmp_path / "report_photos"))
    monkeypatch.setenv("ENABLE_CITIZEN_REPORTS", "true")
    monkeypatch.setenv("ENABLE_PUBLIC_REPORT_REVIEW", "true")
    report_limiter.reset()


def _no_live_markers(map_key=None, **_kwargs):
    return {"markers": [], "areas": [], "meta": {}}


def test_submit_report_appears_in_list_and_detail(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)

    response = client.post(
        "/api/reports",
        json={
            "lat": -2.0,
            "lon": 104.8,
            "description": "Smoke visible over the ridge",
            "submitterToken": "reporter-1",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["lat"] == -2.0
    assert body["lon"] == 104.8
    assert body["description"] == "Smoke visible over the ridge"
    assert body["status"] == "submitted"
    assert body["submitterToken"] == "reporter-1"
    assert body["satelliteLinks"] == []
    report_id = body["id"]
    assert report_id

    list_response = client.get("/api/reports", params={"submitterToken": "reporter-1"})
    assert list_response.status_code == 200
    ids = [report["id"] for report in list_response.json()["reports"]]
    assert report_id in ids

    detail_response = client.get(f"/api/reports/{report_id}", params={"submitterToken": "reporter-1"})
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["id"] == report_id
    assert detail["satelliteLinks"] == []


def test_submit_report_with_invalid_lat_lon_returns_422_and_nothing_persisted(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)

    response = client.post(
        "/api/reports",
        json={"lat": 999.0, "lon": 104.8, "description": "bad", "submitterToken": "reporter-1"},
    )
    assert response.status_code == 422

    listing = client.get("/api/reports", headers=PUBLIC_HEADERS).json()
    assert listing["reports"] == []


def test_submit_report_with_empty_description_returns_422_and_nothing_persisted(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)

    response = client.post(
        "/api/reports",
        json={"lat": -2.0, "lon": 104.8, "description": "   ", "submitterToken": "reporter-1"},
    )
    assert response.status_code == 422

    listing = client.get("/api/reports", headers=PUBLIC_HEADERS).json()
    assert listing["reports"] == []


def test_correlation_links_marker_within_window_and_excludes_marker_outside_it(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)

    near_marker = {
        "id": "VIIRS_NRT-202610170230--2.00500-104.80500",
        "lat": -2.005,
        "lng": 104.805,
        "frp": 42.0,
        "sensor": "VIIRS",
        "matchStatus": "UNMATCHED",
        "acquiredAt": "2026-10-17T02:30:00Z",
    }
    far_marker = {
        "id": "MODIS_NRT-202610170230--3.50000-106.30000",
        "lat": -3.5,
        "lng": 106.3,
        "frp": 55.0,
        "sensor": "MODIS",
        "matchStatus": "UNMATCHED",
        "acquiredAt": "2026-10-17T02:30:00Z",
    }
    stale_marker = {
        "id": "MODIS_NRT-202610140230--2.00500-104.80500",
        "lat": -2.005,
        "lng": 104.805,
        "frp": 30.0,
        "sensor": "MODIS",
        "matchStatus": "UNMATCHED",
        "acquiredAt": "2026-10-14T02:30:00Z",  # 3 days before observedAt -> outside 24h window
    }

    def _fake_live(map_key=None, **_kwargs):
        return {"markers": [near_marker, far_marker, stale_marker], "areas": [], "meta": {}}

    monkeypatch.setattr(main, "load_live_hotspots", _fake_live)
    client = TestClient(main.app)

    response = client.post(
        "/api/reports",
        json={
            "lat": -2.0,
            "lon": 104.8,
            "description": "Fire near the river",
            "observedAt": "2026-10-17T03:00:00+00:00",
            "submitterToken": "reporter-2",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert "correlationWarning" not in body

    links = body["satelliteLinks"]
    linked_marker_ids = {link["markerId"] for link in links}
    assert near_marker["id"] in linked_marker_ids
    assert far_marker["id"] not in linked_marker_ids
    assert stale_marker["id"] not in linked_marker_ids

    near_link = next(link for link in links if link["markerId"] == near_marker["id"])
    assert near_link["distanceKm"] < 5.0
    assert near_link["timeDiffMin"] < 24 * 60

    # Confirm the same links are visible on a subsequent GET (persisted, not just in the POST response).
    detail = client.get(f"/api/reports/{body['id']}", params={"submitterToken": "reporter-2"}).json()
    assert {link["markerId"] for link in detail["satelliteLinks"]} == {near_marker["id"]}


def test_patch_status_update_persists_and_rejects_invalid_status(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)

    created = client.post(
        "/api/reports",
        json={"lat": -2.0, "lon": 104.8, "description": "Fire report", "submitterToken": "reporter-3"},
    ).json()
    report_id = created["id"]

    valid_response = client.patch(
        f"/api/reports/{report_id}",
        json={"status": "verified", "reviewNote": "Confirmed by field team"},
        headers=PUBLIC_HEADERS,
    )
    assert valid_response.status_code == 200
    assert valid_response.json()["status"] == "verified"
    assert valid_response.json()["reviewNote"] == "Confirmed by field team"

    confirm = client.get(f"/api/reports/{report_id}", params={"submitterToken": "reporter-3"}).json()
    assert confirm["status"] == "verified"
    assert confirm["reviewNote"] == "Confirmed by field team"

    invalid_response = client.patch(f"/api/reports/{report_id}", json={"status": "not_a_real_status"}, headers=PUBLIC_HEADERS)
    assert invalid_response.status_code == 422

    # The bad status attempt must not have clobbered the previously-persisted valid status.
    still_verified = client.get(f"/api/reports/{report_id}", params={"submitterToken": "reporter-3"}).json()
    assert still_verified["status"] == "verified"


def test_patch_nonexistent_report_returns_404(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    client = TestClient(main.app)
    response = client.patch("/api/reports/does-not-exist", json={"status": "verified"}, headers=PUBLIC_HEADERS)
    assert response.status_code == 404


def test_submit_report_when_live_fetch_unavailable_still_saves_with_no_links(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)

    def _raise_unavailable(map_key=None, **_kwargs):
        raise LiveDataError("NASA_FIRMS_MAP_KEY is not configured")

    monkeypatch.setattr(main, "load_live_hotspots", _raise_unavailable)
    client = TestClient(main.app)

    response = client.post(
        "/api/reports",
        json={"lat": -2.0, "lon": 104.8, "description": "Fire despite outage", "submitterToken": "reporter-4"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["satelliteLinks"] == []
    assert "correlationWarning" in body
    assert "NASA_FIRMS_MAP_KEY" in body["correlationWarning"]

    # Report itself is durably saved even though correlation failed.
    detail = client.get(f"/api/reports/{body['id']}", params={"submitterToken": "reporter-4"})
    assert detail.status_code == 200
    assert detail.json()["satelliteLinks"] == []


def test_get_nonexistent_report_returns_404(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    client = TestClient(main.app)
    response = client.get("/api/reports/does-not-exist")
    assert response.status_code == 404


def test_submit_and_fetch_photo_round_trip(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)

    response = client.post(
        "/api/reports",
        json={
            "lat": -2.0,
            "lon": 104.8,
            "description": "Fire with photo",
            "submitterToken": "reporter-5",
            "photoBase64": TINY_PNG_B64,
        },
    )
    assert response.status_code == 201
    report_id = response.json()["id"]
    assert response.json()["photoFilename"] == f"{report_id}.jpg"

    # The stored photo is always a fresh JPEG, whatever format was uploaded.
    photo_response = client.get(f"/api/reports/{report_id}/photo", params={"submitterToken": "reporter-5"})
    assert photo_response.status_code == 200
    assert photo_response.headers["content-type"] == "image/jpeg"
    assert photo_response.content[:3] == b"\xff\xd8\xff"

    # The reporter token is required; public and unrelated tokens cannot fetch it.
    assert client.get(f"/api/reports/{report_id}/photo").status_code == 404
    assert client.get(f"/api/reports/{report_id}/photo", params={"submitterToken": "someone-else"}).status_code == 404
    assert client.get(f"/api/reports/{report_id}/photo", headers=PUBLIC_HEADERS).status_code == 404


def test_submit_report_with_invalid_photo_bytes_returns_422_and_nothing_persisted(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)

    not_an_image = base64.b64encode(b"this is just plain text, not an image").decode("ascii")
    response = client.post(
        "/api/reports",
        json={
            "lat": -2.0,
            "lon": 104.8,
            "description": "Fire with bogus photo",
            "submitterToken": "reporter-6",
            "photoBase64": not_an_image,
        },
    )
    assert response.status_code == 422

    listing = client.get("/api/reports", headers=PUBLIC_HEADERS).json()
    assert listing["reports"] == []


def test_photo_endpoint_404_when_no_photo_was_submitted(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)

    report_id = client.post(
        "/api/reports",
        json={"lat": -2.0, "lon": 104.8, "description": "No photo here", "submitterToken": "reporter-7"},
    ).json()["id"]

    response = client.get(f"/api/reports/{report_id}/photo", params={"submitterToken": "reporter-7"})
    assert response.status_code == 404


# --- Public access and abuse protection -------------------------------------


def _submit(client, token="reporter-x", lat=-2.123456, lon=104.876543, **extra):
    response = client.post(
        "/api/reports",
        json={"lat": lat, "lon": lon, "description": "Asap tebal", "submitterToken": token, **extra},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_public_list_is_reduced_and_token_can_filter_own_reports(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)
    mine = _submit(client, token="alice")
    _submit(client, token="bob")

    assert client.get("/api/reports").json()["reports"] == []
    assert client.get("/api/reports", headers={"X-Officer-Key": "wrong"}).json()["reports"] == []

    own = client.get("/api/reports", params={"submitterToken": "alice"}).json()["reports"]
    assert [r["id"] for r in own] == [mine["id"]]

    assert client.get("/api/reports", headers=PUBLIC_HEADERS).json()["reports"] == []


def test_public_access_needs_no_special_header(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)
    report = _submit(client)

    assert client.get("/api/reports", headers={"X-Officer-Key": ""}).status_code == 200
    response = client.patch(f"/api/reports/{report['id']}", json={"status": "verified"}, headers=PUBLIC_HEADERS)
    assert response.status_code == 200


def test_patch_is_public(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)
    report = _submit(client, token="alice")

    response = client.patch(f"/api/reports/{report['id']}", json={"status": "verified"})
    assert response.status_code == 200
    assert client.get(f"/api/reports/{report['id']}").json()["status"] == "verified"


def test_submission_and_public_review_are_disabled_by_default(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setenv("ENABLE_CITIZEN_REPORTS", "false")
    monkeypatch.setenv("ENABLE_PUBLIC_REPORT_REVIEW", "false")
    client = TestClient(main.app)

    blocked = client.post(
        "/api/reports",
        json={"lat": -2.0, "lon": 104.8, "description": "Smoke", "submitterToken": "reporter"},
    )
    assert blocked.status_code == 503

    monkeypatch.setenv("ENABLE_CITIZEN_REPORTS", "true")
    report = _submit(client)
    monkeypatch.setenv("ENABLE_PUBLIC_REPORT_REVIEW", "false")
    assert client.patch(f"/api/reports/{report['id']}", json={"status": "verified"}).status_code == 403


def test_e2e_reports_are_marked_and_hidden_from_public_routes(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)
    report = _submit(client, token="e2e-owner", description="E2E production guard fixture")
    client.patch(f"/api/reports/{report['id']}", json={"status": "verified"})

    assert client.get("/api/reports/public").json()["reports"] == []
    assert client.get(f"/api/reports/{report['id']}").status_code == 404
    owner = client.get(
        f"/api/reports/{report['id']}", params={"submitterToken": "e2e-owner"}
    ).json()
    assert owner["isTest"] is True


def test_public_list_shows_only_verified_reports_without_private_fields(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)
    verified = _submit(client, token="alice", photoBase64=TINY_PNG_B64)
    _submit(client, token="bob")  # stays unreviewed
    client.patch(
        f"/api/reports/{verified['id']}",
        json={"status": "verified", "reviewNote": "Dicek tim Daops, pemilik lahan Pak X"},
        headers=PUBLIC_HEADERS,
    )

    public = client.get("/api/reports/public").json()["reports"]
    assert [r["id"] for r in public] == [verified["id"]]
    item = public[0]
    assert "submitterToken" not in item
    assert item["photoFilename"] is None
    assert item["reviewNote"] is None
    assert item["lat"] == -2.12 and item["lon"] == 104.88
    assert item["locationPrecision"] == "approximate"


def test_full_report_detail_requires_owner_token(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)
    report = _submit(client, token="alice")
    report_id = report["id"]

    assert client.get(f"/api/reports/{report_id}").status_code == 404
    assert client.get(f"/api/reports/{report_id}", params={"submitterToken": "bob"}).status_code == 404
    owner = client.get(f"/api/reports/{report_id}", params={"submitterToken": "alice"}).json()
    assert owner["submitterToken"] == "alice"
    assert owner["lat"] == -2.123456

    client.patch(f"/api/reports/{report_id}", json={"status": "verified"}, headers=PUBLIC_HEADERS)
    stranger = client.get(f"/api/reports/{report_id}").json()
    assert "submitterToken" not in stranger
    assert stranger["lat"] == -2.12


def test_uploaded_photo_is_reencoded_without_exif_gps(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    client = TestClient(main.app)

    image = Image.new("RGB", (40, 20), (200, 80, 20))
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make
    gps = exif.get_ifd(0x8825)
    gps[1] = "S"
    gps[2] = (2.0, 7.0, 24.0)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif.tobytes())
    with Image.open(io.BytesIO(buffer.getvalue())) as original:
        assert original.getexif().get(0x010F) == "PhoneMaker"  # sanity: input really has EXIF

    report = _submit(client, token="alice", photoBase64=base64.b64encode(buffer.getvalue()).decode("ascii"))
    stored = client.get(f"/api/reports/{report['id']}/photo", params={"submitterToken": "alice"}).content
    with Image.open(io.BytesIO(stored)) as cleaned:
        assert cleaned.format == "JPEG"
        assert cleaned.size == (40, 20)
        assert len(cleaned.getexif()) == 0
    assert b"PhoneMaker" not in stored


def test_report_submission_is_rate_limited_per_token(tmp_path, monkeypatch):
    _configure_storage(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "load_live_hotspots", _no_live_markers)
    monkeypatch.setattr(report_limiter, "limit", 2)
    client = TestClient(main.app)

    _submit(client, token="spammer")
    _submit(client, token="spammer")
    blocked = client.post(
        "/api/reports",
        json={"lat": -2.0, "lon": 104.8, "description": "again", "submitterToken": "spammer"},
        headers={"X-Forwarded-For": "203.0.113.9"},
    )
    assert blocked.status_code == 429
    # A blocked attempt stores nothing.
    assert len(client.get("/api/reports", params={"submitterToken": "spammer"}).json()["reports"]) == 2
