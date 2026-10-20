import numpy as np
import pandas as pd


def haversine_km(lat1, lon1, lat2, lon2):
    radians = np.pi / 180
    value = (
        np.sin((lat2 - lat1) * radians / 2) ** 2
        + np.cos(lat1 * radians)
        * np.cos(lat2 * radians)
        * np.sin((lon2 - lon1) * radians / 2) ** 2
    )
    return 6371.0088 * 2 * np.arcsin(np.sqrt(np.clip(value, 0, 1)))


def match_modis_viirs(df, radius_km=10, time_minutes=720):
    """Match one MODIS detection to at most one nearby VIIRS detection.

    This is a greedy, deterministic one-to-one matcher: MODIS detections are
    sorted (by time, lat, lon, id) and matched in that fixed order to the
    nearest unused VIIRS candidate within `radius_km` and `time_minutes`, so
    the same input always produces the same output. It is NOT a globally
    optimal assignment (e.g. not a min-cost bipartite matching) -- a
    different, still-valid greedy visiting order could in principle pick a
    different pairing for an ambiguous cluster of nearby detections. Treat
    `match_status`/`matched_detection_id` as a reasonable, reproducible
    heuristic pairing, not a guaranteed-optimal one.

    `time_minutes` default was 60 and was changed to 720 (12h) after
    measuring it directly against real live NASA FIRMS data: dozens of
    MODIS/VIIRS detection pairs within 1km of each other (almost certainly
    the same physical fire) had time gaps of 128-891 minutes, because
    MODIS (Terra/Aqua) and VIIRS (SNPP/NOAA-20/21) are different satellite
    constellations with genuinely different overpass times over the same
    location -- a 60-minute window produced zero MATCHED pairs even on real
    data with obvious spatial overlap. 720 minutes covers same-day overpass
    offsets between constellations without crossing into a different day;
    it is still a real constraint, not "always match" -- 2 of the 40
    measured close-by pairs (849, 891 min) still fall outside it.

    Implementation note (2026-10-20): rewritten from pandas iterrows()/.loc row access to plain
    numpy arrays + Python lists purely for speed (~2 ms/row before, which made 7- and 30-day windows
    and a medium+high-confidence archive impractical). The algorithm is unchanged: same sort order,
    same spatial/day bins, same candidate tests, the same scalar haversine_km() call per candidate
    and the same (distance, time_diff, detection_id, index) tie-break tuple. Output equality with the
    previous implementation is locked in by tests/test_matching_equivalence.py.
    """
    data = df.reset_index(drop=True).copy()
    data["detection_id"] = np.arange(len(data))
    order = ["acq_datetime", "latitude", "longitude", "detection_id"]
    modis = data[data.sensor.eq("MODIS")].dropna(subset=["latitude", "longitude", "acq_datetime"]).sort_values(order)
    viirs = data[data.sensor.eq("VIIRS")].dropna(subset=["latitude", "longitude", "acq_datetime"]).sort_values(order)
    step = max(radius_km / 111.0, 0.01)
    day_ns = 86_400 * 1_000_000_000

    def columns(frame):
        lat = frame.latitude.to_numpy(dtype="float64")
        lon = frame.longitude.to_numpy(dtype="float64")
        t_ns = frame.acq_datetime.to_numpy(dtype="datetime64[ns]").astype("int64")
        return (
            frame.index.to_numpy(),
            lat,
            lon,
            t_ns,
            np.floor(lat / step).astype("int64"),
            np.floor(lon / step).astype("int64"),
            np.floor_divide(t_ns, day_ns),
            frame.detection_id.to_numpy(),
        )

    v_index, v_lat, v_lon, v_t, v_latbin, v_lonbin, v_day, v_id = columns(viirs)
    bins: dict[tuple[int, int, int], list[int]] = {}
    for pos in range(len(v_index)):
        bins.setdefault((int(v_latbin[pos]), int(v_lonbin[pos]), int(v_day[pos])), []).append(pos)

    m_index, m_lat, m_lon, m_t, m_latbin, m_lonbin, m_day, m_id = columns(modis)
    used_pos: set[int] = set()
    rows = []
    for mpos in range(len(m_index)):
        lat, lon, t = m_lat[mpos], m_lon[mpos], int(m_t[mpos])
        latbin, lonbin, day = int(m_latbin[mpos]), int(m_lonbin[mpos]), int(m_day[mpos])
        candidates = []
        for latitude_offset in (-1, 0, 1):
            for longitude_offset in (-1, 0, 1):
                for day_offset in (-1, 0, 1):
                    for vpos in bins.get((latbin + latitude_offset, lonbin + longitude_offset, day + day_offset), ()):
                        if vpos in used_pos:
                            continue
                        time_difference = abs((t - int(v_t[vpos])) / 1e9) / 60
                        if time_difference <= time_minutes:
                            distance = float(haversine_km(lat, lon, v_lat[vpos], v_lon[vpos]))
                            if distance <= radius_km:
                                candidates.append((distance, time_difference, int(v_id[vpos]), int(v_index[vpos]), vpos))
        modis_id = int(m_id[mpos])
        if candidates:
            distance, time_difference, viirs_id, _, vpos = min(candidates)
            used_pos.add(vpos)
            rows.extend(
                [
                    {"detection_id": modis_id, "sensor": "MODIS", "match_status": "MATCHED", "matched_detection_id": viirs_id, "distance_km": distance, "time_diff_min": time_difference},
                    {"detection_id": viirs_id, "sensor": "VIIRS", "match_status": "MATCHED", "matched_detection_id": modis_id, "distance_km": distance, "time_diff_min": time_difference},
                ]
            )
        else:
            rows.append({"detection_id": modis_id, "sensor": "MODIS", "match_status": "MODIS_ONLY"})

    for vpos in range(len(v_index)):
        if vpos not in used_pos:
            rows.append({"detection_id": int(v_id[vpos]), "sensor": "VIIRS", "match_status": "VIIRS_ONLY"})
    represented = {row["detection_id"] for row in rows}
    for detection_id, sensor in zip(data.detection_id.to_numpy(), data.sensor.to_numpy()):
        if int(detection_id) not in represented and sensor in {"MODIS", "VIIRS"}:
            rows.append({"detection_id": int(detection_id), "sensor": sensor, "match_status": f"{sensor}_ONLY"})
    return pd.DataFrame(rows).sort_values("detection_id").reset_index(drop=True).fillna({"matched_detection_id": -1})
