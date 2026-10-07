from __future__ import annotations

from typing import Any, Dict, List


# ============================================================
# EXPECTED SIGNAL PATTERNS
# ============================================================

CAUSE_SIGNATURES = {
    "NETWORK_CONGESTION": {
        "anomalies": {
            "LATENCY_SPIKE": 25,
            "PACKET_LOSS_SPIKE": 25,
            "BUFFERING_SPIKE": 20,
            "JITTER_SPIKE": 15,
            "BITRATE_DROP": 15,
        },
        "metrics": {
            "latency": 25,
            "packet_loss": 25,
            "buffering_time": 20,
            "jitter": 15,
            "bitrate": 15,
        },
        "minimum_signals": 2,
    },

    "CDN_DEGRADATION": {
        "anomalies": {
            "BITRATE_DROP": 25,
            "BUFFERING_SPIKE": 25,
            "PLAYBACK_FAILURE_SPIKE": 25,
            "LATENCY_SPIKE": 15,
        },
        "metrics": {
            "bitrate": 30,
            "buffering_time": 25,
            "playback_failures": 25,
            "latency": 20,
        },
        "minimum_signals": 2,
    },

    "SERVER_OVERLOAD": {
        "anomalies": {
            "LATENCY_SPIKE": 20,
            "PLAYBACK_FAILURE_SPIKE": 20,
            "CRASH_SPIKE": 20,
            "BUFFERING_SPIKE": 15,
            "BITRATE_DROP": 10,
        },
        "metrics": {
            "server_load": 35,
            "latency": 20,
            "playback_failures": 15,
            "crashes": 15,
            "startup_time": 15,
        },
        "minimum_signals": 2,
    },

    "APPLICATION_FAILURE": {
        "anomalies": {
            "PLAYBACK_FAILURE_SPIKE": 35,
            "CRASH_SPIKE": 35,
            "BUFFERING_SPIKE": 15,
            "BITRATE_DROP": 15,
        },
        "metrics": {
            "playback_failures": 40,
            "crashes": 40,
            "startup_time": 20,
        },
        "minimum_signals": 2,
    },
}


# ============================================================
# NORMALIZATION
# ============================================================

def _normalize_cause(value: str) -> str:
    return (
        str(value or "")
        .upper()
        .strip()
        .replace(" ", "_")
        .replace("-", "_")
    )


def _anomaly_type(anomaly: Any) -> str:
    if isinstance(anomaly, dict):
        value = anomaly.get("type") or anomaly.get("anomaly_type")
    else:
        value = getattr(anomaly, "type", None) or getattr(
            anomaly,
            "anomaly_type",
            None,
        )

    return _normalize_cause(value or "")


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


# ============================================================
# VERIFY SINGLE CAUSE
# ============================================================

def verify_cause(
    cause: str,
    anomalies: List[Any],
    telemetry: List[Dict[str, Any]],
) -> Dict[str, Any]:

    normalized_cause = _normalize_cause(cause)

    signature = CAUSE_SIGNATURES.get(normalized_cause)

    if not signature:
        return {
            "cause": normalized_cause,
            "status": "UNSUPPORTED",
            "score": 0,
            "confidence": 0,
            "supporting_signals": [],
            "missing_signals": [],
            "evidence": [
                f"No verification signature exists for {normalized_cause}."
            ],
        }

    detected_types = {
        _anomaly_type(anomaly)
        for anomaly in anomalies
    }

    anomaly_matches = []
    metric_matches = []

    # --------------------------------------------------------
    # Anomaly evidence
    # --------------------------------------------------------

    for anomaly_type, weight in signature["anomalies"].items():

        if anomaly_type in detected_types:
            anomaly_matches.append(
                {
                    "signal": anomaly_type,
                    "weight": weight,
                    "source": "anomaly",
                }
            )

    # --------------------------------------------------------
    # Telemetry evidence
    #
    # We use relative variation rather than fixed thresholds.
    # This keeps verification useful across simulations.
    # --------------------------------------------------------

    if telemetry:

        for metric, weight in signature["metrics"].items():

            values = [
                _safe_float(record.get(metric))
                for record in telemetry
                if record.get(metric) is not None
            ]

            if len(values) < 2:
                continue

            midpoint = len(values) // 2

            baseline_values = values[:midpoint]
            recent_values = values[midpoint:]

            if not baseline_values or not recent_values:
                continue

            baseline = sum(baseline_values) / len(baseline_values)
            recent = sum(recent_values) / len(recent_values)

            if baseline == 0:
                continue

            change = abs((recent - baseline) / baseline) * 100

            # A meaningful change in the expected metric.
            if change >= 15:
                metric_matches.append(
                    {
                        "signal": metric,
                        "change_percent": round(change, 1),
                        "weight": weight,
                        "source": "telemetry",
                    }
                )

    # --------------------------------------------------------
    # Combine evidence
    # --------------------------------------------------------

    supporting_signals = anomaly_matches + metric_matches

    # Avoid counting the same metric twice too aggressively.
    unique_signal_names = set()

    unique_supporting_signals = []

    for item in supporting_signals:

        name = item["signal"]

        if name not in unique_signal_names:

            unique_signal_names.add(name)
            unique_supporting_signals.append(item)

    total_weight = sum(
        item["weight"]
        for item in unique_supporting_signals
    )

    max_possible = max(
        sum(signature["anomalies"].values()),
        sum(signature["metrics"].values()),
    )

    score = (
        (total_weight / max_possible) * 100
        if max_possible
        else 0
    )

    score = min(100, score)

    # --------------------------------------------------------
    # Missing expected evidence
    # --------------------------------------------------------

    expected_anomalies = set(
        signature["anomalies"].keys()
    )

    missing_signals = sorted(
        expected_anomalies - detected_types
    )

    signal_count = len(unique_supporting_signals)

    if (
        signal_count >= signature["minimum_signals"]
        and score >= 55
    ):
        status = "VERIFIED"

    elif signal_count >= 1 and score >= 30:
        status = "PARTIALLY_VERIFIED"

    else:
        status = "NOT_VERIFIED"

    evidence = []

    if unique_supporting_signals:

        for signal in unique_supporting_signals[:5]:

            if signal["source"] == "anomaly":

                evidence.append(
                    f"{signal['signal']} was detected."
                )

            else:

                evidence.append(
                    f"{signal['signal']} changed by "
                    f"{signal['change_percent']:.1f}%."
                )

    if missing_signals:

        evidence.append(
            "Missing expected signals: "
            + ", ".join(missing_signals[:4])
        )

    return {
        "cause": normalized_cause,
        "status": status,
        "score": round(score, 1),
        "confidence": round(score, 1),
        "supporting_signals": unique_supporting_signals,
        "missing_signals": missing_signals,
        "evidence": evidence,
    }


# ============================================================
# VERIFY ROOT CAUSE DETECTION
# ============================================================

def verify_detection(
    root_cause: Dict[str, Any],
    anomalies: List[Any],
    telemetry: List[Dict[str, Any]],
    selected_scenarios: List[str] | None = None,
) -> Dict[str, Any]:

    selected_scenarios = selected_scenarios or []

    primary = root_cause.get("primary", {})

    detected_cause = _normalize_cause(
        primary.get("cause")
        or primary.get("label")
        or primary.get("root_cause")
        or ""
    )

    # --------------------------------------------------------
    # Determine causes to verify
    # --------------------------------------------------------

    causes_to_verify = []

    if selected_scenarios:

        for scenario in selected_scenarios:

            normalized = _normalize_cause(scenario)

            if normalized in CAUSE_SIGNATURES:
                causes_to_verify.append(normalized)

    if not causes_to_verify and detected_cause:
        causes_to_verify.append(detected_cause)

    # Remove duplicates
    causes_to_verify = list(dict.fromkeys(causes_to_verify))

    # --------------------------------------------------------
    # Verify every expected cause
    # --------------------------------------------------------

    cause_results = []

    for cause in causes_to_verify:

        result = verify_cause(
            cause=cause,
            anomalies=anomalies,
            telemetry=telemetry,
        )

        cause_results.append(result)

    # --------------------------------------------------------
    # Verify primary detected cause
    # --------------------------------------------------------

    primary_result = next(
        (
            item
            for item in cause_results
            if item["cause"] == detected_cause
        ),
        None,
    )

    if primary_result is None and detected_cause:

        primary_result = verify_cause(
            cause=detected_cause,
            anomalies=anomalies,
            telemetry=telemetry,
        )

    # --------------------------------------------------------
    # Multi-factor verification
    # --------------------------------------------------------

    if len(causes_to_verify) >= 2:

        verified_causes = [
            item
            for item in cause_results
            if item["status"] == "VERIFIED"
        ]

        partial_causes = [
            item
            for item in cause_results
            if item["status"] == "PARTIALLY_VERIFIED"
        ]

        if len(verified_causes) == len(causes_to_verify):

            overall_status = "VERIFIED"

        elif verified_causes or partial_causes:

            overall_status = "PARTIALLY_VERIFIED"

        else:

            overall_status = "NOT_VERIFIED"

    else:

        overall_status = (
            primary_result["status"]
            if primary_result
            else "NOT_VERIFIED"
        )

    # --------------------------------------------------------
    # Detection consistency
    # --------------------------------------------------------

    detection_consistent = (
        primary_result is not None
        and primary_result["status"]
        in {"VERIFIED", "PARTIALLY_VERIFIED"}
    )

    # --------------------------------------------------------
    # Verification score
    # --------------------------------------------------------

    if cause_results:

        verification_score = round(
            sum(
                item["score"]
                for item in cause_results
            )
            / len(cause_results),
            1,
        )

    else:

        verification_score = 0

    return {
        "status": overall_status,
        "verification_score": verification_score,
        "detection_consistent": detection_consistent,
        "detected_root_cause": detected_cause,
        "expected_causes": causes_to_verify,
        "cause_verification": cause_results,
        "primary_verification": primary_result,
    }