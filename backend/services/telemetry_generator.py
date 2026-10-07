from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List

import numpy as np
import pandas as pd

from backend.services.telemetry_processor import validate_and_clean_telemetry
from backend.utils.constants import CDNS, DEVICES, REGIONS, RESOLUTIONS, SCENARIO_NAMES


def _base_bitrate_for_scenario(scenario: str, progress: float, rng: np.random.Generator) -> float:
    if scenario == "healthy":
        return 8.5 + rng.normal(0.0, 1.0)
    if scenario == "network_congestion":
        return 7.0 * (1.0 - progress * 0.7) + rng.normal(0.0, 0.6)
    if scenario == "cdn_degradation":
        return 6.5 * (1.0 - progress * 0.45) + rng.normal(0.1, 0.5)
    if scenario == "server_overload":
        return 5.8 * (1.0 - progress * 0.35) + rng.normal(0.0, 0.7)
    if scenario == "application_failure":
        return 7.8 + rng.normal(0.0, 0.8)
    raise ValueError(f"Unsupported scenario: {scenario}")


def _build_record(
    scenario: str,
    timestamp: datetime,
    session_id: str,
    region: str,
    device: str,
    cdn: str,
    progress: float,
    rng: np.random.Generator,
) -> Dict[str, Any]:
    if scenario == "healthy":
        bitrate = 8.8 + rng.normal(0.0, 0.7)
        buffering_time = 0.25 + rng.normal(0.0, 0.25)
        latency = 38 + rng.normal(0.0, 12)
        packet_loss = 0.2 + rng.normal(0.0, 0.45)
        jitter = 12 + rng.normal(0.0, 7)
        playback_failures = 0
        crashes = 0
        startup_time = 1.6 + rng.normal(0.0, 0.5)
        server_load = 15 + rng.normal(0.0, 8)
    elif scenario == "network_congestion":
        degradation = progress ** 1.7
        bitrate = 7.5 * (1.0 - 0.8 * degradation) + rng.normal(0.0, 0.5)
        buffering_time = 0.4 + degradation * 5.5 + rng.normal(0.0, 0.5)
        latency = 45 + degradation * 260 + rng.normal(0.0, 20)
        packet_loss = 0.3 + degradation * 7.5 + rng.normal(0.0, 0.8)
        jitter = 14 + degradation * 70 + rng.normal(0.0, 9)
        playback_failures = int(max(0, (degradation * 5) + rng.normal(0.0, 1.0)))
        crashes = int(max(0, degradation * 1.3 + rng.normal(0.0, 0.5)))
        startup_time = 1.8 + degradation * 4.5 + rng.normal(0.0, 0.4)
        server_load = 20 + degradation * 55 + rng.normal(0.0, 8)
    elif scenario == "cdn_degradation":
        degraded_cdn = "CDN-B"
        degraded_regions = {"Pune", "Mumbai"}
        is_degraded = (cdn == degraded_cdn) and (region in degraded_regions)
        degradation = progress ** 1.4 if is_degraded else progress ** 0.5
        bitrate = 7.0 * (1.0 - 0.55 * degradation) + rng.normal(0.0, 0.7)
        buffering_time = 0.4 + (1.6 if is_degraded else 0.3) + degradation * 3.0 + rng.normal(0.0, 0.4)
        latency = 45 + (90 if is_degraded else 20) + degradation * 120 + rng.normal(0.0, 16)
        packet_loss = 0.5 + (2.2 if is_degraded else 0.2) + degradation * 3.0 + rng.normal(0.0, 0.6)
        jitter = 15 + (30 if is_degraded else 6) + degradation * 30 + rng.normal(0.0, 6)
        playback_failures = int(max(0, (2.5 if is_degraded else 0.2) + degradation * 4.0 + rng.normal(0.0, 1.0)))
        crashes = int(max(0, (0.5 if is_degraded else 0) + degradation * 0.7 + rng.normal(0.0, 0.4)))
        startup_time = 1.9 + (2.0 if is_degraded else 0.0) + degradation * 2.3 + rng.normal(0.0, 0.5)
        server_load = 18 + (30 if is_degraded else 12) + degradation * 28 + rng.normal(0.0, 8)
    elif scenario == "server_overload":
        load = progress ** 1.5
        bitrate = 6.5 * (1.0 - 0.3 * load) + rng.normal(0.0, 0.8)
        buffering_time = 0.3 + load * 5.0 + rng.normal(0.0, 0.4)
        latency = 50 + load * 260 + rng.normal(0.0, 18)
        packet_loss = 0.4 + load * 4.5 + rng.normal(0.0, 0.8)
        jitter = 16 + load * 42 + rng.normal(0.0, 7)
        playback_failures = int(max(0, 0.5 + load * 3.0 + rng.normal(0.0, 1.0)))
        crashes = int(max(0, 0.1 + load * 0.9 + rng.normal(0.0, 0.4)))
        startup_time = 1.7 + load * 6.5 + rng.normal(0.0, 0.5)
        server_load = 28 + load * 62 + rng.normal(0.0, 8)
    elif scenario == "application_failure":
        bitrate = 7.8 + rng.normal(0.0, 0.8)
        buffering_time = 0.5 + rng.normal(0.0, 0.3)
        latency = 45 + rng.normal(0.0, 18)
        packet_loss = 0.6 + rng.normal(0.0, 0.7)
        jitter = 18 + rng.normal(0.0, 6)
        playback_failures = int(max(0, progress * 5 + rng.normal(0.0, 1.0)))
        crashes = int(max(0, progress * 3 + rng.normal(0.0, 0.6)))
        startup_time = 2.0 + rng.normal(0.0, 0.6)
        server_load = 20 + rng.normal(0.0, 8)
    else:
        raise ValueError(f"Unsupported scenario: {scenario}")

    resolution = str(rng.choice(RESOLUTIONS, p=[0.15, 0.25, 0.45, 0.15]))

    return {
        "timestamp": timestamp.isoformat(),
        "session_id": session_id,
        "region": region,
        "device": device,
        "cdn": cdn,
        "bitrate": round(float(max(0.0, bitrate)), 2),
        "buffering_time": round(float(max(0.0, buffering_time)), 2),
        "latency": round(float(max(0.0, latency)), 2),
        "packet_loss": round(float(np.clip(packet_loss, 0.0, 100.0)), 2),
        "jitter": round(float(max(0.0, jitter)), 2),
        "playback_failures": int(max(0, playback_failures)),
        "crashes": int(max(0, crashes)),
        "startup_time": round(float(max(0.0, startup_time)), 2),
        "resolution": resolution,
        "server_load": round(float(np.clip(server_load, 0.0, 100.0)), 2),
    }

def _build_multi_factor_record(
    scenarios: list[str],
    timestamp: datetime,
    session_id: str,
    region: str,
    device: str,
    cdn: str,
    progress: float,
    rng: np.random.Generator,
) -> Dict[str, Any]:
    """
    Build one telemetry record containing the combined effects
    of multiple incident scenarios.

    Existing single-scenario behavior is preserved by reusing
    _build_record() for each selected factor.
    """

    # Healthy baseline.
    baseline = _build_record(
        scenario="healthy",
        timestamp=timestamp,
        session_id=session_id,
        region=region,
        device=device,
        cdn=cdn,
        progress=progress,
        rng=rng,
    )

    # Start from the healthy baseline.
    bitrate = float(baseline["bitrate"])
    buffering_time = float(baseline["buffering_time"])
    latency = float(baseline["latency"])
    packet_loss = float(baseline["packet_loss"])
    jitter = float(baseline["jitter"])
    playback_failures = int(baseline["playback_failures"])
    crashes = int(baseline["crashes"])
    startup_time = float(baseline["startup_time"])
    server_load = float(baseline["server_load"])

    # Nominal healthy values from _build_record().
    healthy_baseline = {
        "bitrate": 8.8,
        "buffering_time": 0.25,
        "latency": 38.0,
        "packet_loss": 0.2,
        "jitter": 12.0,
        "playback_failures": 0,
        "crashes": 0,
        "startup_time": 1.6,
        "server_load": 15.0,
    }

    for scenario in scenarios:
        scenario_record = _build_record(
            scenario=scenario,
            timestamp=timestamp,
            session_id=session_id,
            region=region,
            device=device,
            cdn=cdn,
            progress=progress,
            rng=rng,
        )

        # ---------------------------------------------------------
        # Degradation metrics
        # ---------------------------------------------------------

        # Lower bitrate is worse.
        bitrate -= max(
            0.0,
            healthy_baseline["bitrate"]
            - float(scenario_record["bitrate"]),
        )

        # Higher values are worse.
        buffering_time += max(
            0.0,
            float(scenario_record["buffering_time"])
            - healthy_baseline["buffering_time"],
        )

        latency += max(
            0.0,
            float(scenario_record["latency"])
            - healthy_baseline["latency"],
        )

        packet_loss += max(
            0.0,
            float(scenario_record["packet_loss"])
            - healthy_baseline["packet_loss"],
        )

        jitter += max(
            0.0,
            float(scenario_record["jitter"])
            - healthy_baseline["jitter"],
        )

        startup_time += max(
            0.0,
            float(scenario_record["startup_time"])
            - healthy_baseline["startup_time"],
        )

        server_load += max(
            0.0,
            float(scenario_record["server_load"])
            - healthy_baseline["server_load"],
        )

        # ---------------------------------------------------------
        # Failure/event metrics
        # ---------------------------------------------------------

        playback_failures += int(
            max(0, scenario_record["playback_failures"])
        )

        crashes += int(
            max(0, scenario_record["crashes"])
        )

    # -------------------------------------------------------------
    # Build final combined record
    # -------------------------------------------------------------

    resolution = str(
        rng.choice(
            RESOLUTIONS,
            p=[0.15, 0.25, 0.45, 0.15],
        )
    )

    return {
        "timestamp": timestamp.isoformat(),
        "session_id": session_id,
        "region": region,
        "device": device,
        "cdn": cdn,

        "bitrate": round(
            float(max(0.0, bitrate)),
            2,
        ),

        "buffering_time": round(
            float(max(0.0, buffering_time)),
            2,
        ),

        "latency": round(
            float(max(0.0, latency)),
            2,
        ),

        "packet_loss": round(
            float(np.clip(packet_loss, 0.0, 100.0)),
            2,
        ),

        "jitter": round(
            float(max(0.0, jitter)),
            2,
        ),

        "playback_failures": int(
            max(0, playback_failures)
        ),

        "crashes": int(
            max(0, crashes)
        ),

        "startup_time": round(
            float(max(0.0, startup_time)),
            2,
        ),

        "resolution": resolution,

        "server_load": round(
            float(np.clip(server_load, 0.0, 100.0)),
            2,
        ),
    }

def generate_telemetry(
    scenario: str,
    sessions: int = 100,
    duration_minutes: int = 30,
    interval_seconds: int = 10,
    seed: int = 42,
    scenarios: Optional[list[str]] = None,
):
    scenario_name = str(scenario).lower().replace("-", "_")

    # Validate simulation mode
    if scenario_name == "multi_factor":
        active_scenarios = [
            str(s).lower().replace("-", "_")
            for s in (scenarios or [])
        ]

        if not 2 <= len(active_scenarios) <= 3:
            raise ValueError(
                "Multi-factor simulation requires 2 to 3 scenarios."
            )

        if len(set(active_scenarios)) != len(active_scenarios):
            raise ValueError(
                "Duplicate incident factors are not allowed."
            )

        invalid = [
            s for s in active_scenarios
            if s not in SCENARIO_NAMES or s == "healthy"
        ]

        if invalid:
            raise ValueError(
                f"Unsupported incident factors: {invalid}"
            )

    else:
        if scenario_name not in SCENARIO_NAMES:
            raise ValueError(
                f"Unsupported scenario '{scenario_name}'. "
                f"Available: {SCENARIO_NAMES}"
            )

        active_scenarios = [scenario_name]

    total_intervals = max(
        1,
        int((duration_minutes * 60) / interval_seconds)
    )

    records: List[Dict[str, Any]] = []

    for session_number in range(sessions):
        session_id = f"session_{session_number + 1:03d}"

        region = REGIONS[session_number % len(REGIONS)]
        device = DEVICES[session_number % len(DEVICES)]
        cdn = CDNS[session_number % len(CDNS)]

        session_seed = int(seed + session_number * 97)
        session_rng = np.random.default_rng(session_seed)

        for step in range(total_intervals):
            progress = float(
                step / max(1, total_intervals - 1)
            )

            timestamp = (
                datetime(2024, 1, 1)
                + timedelta(
                    minutes=duration_minutes
                    * (session_number / max(1, sessions))
                )
                + timedelta(seconds=step * interval_seconds)
            )

            if scenario_name == "multi_factor":
                record = _build_multi_factor_record(
                    scenarios=active_scenarios,
                    timestamp=timestamp,
                    session_id=session_id,
                    region=region,
                    device=device,
                    cdn=cdn,
                    progress=progress,
                    rng=session_rng,
                )
            else:
                record = _build_record(
                    scenario=scenario_name,
                    timestamp=timestamp,
                    session_id=session_id,
                    region=region,
                    device=device,
                    cdn=cdn,
                    progress=progress,
                    rng=session_rng,
                )

            records.append(record)

    df = pd.DataFrame.from_records(records)
    df = validate_and_clean_telemetry(df)

    return df

def save_telemetry_csv(df, output_path: str | Path):
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    return str(path)


def _parse_args():
    parser = argparse.ArgumentParser(description="Generate synthetic streaming telemetry datasets.")
    parser.add_argument("--scenario", required=True, choices=SCENARIO_NAMES)
    parser.add_argument("--sessions", type=int, default=100)
    parser.add_argument("--duration", type=int, default=30, help="Duration in minutes")
    parser.add_argument("--interval", type=int, default=10, help="Sampling interval in seconds")
    parser.add_argument("--output", required=True, help="Output path for the CSV file")
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main():
    args = _parse_args()
    df = generate_telemetry(
        scenario=args.scenario,
        sessions=args.sessions,
        duration_minutes=args.duration,
        interval_seconds=args.interval,
        seed=args.seed,
    )
    output_path = save_telemetry_csv(df, args.output)
    print(f"Generated {len(df)} telemetry records for scenario '{args.scenario}' at {output_path}")


if __name__ == "__main__":
    main()
