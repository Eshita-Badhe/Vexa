from __future__ import annotations

from typing import Any, Dict, Iterable, List, Mapping

from backend.services.anomaly_detector import group_incident_candidates
from backend.services.telemetry_processor import validate_and_clean_telemetry


def _deduplicate_by_type(anomalies: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    deduped: List[Dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for anomaly in anomalies:
        key = (str(anomaly.get("session_id", "unknown")), str(anomaly.get("type", "unknown")))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(dict(anomaly))
    return deduped


def _title_for(anomaly_type: str, severity: str) -> str:
    titles = {
        "BITRATE_DROP": "Streaming bitrate has fallen sharply",
        "BUFFERING_SPIKE": "Buffering time has spiked",
        "LATENCY_SPIKE": "High latency detected",
        "PACKET_LOSS_SPIKE": "Packet loss increased significantly",
        "JITTER_SPIKE": "Jitter spike detected",
        "PLAYBACK_FAILURE_SPIKE": "Playback failures have increased",
        "CRASH_SPIKE": "Crash rate has increased",
        "QOE_DEGRADATION": "Streaming quality has degraded",
    }
    return titles.get(anomaly_type, f"{anomaly_type.replace('_', ' ').title()} detected")


def _message_for(anomaly: Mapping[str, Any]) -> str:
    anomaly_type = str(anomaly.get("type", "UNKNOWN"))
    baseline = anomaly.get("baseline")
    observed = anomaly.get("observed")
    change_percent = anomaly.get("change_percent")
    if anomaly_type == "BITRATE_DROP":
        return f"Bitrate dropped from {baseline} to {observed} ({change_percent:.1f}% change) and remained abnormal."
    if anomaly_type == "BUFFERING_SPIKE":
        return f"Buffering climbed from {baseline}s to {observed}s ({change_percent:.1f}% change)."
    if anomaly_type == "LATENCY_SPIKE":
        return f"Latency increased from {baseline}ms to {observed}ms ({change_percent:.1f}% change)."
    if anomaly_type == "PACKET_LOSS_SPIKE":
        return f"Packet loss increased from {baseline}% to {observed}% ({change_percent:.1f}% change)."
    if anomaly_type == "QOE_DEGRADATION":
        return f"QoE dropped from {baseline} to {observed} ({change_percent:.1f}% change)."
    return f"{anomaly_type.replace('_', ' ').title()} exceeded the rolling baseline and remained abnormal."


def generate_alerts(telemetry: Any, anomalies: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    telemetry = validate_and_clean_telemetry(telemetry)
    deduped_anomalies = _deduplicate_by_type(anomalies)
    alerts: List[Dict[str, Any]] = []
    for index, anomaly in enumerate(deduped_anomalies, start=1):
        evidence = anomaly.get("evidence_summary") or [
            f"Baseline: {anomaly.get('baseline')}",
            f"Observed: {anomaly.get('observed')}",
            f"Change: {anomaly.get('change_percent')}%",
        ]
        alert = {
            "alert_id": f"ALT-{index:03d}",
            "timestamp": str(anomaly.get("timestamp") or telemetry.iloc[0]["timestamp"]),
            "session_id": anomaly.get("session_id", "unknown"),
            "severity": anomaly.get("severity", "WARNING"),
            "title": _title_for(str(anomaly.get("type")), str(anomaly.get("severity", "WARNING"))),
            "message": _message_for(anomaly),
            "anomaly_type": anomaly.get("type"),
            "confidence": float(anomaly.get("confidence", 0.0)),
            "evidence": evidence,
            "anomalies": [anomaly.get("type")],
        }
        alerts.append(alert)

    incident_candidates = group_incident_candidates(deduped_anomalies)
    for candidate in incident_candidates:
        if len(candidate["anomalies"]) >= 2:
            summary_alert = {
                "alert_id": f"ALT-{len(alerts) + 1:03d}",
                "timestamp": candidate.get("timestamp"),
                "session_id": candidate.get("session_id", "unknown"),
                "severity": "CRITICAL",
                "title": "Multiple streaming quality anomalies detected",
                "message": "Multiple related streaming quality anomalies occurred together in the same time window.",
                "anomaly_type": "MULTI_ANOMALY_INCIDENT",
                "confidence": 0.88,
                "evidence": [f"Correlated anomalies: {', '.join(candidate['anomalies'])}"],
                "anomalies": candidate["anomalies"],
            }
            alerts.append(summary_alert)
    return alerts
