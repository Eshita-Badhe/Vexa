from __future__ import annotations

from collections import defaultdict
from statistics import mean
from typing import Any, Dict, Iterable, List, Mapping

import pandas as pd

from backend.services.qoe_engine import calculate_qoe
from backend.services.telemetry_processor import validate_and_clean_telemetry
from backend.utils.constants import (
    ANOMALY_THRESHOLDS,
    MIN_CONSECUTIVE_POINTS,
    ROLLING_WINDOW_SIZE,
    SEVERITY_THRESHOLDS,
)


METRIC_TO_ANOMALY = {
    "bitrate": "BITRATE_DROP",
    "buffering_time": "BUFFERING_SPIKE",
    "latency": "LATENCY_SPIKE",
    "packet_loss": "PACKET_LOSS_SPIKE",
    "jitter": "JITTER_SPIKE",
    "playback_failures": "PLAYBACK_FAILURE_SPIKE",
    "crashes": "CRASH_SPIKE",
}


def _as_dataframe(data: Any) -> pd.DataFrame:
    df = pd.DataFrame(data)
    if df.empty:
        raise ValueError("Telemetry payload is empty.")
    return validate_and_clean_telemetry(df)


def _change_percent(baseline: float, observed: float) -> float:
    if baseline == 0:
        return 0.0 if observed == 0 else 100.0
    return ((observed - baseline) / baseline) * 100.0


def _severity_for(change_percent: float, z_score: float) -> str:
    abs_change = abs(change_percent)
    if abs_change >= SEVERITY_THRESHOLDS["CRITICAL"] or abs(z_score) >= ANOMALY_THRESHOLDS["z_score"] * 2:
        return "CRITICAL"
    if abs_change >= SEVERITY_THRESHOLDS["WARNING"]:
        return "WARNING"
    return "INFO"


def _confidence(change_percent: float, z_score: float, persistence: int) -> float:
    deviation = min(1.0, abs(change_percent) / 150.0)
    persistence_score = min(1.0, persistence / 4.0)
    z_score_factor = min(1.0, abs(z_score) / 6.0)
    confidence = 0.45 * deviation + 0.35 * persistence_score + 0.20 * z_score_factor
    return round(max(0.0, min(1.0, confidence)), 2)


def _build_anomaly(anomaly_type: str, session_id: str, row: Mapping[str, Any], metric: str, baseline: float, observed: float, change_percent: float, z_score: float, persistence: int) -> Dict[str, Any]:
    evidence = {
        "baseline": round(float(baseline), 2),
        "current": round(float(observed), 2),
        "change_percent": round(float(change_percent), 2),
        "z_score": round(float(z_score), 2),
        "consecutive_points": persistence,
    }
    evidence_summary = [
        f"{anomaly_type.replace('_', ' ').title()} exceeded the rolling baseline.",
        f"Baseline: {baseline:.2f}; observed: {observed:.2f}; change: {change_percent:.2f}%",
        f"Persistence: {persistence} consecutive abnormal observations",
    ]
    return {
        "anomaly_id": "",
        "timestamp": str(row["timestamp"]),
        "session_id": str(session_id),
        "type": anomaly_type,
        "severity": _severity_for(change_percent, z_score),
        "confidence": _confidence(change_percent, z_score, persistence),
        "metric": metric,
        "baseline": round(float(baseline), 2),
        "observed": round(float(observed), 2),
        "change_percent": round(float(change_percent), 2),
        "evidence": evidence,
        "evidence_summary": evidence_summary,
    }


def _metric_threshold(metric: str) -> float:
    mapping = {
        "bitrate": ANOMALY_THRESHOLDS["bitrate_drop_percent"],
        "buffering_time": ANOMALY_THRESHOLDS["buffering_increase_percent"],
        "latency": ANOMALY_THRESHOLDS["latency_increase_percent"],
        "packet_loss": ANOMALY_THRESHOLDS["packet_loss_increase_percent"],
        "jitter": ANOMALY_THRESHOLDS["jitter_increase_percent"],
        "playback_failures": ANOMALY_THRESHOLDS["playback_failure_increase_percent"],
        "crashes": ANOMALY_THRESHOLDS["crash_increase_percent"],
    }
    return mapping.get(metric, 0.0)


def _metric_trigger(metric: str, baseline: float, observed: float) -> bool:
    if baseline <= 0:
        return False
    change_percent = _change_percent(baseline, observed)
    threshold = _metric_threshold(metric)
    if metric == "bitrate":
        return observed < baseline and abs(change_percent) >= threshold
    return observed > baseline and change_percent >= threshold


def _evaluate_qoe_drop(current_qoe: float, baseline_qoe: float) -> bool:
    if baseline_qoe <= 0:
        return current_qoe < 60
    drop = ((baseline_qoe - current_qoe) / baseline_qoe) * 100.0
    return current_qoe < baseline_qoe and drop >= ANOMALY_THRESHOLDS["qoe_degradation_percent"]


def group_incident_candidates(anomalies: Iterable[Mapping[str, Any]], time_window_seconds: int = 300) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Mapping[str, Any]]] = defaultdict(list)
    for anomaly in anomalies:
        grouped[str(anomaly.get("session_id"))].append(anomaly)

    candidates: List[Dict[str, Any]] = []
    for session_id, entries in grouped.items():
        ordered = sorted(entries, key=lambda item: str(item.get("timestamp") or ""))
        cluster: List[Mapping[str, Any]] = []
        last_ts = None
        for entry in ordered:
            ts = pd.to_datetime(entry.get("timestamp"))
            if last_ts is not None and (ts - last_ts).total_seconds() > time_window_seconds:
                if len(cluster) >= 2:
                    candidates.append({
                        "incident_candidate": True,
                        "session_id": session_id,
                        "timestamp": str(cluster[0].get("timestamp")),
                        "anomalies": sorted({item["type"] for item in cluster}),
                    })
                cluster = []
            cluster.append(entry)
            last_ts = ts
        if len(cluster) >= 2:
            candidates.append({
                "incident_candidate": True,
                "session_id": session_id,
                "timestamp": str(cluster[0].get("timestamp")),
                "anomalies": sorted({item["type"] for item in cluster}),
            })
    return candidates


def detect_anomalies(telemetry: Any) -> List[Dict[str, Any]]:
    df = _as_dataframe(telemetry)
    df = df.sort_values(["session_id", "timestamp"]).reset_index(drop=True)
    anomalies: List[Dict[str, Any]] = []
    emitted: set[tuple[str, str]] = set()

    for session_id, group in df.groupby("session_id", sort=False):
        session_id = str(session_id)
        metric_history: Dict[str, List[float]] = {metric: [] for metric in METRIC_TO_ANOMALY}
        qoe_history: List[float] = []
        qoe_streak = 0
        metric_streak: Dict[str, int] = {metric: 0 for metric in METRIC_TO_ANOMALY}

        for _, row in group.iterrows():
            record = row.to_dict()
            qoe_result = calculate_qoe(record)
            current_qoe = float(qoe_result["qoe_score"])

            if qoe_history:
                previous_qoe = qoe_history[-1]
                if _evaluate_qoe_drop(current_qoe, previous_qoe):
                    qoe_streak += 1
                else:
                    qoe_streak = 0
                if qoe_streak >= MIN_CONSECUTIVE_POINTS and (session_id, "QOE_DEGRADATION") not in emitted:
                    delta = ((previous_qoe - current_qoe) / previous_qoe) * 100.0 if previous_qoe else 0.0
                    anomaly = {
                        "anomaly_id": "",
                        "timestamp": str(row["timestamp"]),
                        "session_id": session_id,
                        "type": "QOE_DEGRADATION",
                        "severity": "WARNING",
                        "confidence": 0.85,
                        "metric": "qoe_score",
                        "baseline": round(float(previous_qoe), 2),
                        "observed": round(float(current_qoe), 2),
                        "change_percent": round(float(delta), 2),
                        "evidence": {
                            "baseline": round(float(previous_qoe), 2),
                            "current": round(float(current_qoe), 2),
                            "change_percent": round(float(delta), 2),
                            "consecutive_points": qoe_streak,
                        },
                        "evidence_summary": [
                            "QoE dropped below the recent baseline.",
                            f"Previous QoE: {previous_qoe:.2f}; current QoE: {current_qoe:.2f}",
                            f"Persistence: {qoe_streak} consecutive abnormal observations",
                        ],
                    }
                    anomaly["severity"] = _severity_for(anomaly["change_percent"], 0.0)
                    anomaly["confidence"] = _confidence(anomaly["change_percent"], 0.0, qoe_streak)
                    anomaly["anomaly_id"] = f"ANOM-{len(anomalies) + 1:03d}"
                    anomalies.append(anomaly)
                    emitted.add((session_id, "QOE_DEGRADATION"))
            qoe_history.append(current_qoe)

            for metric, anomaly_name in METRIC_TO_ANOMALY.items():
                values = metric_history[metric]
                baseline = mean(values[-ROLLING_WINDOW_SIZE:]) if values else float(record[metric])
                observed = float(record[metric])
                trigger = _metric_trigger(metric, baseline, observed) if values else False
                if trigger:
                    metric_streak[metric] += 1
                else:
                    metric_streak[metric] = 0
                if metric_streak[metric] >= MIN_CONSECUTIVE_POINTS and (session_id, anomaly_name) not in emitted:
                    change_percent = _change_percent(baseline, observed)
                    z_score = 0.0
                    anomaly = _build_anomaly(
                        anomaly_name,
                        session_id,
                        record,
                        metric,
                        baseline,
                        observed,
                        change_percent,
                        z_score,
                        metric_streak[metric],
                    )
                    anomaly["anomaly_id"] = f"ANOM-{len(anomalies) + 1:03d}"
                    anomalies.append(anomaly)
                    emitted.add((session_id, anomaly_name))
                metric_history[metric].append(observed)

    return anomalies
