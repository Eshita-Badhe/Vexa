from __future__ import annotations

import pandas as pd

from backend.utils.constants import REQUIRED_TELEMETRY_COLUMNS

NUMERIC_COLUMNS = [
    "bitrate",
    "buffering_time",
    "latency",
    "packet_loss",
    "jitter",
    "playback_failures",
    "crashes",
    "startup_time",
]


def validate_and_clean_telemetry(data):
    """Validate telemetry and clamp impossible values to explainable boundaries."""
    df = pd.DataFrame(data)
    if df.empty:
        raise ValueError("Telemetry payload is empty.")

    missing_columns = [column for column in REQUIRED_TELEMETRY_COLUMNS if column not in df.columns]
    if missing_columns:
        raise ValueError(f"Telemetry is missing required columns: {missing_columns}")

    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    if df["timestamp"].isna().any():
        raise ValueError("Some timestamps are invalid or missing.")

    for column in NUMERIC_COLUMNS:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    missing_numeric = df[NUMERIC_COLUMNS].isna().any()
    if missing_numeric.any():
        bad_columns = missing_numeric[missing_numeric].index.tolist()
        raise ValueError(f"Missing numeric telemetry values in: {bad_columns}")

    df["bitrate"] = df["bitrate"].clip(lower=0)
    df["buffering_time"] = df["buffering_time"].clip(lower=0)
    df["latency"] = df["latency"].clip(lower=0)
    df["packet_loss"] = df["packet_loss"].clip(lower=0, upper=100)
    df["jitter"] = df["jitter"].clip(lower=0)
    df["playback_failures"] = df["playback_failures"].clip(lower=0)
    df["crashes"] = df["crashes"].clip(lower=0)
    df["startup_time"] = df["startup_time"].clip(lower=0)

    if "server_load" in df.columns:
        df["server_load"] = pd.to_numeric(df["server_load"], errors="coerce")
        df["server_load"] = df["server_load"].clip(lower=0, upper=100)

    return df


def normalize_telemetry(data):
    return validate_and_clean_telemetry(data)
