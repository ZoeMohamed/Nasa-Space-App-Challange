"""Real current weather + air quality for a point, via Open-Meteo's free,
no-API-key endpoints (api.open-meteo.com + air-quality-api.open-meteo.com).

Implementation note: `openmeteo-requests`/`requests-cache`/`retry-requests`
were installed in requirements.txt for this feature, but that client's API
is built around its binary flatbuffer protocol for efficient bulk/historical
downloads -- overkill for a single "current conditions at one point" lookup,
which Open-Meteo's plain `current=` JSON query already serves directly and
simply. This module uses urllib (same as the rest of this pipeline, see
live.py) instead, for consistency and because it's genuinely simpler for
this scope. The three installed packages remain unused; that's a documented
choice, not an oversight.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
REQUEST_TIMEOUT_SECONDS = 10


class WeatherDataError(RuntimeError):
    pass


def _get_json(base_url: str, params: dict) -> dict:
    url = f"{base_url}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "AGNIBHUMI-Python/1.0"})
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as exc:
        raise WeatherDataError(str(exc)) from exc


def _us_aqi_category(us_aqi: float | None) -> str | None:
    """Standard US EPA AQI breakpoints (not Indonesia's ISPU, which uses
    different pollutant breakpoints -- Open-Meteo's `us_aqi` field is
    genuinely the US scale, so this must not be relabeled as ISPU."""
    if us_aqi is None:
        return None
    if us_aqi <= 50:
        return "Baik"
    if us_aqi <= 100:
        return "Sedang"
    if us_aqi <= 150:
        return "Tidak sehat (kelompok sensitif)"
    if us_aqi <= 200:
        return "Tidak sehat"
    if us_aqi <= 300:
        return "Sangat tidak sehat"
    return "Berbahaya"


def fetch_weather_and_air_quality(lat: float, lon: float) -> dict:
    """Best-effort real current conditions for one point. Each of the two
    upstream calls can fail independently (different Open-Meteo services);
    a failure on one never blocks the other -- the response says plainly
    which parts are unavailable rather than silently omitting them.
    """
    result: dict = {
        "lat": lat,
        "lon": lon,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "wind": None,
        "airQuality": None,
        "source": "Open-Meteo (api.open-meteo.com, air-quality-api.open-meteo.com)",
        "errors": [],
    }

    try:
        weather = _get_json(
            FORECAST_URL,
            {
                "latitude": lat,
                "longitude": lon,
                "current": "wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m",
                "timezone": "UTC",
            },
        )
        current = weather.get("current", {})
        result["wind"] = {
            "windSpeedKmh": current.get("wind_speed_10m"),
            "windDirectionDeg": current.get("wind_direction_10m"),
            "temperatureC": current.get("temperature_2m"),
            "relativeHumidityPct": current.get("relative_humidity_2m"),
            "observedAt": current.get("time"),
        }
    except WeatherDataError as exc:
        result["errors"].append(f"Weather forecast unavailable: {exc}")

    try:
        air_quality = _get_json(
            AIR_QUALITY_URL,
            {
                "latitude": lat,
                "longitude": lon,
                "current": "pm2_5,pm10,us_aqi",
                "timezone": "UTC",
            },
        )
        current = air_quality.get("current", {})
        us_aqi = current.get("us_aqi")
        result["airQuality"] = {
            "pm2_5": current.get("pm2_5"),
            "pm10": current.get("pm10"),
            "usAqi": us_aqi,
            "usAqiCategory": _us_aqi_category(us_aqi),
            "observedAt": current.get("time"),
        }
    except WeatherDataError as exc:
        result["errors"].append(f"Air quality unavailable: {exc}")

    return result
