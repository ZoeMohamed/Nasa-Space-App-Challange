"""The array-based match_modis_viirs() must return exactly what the previous pandas-iterrows
implementation returned (tests/reference/matching_reference.py, copied verbatim from git before
the rewrite). Inputs are deliberately dense and ambiguous: many candidates per MODIS detection,
exact ties, day boundaries, unknown sensors and missing coordinates/timestamps."""

import numpy as np
import pandas as pd
import pytest

from fire_pipeline.matching import match_modis_viirs
from tests.reference.matching_reference import match_modis_viirs_reference


def _random_detections(seed: int, n: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    base = pd.Timestamp("2026-10-18 20:00")
    # Few distinct values on purpose -> many exact distance/time ties and crowded bins.
    lat = rng.choice(np.round(np.linspace(-2.6, -2.0, 25), 4), size=n)
    lon = rng.choice(np.round(np.linspace(113.4, 114.0, 25), 4), size=n)
    minutes = rng.choice(np.arange(0, 3 * 24 * 60, 37), size=n)
    sensor = rng.choice(["MODIS", "VIIRS", "VIIRS", "UNKNOWN"], size=n)
    frame = pd.DataFrame(
        {
            "latitude": lat,
            "longitude": lon,
            "acq_datetime": base + pd.to_timedelta(minutes, unit="m"),
            "sensor": sensor,
        }
    )
    frame.loc[rng.random(n) < 0.03, "latitude"] = np.nan
    frame.loc[rng.random(n) < 0.03, "acq_datetime"] = pd.NaT
    return frame


@pytest.mark.parametrize("seed", range(8))
@pytest.mark.parametrize("radius_km,time_minutes", [(10, 720), (5, 60), (20, 1440)])
def test_rewrite_matches_reference_exactly(seed, radius_km, time_minutes):
    frame = _random_detections(seed, 400)
    expected = match_modis_viirs_reference(frame, radius_km=radius_km, time_minutes=time_minutes)
    actual = match_modis_viirs(frame, radius_km=radius_km, time_minutes=time_minutes)
    pd.testing.assert_frame_equal(actual, expected, check_exact=True)


def test_rewrite_matches_reference_on_empty_sensor_groups():
    only_modis = pd.DataFrame(
        {"latitude": [-2.1, -2.2], "longitude": [113.5, 113.6], "acq_datetime": pd.to_datetime(["2026-10-18 01:00", "2026-10-18 02:00"]), "sensor": ["MODIS", "MODIS"]}
    )
    pd.testing.assert_frame_equal(match_modis_viirs(only_modis), match_modis_viirs_reference(only_modis), check_exact=True)
