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


def match_modis_viirs_reference(df, radius_km=10, time_minutes=720):
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
    """
    data = df.reset_index(drop=True).copy()
    data["detection_id"] = np.arange(len(data))
    order = ["acq_datetime", "latitude", "longitude", "detection_id"]
    modis = data[data.sensor.eq("MODIS")].dropna(subset=["latitude", "longitude", "acq_datetime"]).sort_values(order)
    viirs = data[data.sensor.eq("VIIRS")].dropna(subset=["latitude", "longitude", "acq_datetime"]).sort_values(order)
    step = max(radius_km / 111.0, 0.01)
    bins = {}
    for index, detection in viirs.iterrows():
        key = (
            int(np.floor(detection.latitude / step)),
            int(np.floor(detection.longitude / step)),
            detection.acq_datetime.floor("D"),
        )
        bins.setdefault(key, []).append(index)

    used, rows = set(), []
    for _, detection in modis.iterrows():
        key = (int(np.floor(detection.latitude / step)), int(np.floor(detection.longitude / step)))
        candidates = []
        for latitude_offset in (-1, 0, 1):
            for longitude_offset in (-1, 0, 1):
                for day_offset in (-1, 0, 1):
                    day = detection.acq_datetime.floor("D") + pd.Timedelta(days=day_offset)
                    for index in bins.get((key[0] + latitude_offset, key[1] + longitude_offset, day), []):
                        if index in used:
                            continue
                        candidate = viirs.loc[index]
                        time_difference = abs((detection.acq_datetime - candidate.acq_datetime).total_seconds()) / 60
                        if time_difference <= time_minutes:
                            distance = float(haversine_km(detection.latitude, detection.longitude, candidate.latitude, candidate.longitude))
                            if distance <= radius_km:
                                candidates.append((distance, time_difference, int(candidate.detection_id), index))
        if candidates:
            distance, time_difference, _, index = min(candidates)
            used.add(index)
            rows.extend(
                [
                    {"detection_id": int(detection.detection_id), "sensor": "MODIS", "match_status": "MATCHED", "matched_detection_id": int(data.loc[index].detection_id), "distance_km": distance, "time_diff_min": time_difference},
                    {"detection_id": int(data.loc[index].detection_id), "sensor": "VIIRS", "match_status": "MATCHED", "matched_detection_id": int(detection.detection_id), "distance_km": distance, "time_diff_min": time_difference},
                ]
            )
        else:
            rows.append({"detection_id": int(detection.detection_id), "sensor": "MODIS", "match_status": "MODIS_ONLY"})

    for index, detection in viirs.iterrows():
        if index not in used:
            rows.append({"detection_id": int(detection.detection_id), "sensor": "VIIRS", "match_status": "VIIRS_ONLY"})
    represented = {row["detection_id"] for row in rows}
    for _, detection in data.iterrows():
        if detection.detection_id not in represented and detection.sensor in {"MODIS", "VIIRS"}:
            rows.append({"detection_id": int(detection.detection_id), "sensor": detection.sensor, "match_status": f"{detection.sensor}_ONLY"})
    return pd.DataFrame(rows).sort_values("detection_id").reset_index(drop=True).fillna({"matched_detection_id": -1})
