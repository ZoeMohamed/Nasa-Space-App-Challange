import numpy as np
import pandas as pd


def harmonize(df):
    out = df.copy()
    out.columns = [str(column).strip().lower().replace(" ", "_") for column in out.columns]
    aliases = {"lat": "latitude", "lon": "longitude", "date": "acq_date", "time": "acq_time"}
    out = out.rename(columns={old: new for old, new in aliases.items() if old in out and new not in out})
    out["sensor"] = out["sensor"].astype(str).str.upper().map({"MODIS": "MODIS", "VIIRS": "VIIRS"}).fillna("UNKNOWN")
    if "source_file" not in out and "file" in out:
        out["source_file"] = out["file"]
    for column in ["latitude", "longitude", "brightness", "bright_ti4", "bright_t31", "bright_ti5", "frp", "scan", "track"]:
        if column in out:
            out[column] = pd.to_numeric(out[column], errors="coerce")
    if "brightness" not in out:
        out["brightness"] = out.get("bright_ti4", np.nan)
    elif "bright_ti4" in out:
        out["brightness"] = out["brightness"].fillna(out["bright_ti4"])
    if "acq_date" in out:
        times = out.get("acq_time", pd.Series("0000", index=out.index)).astype(str).str.zfill(4)
        out["acq_datetime"] = pd.to_datetime(out["acq_date"].astype(str) + " " + times, errors="coerce")
        out["datetime"] = out["acq_datetime"]
        out["date"] = out["acq_datetime"].dt.date.astype("string")
    if "confidence" in out:
        out["confidence_raw"] = out["confidence"]
        categories = out["confidence"].astype(str).str.strip().str.lower().map({"l": 30, "n": 70, "h": 95})
        out["confidence_num"] = pd.to_numeric(out["confidence"], errors="coerce").fillna(categories)
    return out.reset_index(drop=True)


def high_confidence_mask(frame, column="confidence"):
    """High-confidence row mask, shared by the live request path and the
    offline historical ingestion script so both apply the exact same filter.

    Deliberately unchanged threshold: numeric confidence > 80, OR
    categorical confidence == "h" (high). The audit behind this pipeline
    found this filter is strict -- especially for VIIRS, where only ~3.4%
    of rows are categorical "h" -- but the threshold itself is out of scope
    here and must not be loosened or tightened without a separate review.
    """
    text = frame[column].astype(str).str.strip().str.lower()
    number = pd.to_numeric(frame[column], errors="coerce")
    return number.gt(80) | text.eq("h")


def deduplicate_detections(df):
    """Remove identical sensor observations repeated across source files."""
    if df.empty:
        return df.copy()
    keys = ["sensor", "latitude", "longitude", "acq_datetime", "frp"]
    available_keys = [key for key in keys if key in df.columns]
    return df.drop_duplicates(subset=available_keys, keep="first").reset_index(drop=True)


def add_quality_flags(df):
    out = df.copy()
    out["quality_ok"] = True
    out["flag_missing_coordinate"] = False
    out["flag_invalid_coordinate"] = False
    out["flag_missing_datetime"] = out.get("acq_datetime", pd.Series(pd.NaT, index=out.index)).isna()
    keys = [column for column in ["sensor", "latitude", "longitude", "acq_datetime", "frp", "source_file"] if column in out]
    out["flag_duplicate"] = out.duplicated(subset=keys, keep=False) if keys else False
    for column in ["latitude", "longitude"]:
        if column in out:
            low, high = (-90, 90) if column == "latitude" else (-180, 180)
            out["flag_missing_coordinate"] |= out[column].isna()
            out["flag_invalid_coordinate"] |= ~out[column].between(low, high)
            out["quality_ok"] &= out[column].notna()
    if "frp" in out:
        out["flag_negative_frp"] = out.frp.lt(0)
        out["quality_ok"] &= out.frp.ge(0)
    out["quality_ok"] &= ~out["flag_missing_datetime"] & ~out["flag_invalid_coordinate"]
    return out
