from backend.services.telemetry_generator import generate_telemetry


def test_scenario_generation_is_distinguishable():
    healthy = generate_telemetry("healthy", sessions=20, duration_minutes=5, interval_seconds=30, seed=42)
    congestion = generate_telemetry("network_congestion", sessions=20, duration_minutes=5, interval_seconds=30, seed=42)
    app_failure = generate_telemetry("application_failure", sessions=20, duration_minutes=5, interval_seconds=30, seed=42)

    healthy_avg_bitrate = healthy["bitrate"].mean()
    congestion_avg_bitrate = congestion["bitrate"].mean()
    app_failure_avg_failures = app_failure["playback_failures"].mean()

    assert healthy_avg_bitrate > congestion_avg_bitrate
    assert app_failure_avg_failures > 0


def test_scenario_generation_is_deterministic():
    first = generate_telemetry("network_congestion", sessions=12, duration_minutes=10, interval_seconds=20, seed=42)
    second = generate_telemetry("network_congestion", sessions=12, duration_minutes=10, interval_seconds=20, seed=42)
    assert first.equals(second)


def test_known_scenarios_are_supported():
    scenarios = [
        "healthy",
        "network_congestion",
        "cdn_degradation",
        "server_overload",
        "application_failure",
    ]
    for scenario in scenarios:
        data = generate_telemetry(scenario, sessions=5, duration_minutes=2, interval_seconds=60, seed=7)
        assert len(data) > 0
        assert set(data.columns) >= {
            "timestamp",
            "session_id",
            "region",
            "device",
            "cdn",
            "bitrate",
            "buffering_time",
            "latency",
            "packet_loss",
            "jitter",
            "playback_failures",
            "crashes",
            "startup_time",
            "resolution",
        }
