from __future__ import annotations

from typing import Dict, Iterable, List, Mapping


def calculate_bitrate_score(bitrate: float) -> float:
    """Map bitrate to a 0-100 quality score. Higher bitrate is better."""
    if bitrate >= 8.0:
        return 100.0
    if bitrate >= 6.0:
        return 88.0
    if bitrate >= 4.0:
        return 72.0
    if bitrate >= 2.5:
        return 55.0
    if bitrate >= 1.5:
        return 38.0
    if bitrate >= 0.75:
        return 22.0
    return 10.0


def calculate_buffering_score(buffering_time: float) -> float:
    """Map buffering duration to a 0-100 quality score. Lower is better."""
    if buffering_time <= 0.25:
        return 100.0
    if buffering_time <= 0.75:
        return 88.0
    if buffering_time <= 2.0:
        return 72.0
    if buffering_time <= 4.0:
        return 52.0
    if buffering_time <= 6.0:
        return 28.0
    if buffering_time <= 8.0:
        return 12.0
    return 5.0


def calculate_latency_score(latency_ms: float) -> float:
    """Map latency to a 0-100 score. Lower latency means better experience."""
    if latency_ms <= 50:
        return 100.0
    if latency_ms <= 100:
        return 88.0
    if latency_ms <= 150:
        return 74.0
    if latency_ms <= 250:
        return 55.0
    if latency_ms <= 400:
        return 28.0
    return 10.0


def calculate_packet_loss_score(packet_loss: float) -> float:
    """Map packet loss percentage to a transparent 0-100 score."""
    if packet_loss <= 0.25:
        return 100.0
    if packet_loss <= 1.0:
        return 92.0
    if packet_loss <= 2.0:
        return 82.0
    if packet_loss <= 4.0:
        return 68.0
    if packet_loss <= 7.0:
        return 52.0
    if packet_loss <= 10.0:
        return 30.0
    if packet_loss <= 20.0:
        return 14.0
    return 5.0


def calculate_reliability_score(playback_failures: int, crashes: int) -> float:
    """Reliability is penalized by failed playback events and crash count."""
    penalty = (playback_failures * 16) + (crashes * 30)
    return max(0.0, 100.0 - penalty)


def classify_qoe(qoe_score: float) -> str:
    if qoe_score >= 80:
        return "Healthy"
    if qoe_score >= 60:
        return "Degraded"
    return "Poor"


def calculate_qoe(record: Mapping[str, object]) -> Dict[str, object]:
    bitrate = float(record.get("bitrate", 0.0))
    buffering_time = float(record.get("buffering_time", 0.0))
    latency = float(record.get("latency", 0.0))
    packet_loss = float(record.get("packet_loss", 0.0))
    playback_failures = int(record.get("playback_failures", 0) or 0)
    crashes = int(record.get("crashes", 0) or 0)

    bitrate_score = calculate_bitrate_score(bitrate)
    buffering_score = calculate_buffering_score(buffering_time)
    latency_score = calculate_latency_score(latency)
    packet_loss_score = calculate_packet_loss_score(packet_loss)
    reliability_score = calculate_reliability_score(playback_failures, crashes)

    qoe_score = (
        0.30 * bitrate_score
        + 0.25 * buffering_score
        + 0.20 * latency_score
        + 0.15 * packet_loss_score
        + 0.10 * reliability_score
    )

    status = classify_qoe(qoe_score)
    return {
        "session_id": record.get("session_id"),
        "qoe_score": round(qoe_score, 2),
        "status": status,
        "components": {
            "bitrate_score": round(bitrate_score, 2),
            "buffering_score": round(buffering_score, 2),
            "latency_score": round(latency_score, 2),
            "packet_loss_score": round(packet_loss_score, 2),
            "reliability_score": round(reliability_score, 2),
        },
        "metrics": {
            "bitrate": bitrate,
            "buffering_time": buffering_time,
            "latency": latency,
            "packet_loss": packet_loss,
            "playback_failures": playback_failures,
            "crashes": crashes,
        },
    }


def calculate_qoe_for_dataframe(df) -> List[Dict[str, object]]:
    return [calculate_qoe(record) for record in df.to_dict(orient="records")]


def summarize_qoe_results(results: Iterable[Mapping[str, object]], scenario: str) -> Dict[str, object]:
    results = list(results)
    if not results:
        raise ValueError("QoE results are empty.")

    average_qoe = sum(float(item["qoe_score"]) for item in results) / len(results)
    status = classify_qoe(average_qoe)

    return {
        "scenario": scenario,
        "total_sessions": len(results),
        "average_qoe": round(average_qoe, 2),
        "status": status,
    }
