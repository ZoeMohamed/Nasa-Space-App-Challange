from fastapi.testclient import TestClient

import main
from fire_pipeline import weather


def test_fetch_weather_and_air_quality_combines_both_sources(monkeypatch):
    def fake_get_json(base_url, params):
        if base_url == weather.FORECAST_URL:
            return {"current": {"wind_speed_10m": 12.5, "wind_direction_10m": 180, "temperature_2m": 31.2, "relative_humidity_2m": 60, "time": "2026-10-18T04:00"}}
        if base_url == weather.AIR_QUALITY_URL:
            return {"current": {"pm2_5": 104.3, "pm10": 109.2, "us_aqi": 79, "time": "2026-10-18T04:00"}}
        raise AssertionError(f"unexpected base_url {base_url}")

    monkeypatch.setattr(weather, "_get_json", fake_get_json)

    result = weather.fetch_weather_and_air_quality(-3.125, 114.15)

    assert result["errors"] == []
    assert result["wind"]["windSpeedKmh"] == 12.5
    assert result["wind"]["windDirectionDeg"] == 180
    assert result["airQuality"]["usAqi"] == 79
    # US AQI 79 falls in the 51-100 EPA band -> "Sedang", not relabeled as ISPU.
    assert result["airQuality"]["usAqiCategory"] == "Sedang"


def test_fetch_weather_and_air_quality_partial_failure_is_honest(monkeypatch):
    def fake_get_json(base_url, params):
        if base_url == weather.FORECAST_URL:
            raise weather.WeatherDataError("upstream timed out")
        return {"current": {"pm2_5": 10.0, "pm10": 12.0, "us_aqi": 20, "time": "2026-10-18T04:00"}}

    monkeypatch.setattr(weather, "_get_json", fake_get_json)

    result = weather.fetch_weather_and_air_quality(-3.125, 114.15)

    assert result["wind"] is None
    assert result["airQuality"] is not None
    assert len(result["errors"]) == 1
    assert "Weather forecast unavailable" in result["errors"][0]


def test_weather_endpoint_returns_real_shape(monkeypatch):
    def fake_fetch(lat, lon):
        return {"lat": lat, "lon": lon, "wind": None, "airQuality": None, "errors": [], "source": "Open-Meteo", "fetchedAt": "2026-10-18T04:00:00+00:00"}

    monkeypatch.setattr(main, "fetch_weather_and_air_quality", fake_fetch)

    client = TestClient(main.app)
    response = client.get("/api/weather", params={"lat": -3.125, "lon": 114.15})

    assert response.status_code == 200
    body = response.json()
    assert body["lat"] == -3.125
    assert body["lon"] == 114.15
