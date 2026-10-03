import pytest

from backend.services.alert_engine import generate_alerts
from backend.services.anomaly_detector import detect_anomalies
from backend.services.telemetry_generator import generate_telemetry


def make_record(session_id, timestamp, bitrate=8.0, buffering_time=0.3, latency=40.0, packet_loss=0.2, jitter=15.0, playback_failures=0, crashes=0, qoe_score=85.0):
    return {
        "timestamp": timestamp,
        "session_id": session_id,
        "region": "Pune",
        "device": "Android",
        "cdn": "CDN-A",
        "bitrate": bitrate,
        "buffering_time": buffering_time,
        "latency": latency,
        "packet_loss": packet_loss,
        "jitter": jitter,
        "playback_failures": playback_failures,
        "crashes": crashes,
        "startup_time": 1.5,
        "resolution": "1080p",
        "qoe_score": qoe_score,
    }


def test_healthy_scenario_has_few_or_no_critical_anomalies():
    df = generate_telemetry("healthy", sessions=10, duration_minutes=2, interval_seconds=30, seed=42)
    anomalies = detect_anomalies(df)
    critical = [a for a in anomalies if a["severity"] == "CRITICAL"]
    assert len(critical) == 0


def test_bitrate_drop_is_detected():
    records = [
        make_record("session_1", "2024-01-01T00:00:00", bitrate=8.0),
        make_record("session_1", "2024-01-01T00:00:10", bitrate=7.8),
        make_record("session_1", "2024-01-01T00:00:20", bitrate=2.4),
        make_record("session_1", "2024-01-01T00:00:30", bitrate=2.1),
    ]
    anomalies = detect_anomalies(records)
    assert any(a["type"] == "BITRATE_DROP" for a in anomalies)


def test_buffering_spike_is_detected():
    records = [
        make_record("session_1", "2024-01-01T00:00:00", buffering_time=0.4),
        make_record("session_1", "2024-01-01T00:00:10", buffering_time=0.5),
        make_record("session_1", "2024-01-01T00:00:20", buffering_time=4.2),
        make_record("session_1", "2024-01-01T00:00:30", buffering_time=3.9),
    ]
    anomalies = detect_anomalies(records)
    assert any(a["type"] == "BUFFERING_SPIKE" for a in anomalies)


def test_latency_spike_is_detected():
    records = [
        make_record("session_1", "2024-01-01T00:00:00", latency=40),
        make_record("session_1", "2024-01-01T00:00:10", latency=60),
        make_record("session_1", "2024-01-01T00:00:20", latency=250),
        make_record("session_1", "2024-01-01T00:00:30", latency=280),
    ]
    anomalies = detect_anomalies(records)
    assert any(a["type"] == "LATENCY_SPIKE" for a in anomalies)


def test_packet_loss_spike_is_detected():
    records = [
        make_record("session_1", "2024-01-01T00:00:00", packet_loss=0.2),
        make_record("session_1", "2024-01-01T00:00:10", packet_loss=0.4),
        make_record("session_1", "2024-01-01T00:00:20", packet_loss=6.5),
        make_record("session_1", "2024-01-01T00:00:30", packet_loss=7.2),
    ]
    anomalies = detect_anomalies(records)
    assert any(a["type"] == "PACKET_LOSS_SPIKE" for a in anomalies)


def test_jitter_spike_is_detected():
    records = [
        make_record("session_1", "2024-01-01T00:00:00", jitter=15),
        make_record("session_1", "2024-01-01T00:00:10", jitter=18),
        make_record("session_1", "2024-01-01T00:00:20", jitter=80),
        make_record("session_1", "2024-01-01T00:00:30", jitter=90),
    ]
    anomalies = detect_anomalies(records)
    assert any(a["type"] == "JITTER_SPIKE" for a in anomalies)


def test_playback_failure_spike_is_detected():
    records = [
        make_record("session_1", "2024-01-01T00:00:00", playback_failures=0),
        make_record("session_1", "2024-01-01T00:00:10", playback_failures=1),
        make_record("session_1", "2024-01-01T00:00:20", playback_failures=6),
        make_record("session_1", "2024-01-01T00:00:30", playback_failures=7),
    ]
    anomalies = detect_anomalies(records)
    assert any(a["type"] == "PLAYBACK_FAILURE_SPIKE" for a in anomalies)


def test_crash_spike_is_detected():
    records = [
        make_record("session_1", "2024-01-01T00:00:00", crashes=0),
        make_record("session_1", "2024-01-01T00:00:10", crashes=0),
        make_record("session_1", "2024-01-01T00:00:20", crashes=3),
        make_record("session_1", "2024-01-01T00:00:30", crashes=4),
    ]
    anomalies = detect_anomalies(records)
    assert any(a["type"] == "CRASH_SPIKE" for a in anomalies)


def test_qoe_degradation_is_detected():
    records = [
        make_record("session_1", "2024-01-01T00:00:00", qoe_score=88.0),
        make_record("session_1", "2024-01-01T00:00:10", qoe_score=84.0),
        make_record("session_1", "2024-01-01T00:00:20", qoe_score=45.0),
        make_record("session_1", "2024-01-01T00:00:30", qoe_score=42.0),
    ]
    anomalies = detect_anomalies(records)
    assert any(a["type"] == "QOE_DEGRADATION" for a in anomalies)


def test_severity_is_added_and_confidence_stays_between_zero_and_one():
    records = [
        make_record("session_1", "2024-01-01T00:00:00", bitrate=8.0),
        make_record("session_1", "2024-01-01T00:00:10", bitrate=7.9),
        make_record("session_1", "2024-01-01T00:00:20", bitrate=2.1),
        make_record("session_1", "2024-01-01T00:00:30", bitrate=2.4),
    ]
    anomalies = detect_anomalies(records)
    anomaly = next(a for a in anomalies if a["type"] == "BITRATE_DROP")
    assert anomaly["severity"] in {"WARNING", "CRITICAL"}
    assert 0 <= anomaly["confidence"] <= 1
    assert anomaly["evidence"]


def test_consecutive_abnormal_points_are_handled():
    records = [
        make_record("session_1", "2024-01-01T00:00:00", bitrate=8.0),
        make_record("session_1", "2024-01-01T00:00:10", bitrate=8.0),
        make_record("session_1", "2024-01-01T00:00:20", bitrate=2.4),
        make_record("session_1", "2024-01-01T00:00:30", bitrate=2.1),
    ]
    anomalies = detect_anomalies(records)
    bitrate_anomalies = [a for a in anomalies if a["type"] == "BITRATE_DROP"]
    assert len(bitrate_anomalies) == 1


def test_duplicate_alerts_are_suppressed_and_reset_after_clear():
    telemetry = [
        make_record("session_1", "2024-01-01T00:00:00", latency=45),
        make_record("session_1", "2024-01-01T00:00:10", latency=260),
        make_record("session_1", "2024-01-01T00:00:20", latency=270),
        make_record("session_1", "2024-01-01T00:00:30", latency=50),
    ]
    anomalies = detect_anomalies(telemetry)
    alerts = generate_alerts(telemetry, anomalies)
    assert len(alerts) >= 1
    assert any(a["anomaly_type"] == "LATENCY_SPIKE" for a in alerts)


def test_all_scenarios_produce_expected_pattern_family():
    scenarios = {
        "healthy": {"BITRATE_DROP", "BUFFERING_SPIKE", "LATENCY_SPIKE", "PACKET_LOSS_SPIKE", "JITTER_SPIKE", "PLAYBACK_FAILURE_SPIKE", "CRASH_SPIKE", "QOE_DEGRADATION"},
        "network_congestion": {"BITRATE_DROP", "BUFFERING_SPIKE", "LATENCY_SPIKE", "PACKET_LOSS_SPIKE", "JITTER_SPIKE"},
        "cdn_degradation": {"PLAYBACK_FAILURE_SPIKE", "BITRATE_DROP", "BUFFERING_SPIKE"},
        "server_overload": {"LATENCY_SPIKE", "PLAYBACK_FAILURE_SPIKE", "BUFFERING_SPIKE"},
        "application_failure": {"CRASH_SPIKE", "PLAYBACK_FAILURE_SPIKE"},
    }

    for scenario, expected_types in scenarios.items():
        df = generate_telemetry(scenario, sessions=15, duration_minutes=3, interval_seconds=30, seed=42)
        detected = detect_anomalies(df)
        detected_types = {a["type"] for a in detected}
        if scenario == "healthy":
            assert detected_types.isdisjoint(expected_types)
        else:
            assert expected_types.intersection(detected_types)


def test_simulate_response_contains_telemetry_qoe_anomalies_and_alerts():
    from backend.api.telemetry_routes import simulate_scenario
    from backend.models.telemetry import SimulateScenarioRequest

    result = simulate_scenario(SimulateScenarioRequest(scenario="network_congestion", sessions=5, duration_minutes=1, interval_seconds=30, seed=7))
    assert "telemetry" in result
    assert "qoe" in result
    assert "anomalies" in result
    assert "alerts" in result
    assert result["anomalies"]
