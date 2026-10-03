import pandas as pd

from backend.services.qoe_engine import (
    calculate_bitrate_score,
    calculate_buffering_score,
    calculate_latency_score,
    calculate_packet_loss_score,
    calculate_qoe,
    calculate_reliability_score,
    classify_qoe,
)


def test_healthy_telemetry_has_high_qoe():
    record = {
        "session_id": "session_healthy",
        "bitrate": 8.0,
        "buffering_time": 0.3,
        "latency": 35,
        "packet_loss": 0.4,
        "jitter": 18,
        "playback_failures": 0,
        "crashes": 0,
        "startup_time": 1.2,
    }
    result = calculate_qoe(record)
    assert result["qoe_score"] >= 80
    assert result["status"] == "Healthy"


def test_severely_degraded_telemetry_has_low_qoe():
    record = {
        "session_id": "session_bad",
        "bitrate": 0.5,
        "buffering_time": 8.0,
        "latency": 500,
        "packet_loss": 9.5,
        "jitter": 120,
        "playback_failures": 6,
        "crashes": 2,
        "startup_time": 9.0,
    }
    result = calculate_qoe(record)
    assert result["qoe_score"] < 60
    assert result["status"] == "Poor"


def test_qoe_classification_boundaries():
    assert classify_qoe(90) == "Healthy"
    assert classify_qoe(70) == "Degraded"
    assert classify_qoe(40) == "Poor"


def test_metric_normalization_scores_are_ordered():
    assert calculate_bitrate_score(8.0) > calculate_bitrate_score(2.0)
    assert calculate_buffering_score(0.3) > calculate_buffering_score(5.0)
    assert calculate_latency_score(35) > calculate_latency_score(250)
    assert calculate_packet_loss_score(0.2) > calculate_packet_loss_score(5.0)
    assert calculate_reliability_score(0, 0) > calculate_reliability_score(3, 1)


def test_reliability_decreases_with_failures_and_crashes():
    safe = calculate_reliability_score(0, 0)
    broken = calculate_reliability_score(3, 1)
    assert broken < safe
