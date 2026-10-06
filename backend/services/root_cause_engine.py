"""
Root Cause Analysis Engine
Media Stream Quality Detective - PS-03

This module performs transparent, explainable root-cause analysis
using telemetry + anomaly evidence.

It does NOT use an ML black box.

Supported causes:
- Network Congestion
- CDN Degradation
- Server Overload
- Application Failure
- Unknown
"""

from collections import defaultdict
from statistics import mean, pstdev
from typing import Any, Dict, List


# -------------------------------------------------------------------
# Human-readable names
# -------------------------------------------------------------------

CAUSE_NAMES = {
    "NETWORK_CONGESTION": "Network Congestion",
    "CDN_DEGRADATION": "CDN Degradation",
    "SERVER_OVERLOAD": "Server Overload",
    "APPLICATION_FAILURE": "Application Failure",
    "UNKNOWN": "Unknown",
}


# -------------------------------------------------------------------
# Utility helpers
# -------------------------------------------------------------------

def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _get_value(record: Any, key: str, default: float = 0.0) -> float:
    """
    Supports dictionaries and Pydantic/model-like objects.
    """
    if isinstance(record, dict):
        return _safe_float(record.get(key), default)

    return _safe_float(getattr(record, key, default), default)


def _get_text(record: Any, key: str, default: str = "") -> str:
    if isinstance(record, dict):
        value = record.get(key, default)
    else:
        value = getattr(record, key, default)

    return str(value) if value is not None else default


def _anomaly_type(anomaly: Any) -> str:
    if isinstance(anomaly, dict):
        value = anomaly.get("type", anomaly.get("anomaly_type", ""))
    else:
        value = getattr(
            anomaly,
            "type",
            getattr(anomaly, "anomaly_type", ""),
        )

    return str(value).upper()


def _anomaly_confidence(anomaly: Any) -> float:
    if isinstance(anomaly, dict):
        value = anomaly.get("confidence", 0)
    else:
        value = getattr(anomaly, "confidence", 0)

    value = _safe_float(value)

    # Support both 0-1 and 0-100 confidence formats.
    if value <= 1:
        value *= 100

    return max(0.0, min(100.0, value))


def _anomaly_change(anomaly: Any) -> float:
    """
    Extract percentage change from an anomaly object.
    """
    if isinstance(anomaly, dict):
        evidence = anomaly.get("evidence", {})
        value = anomaly.get(
            "change_percent",
            anomaly.get("change", evidence.get("change_percent", 0)),
        )
    else:
        evidence = getattr(anomaly, "evidence", {}) or {}

        value = getattr(
            anomaly,
            "change_percent",
            getattr(
                anomaly,
                "change",
                evidence.get("change_percent", 0)
                if isinstance(evidence, dict)
                else 0,
            ),
        )

    return abs(_safe_float(value))


# -------------------------------------------------------------------
# Evidence helpers
# -------------------------------------------------------------------

def _make_signal(
    metric: str,
    direction: str,
    strength: float,
    observed: float | None = None,
    baseline: float | None = None,
) -> Dict[str, Any]:

    result = {
        "metric": metric,
        "direction": direction,
        "strength": round(max(0.0, min(100.0, strength)), 1),
    }

    if observed is not None:
        result["observed"] = round(observed, 3)

    if baseline is not None:
        result["baseline"] = round(baseline, 3)

    return result


# -------------------------------------------------------------------
# Root Cause Engine
# -------------------------------------------------------------------

class RootCauseEngine:

    def __init__(self):
        self.causes = list(CAUSE_NAMES.keys())

    # ---------------------------------------------------------------
    # Main entry point
    # ---------------------------------------------------------------

    def analyze(
        self,
        telemetry: List[Any],
        anomalies: List[Any],
    ) -> Dict[str, Any]:

        telemetry = telemetry or []
        anomalies = anomalies or []

        if not telemetry and not anomalies:
            return self._unknown_result()

        network = self._score_network_congestion(
            telemetry,
            anomalies,
        )

        cdn = self._score_cdn_degradation(
            telemetry,
            anomalies,
        )

        server = self._score_server_overload(
            telemetry,
            anomalies,
        )

        application = self._score_application_failure(
            telemetry,
            anomalies,
        )

        candidates = [
            network,
            cdn,
            server,
            application,
        ]

        # Sort highest confidence first.
        candidates.sort(
            key=lambda item: item["confidence"],
            reverse=True,
        )

        # If all scores are weak, use UNKNOWN.
        if candidates[0]["confidence"] < 25:
            primary = {
                "cause": "UNKNOWN",
                "label": "Unknown",
                "confidence": round(
                    100 - candidates[0]["confidence"],
                    1,
                ),
                "evidence": [
                    "No root cause has enough correlated evidence."
                ],
                "contributing_signals": [],
            }
        else:
            primary = candidates[0]

        alternatives = [
            candidate
            for candidate in candidates[1:]
            if candidate["confidence"] >= 15
        ]

        return {
            "primary": primary,
            "alternatives": alternatives,
            "analysis_summary": self._build_summary(primary),
        }

    # ---------------------------------------------------------------
    # NETWORK CONGESTION
    # ---------------------------------------------------------------

    def _score_network_congestion(
        self,
        telemetry: List[Any],
        anomalies: List[Any],
    ) -> Dict[str, Any]:

        anomaly_weights = {
            "LATENCY_SPIKE": 25,
            "PACKET_LOSS_SPIKE": 25,
            "BUFFERING_SPIKE": 20,
            "BITRATE_DROP": 15,
            "JITTER_SPIKE": 15,
        }

        score = 0.0
        evidence = []
        signals = []

        detected_types = {
            _anomaly_type(a)
            for a in anomalies
        }

        for anomaly in anomalies:
            anomaly_type = _anomaly_type(anomaly)

            if anomaly_type in anomaly_weights:

                base = anomaly_weights[anomaly_type]
                confidence = _anomaly_confidence(anomaly)

                contribution = base * (confidence / 100)

                score += contribution

                evidence.append(
                    self._anomaly_evidence_text(anomaly)
                )

        # Direct telemetry correlation.
        correlation = self._network_correlation(telemetry)

        score += correlation["score"]

        signals.extend(correlation["signals"])
        evidence.extend(correlation["evidence"])

        # Cap confidence.
        score = min(score, 100)

        if "LATENCY_SPIKE" in detected_types:
            signals.append(
                _make_signal(
                    "Latency",
                    "increase",
                    85,
                )
            )

        if "PACKET_LOSS_SPIKE" in detected_types:
            signals.append(
                _make_signal(
                    "Packet Loss",
                    "increase",
                    90,
                )
            )

        if "BUFFERING_SPIKE" in detected_types:
            signals.append(
                _make_signal(
                    "Buffering",
                    "increase",
                    80,
                )
            )

        if "BITRATE_DROP" in detected_types:
            signals.append(
                _make_signal(
                    "Bitrate",
                    "decrease",
                    75,
                )
            )

        unique_signals = self._unique_signals(signals)

        return {
            "cause": "NETWORK_CONGESTION",
            "label": CAUSE_NAMES["NETWORK_CONGESTION"],
            "confidence": round(score, 1),
            "evidence": self._unique(evidence)[:8],
            "contributing_signals": unique_signals[:8],
        }

    # ---------------------------------------------------------------
    # CDN DEGRADATION
    # ---------------------------------------------------------------

    def _score_cdn_degradation(
        self,
        telemetry: List[Any],
        anomalies: List[Any],
    ) -> Dict[str, Any]:

        score = 0.0
        evidence = []
        signals = []

        cdn_stats = defaultdict(
            lambda: {
                "count": 0,
                "bitrate": [],
                "buffering": [],
                "failures": [],
            }
        )

        region_stats = defaultdict(int)

        for row in telemetry:
            cdn = _get_text(row, "cdn", "unknown")
            region = _get_text(row, "region", "unknown")

            cdn_stats[cdn]["count"] += 1

            cdn_stats[cdn]["bitrate"].append(
                _get_value(row, "bitrate")
            )

            cdn_stats[cdn]["buffering"].append(
                _get_value(row, "buffering_time")
            )

            cdn_stats[cdn]["failures"].append(
                _get_value(row, "playback_failures")
            )

            region_stats[region] += 1

        cdn_scores = []

        for cdn, stats in cdn_stats.items():

            if not stats["bitrate"]:
                continue

            bitrate_avg = mean(stats["bitrate"])
            buffering_avg = mean(stats["buffering"])
            failures_avg = mean(stats["failures"])

            cdn_score = 0

            if bitrate_avg < 5:
                cdn_score += 25
                evidence.append(
                    f"{cdn} average bitrate degraded to "
                    f"{bitrate_avg:.2f} Mbps."
                )

            if buffering_avg > 1.0:
                cdn_score += 25
                evidence.append(
                    f"{cdn} average buffering reached "
                    f"{buffering_avg:.2f}s."
                )

            if failures_avg > 0.5:
                cdn_score += 25
                evidence.append(
                    f"{cdn} shows elevated playback failures."
                )

            cdn_scores.append(
                (cdn, cdn_score)
            )

        if cdn_scores:
            cdn_scores.sort(
                key=lambda x: x[1],
                reverse=True,
            )

            best_cdn, best_score = cdn_scores[0]

            # Strong CDN-specific degradation.
            if best_score > 0:
                score += best_score

                evidence.append(
                    f"Degradation is concentrated around {best_cdn}."
                )

                signals.append(
                    _make_signal(
                        "CDN concentration",
                        "increase",
                        best_score,
                    )
                )

        for anomaly in anomalies:
            anomaly_type = _anomaly_type(anomaly)

            if anomaly_type in {
                "BUFFERING_SPIKE",
                "BITRATE_DROP",
                "PLAYBACK_FAILURE_SPIKE",
            }:
                score += 5

        score = min(score, 100)

        return {
            "cause": "CDN_DEGRADATION",
            "label": CAUSE_NAMES["CDN_DEGRADATION"],
            "confidence": round(score, 1),
            "evidence": self._unique(evidence)[:8],
            "contributing_signals": signals[:8],
        }

    # ---------------------------------------------------------------
    # SERVER OVERLOAD
    # ---------------------------------------------------------------

    def _score_server_overload(
        self,
        telemetry: List[Any],
        anomalies: List[Any],
    ) -> Dict[str, Any]:

        score = 0
        evidence = []
        signals = []

        server_loads = [
            _get_value(row, "server_load")
            for row in telemetry
            if _get_value(row, "server_load") > 0
        ]

        latencies = [
            _get_value(row, "latency")
            for row in telemetry
        ]

        startup_times = [
            _get_value(row, "startup_time")
            for row in telemetry
        ]

        failures = [
            _get_value(row, "playback_failures")
            for row in telemetry
        ]

        if server_loads:

            avg_load = mean(server_loads)

            if avg_load >= 80:
                score += 40

                evidence.append(
                    f"Average server load reached "
                    f"{avg_load:.1f}%."
                )

                signals.append(
                    _make_signal(
                        "Server Load",
                        "increase",
                        95,
                        avg_load,
                    )
                )

            elif avg_load >= 65:
                score += 25

                evidence.append(
                    f"Server load is elevated at "
                    f"{avg_load:.1f}%."
                )

        if latencies:

            avg_latency = mean(latencies)

            if avg_latency > 150:
                score += 20

                evidence.append(
                    f"Average latency increased to "
                    f"{avg_latency:.1f}ms."
                )

                signals.append(
                    _make_signal(
                        "Latency",
                        "increase",
                        75,
                        avg_latency,
                    )
                )

        if startup_times:

            avg_startup = mean(startup_times)

            if avg_startup > 3:
                score += 20

                evidence.append(
                    f"Startup time increased to "
                    f"{avg_startup:.2f}s."
                )

                signals.append(
                    _make_signal(
                        "Startup Time",
                        "increase",
                        80,
                        avg_startup,
                    )
                )

        if failures and mean(failures) > 1:
            score += 15

            evidence.append(
                "Playback failures increased alongside server-side load."
            )

        for anomaly in anomalies:

            if _anomaly_type(anomaly) in {
                "LATENCY_SPIKE",
                "PLAYBACK_FAILURE_SPIKE",
                "BUFFERING_SPIKE",
            }:
                score += 3

        return {
            "cause": "SERVER_OVERLOAD",
            "label": CAUSE_NAMES["SERVER_OVERLOAD"],
            "confidence": round(min(score, 100), 1),
            "evidence": self._unique(evidence)[:8],
            "contributing_signals": signals[:8],
        }

    # ---------------------------------------------------------------
    # APPLICATION FAILURE
    # ---------------------------------------------------------------

    def _score_application_failure(
        self,
        telemetry: List[Any],
        anomalies: List[Any],
    ) -> Dict[str, Any]:

        score = 0
        evidence = []
        signals = []

        crash_total = sum(
            _get_value(row, "crashes")
            for row in telemetry
        )

        failure_total = sum(
            _get_value(row, "playback_failures")
            for row in telemetry
        )

        avg_latency = mean(
            [
                _get_value(row, "latency")
                for row in telemetry
            ]
        ) if telemetry else 0

        avg_packet_loss = mean(
            [
                _get_value(row, "packet_loss")
                for row in telemetry
            ]
        ) if telemetry else 0

        if crash_total > 5:

            score += 45

            evidence.append(
                f"Application crashes increased "
                f"({crash_total:.0f} total crash events)."
            )

            signals.append(
                _make_signal(
                    "Crashes",
                    "increase",
                    95,
                    crash_total,
                )
            )

        if failure_total > 10:

            score += 30

            evidence.append(
                f"Playback failures increased "
                f"({failure_total:.0f} total failures)."
            )

            signals.append(
                _make_signal(
                    "Playback Failures",
                    "increase",
                    90,
                    failure_total,
                )
            )

        # Important:
        # Application failure becomes stronger when the network
        # itself is relatively healthy.

        if avg_latency < 100:

            score += 15

            evidence.append(
                "Latency remains relatively healthy despite failures."
            )

            signals.append(
                _make_signal(
                    "Latency",
                    "stable",
                    75,
                    avg_latency,
                )
            )

        if avg_packet_loss < 1:

            score += 10

            evidence.append(
                "Packet loss remains low despite playback problems."
            )

            signals.append(
                _make_signal(
                    "Packet Loss",
                    "stable",
                    80,
                    avg_packet_loss,
                )
            )

        for anomaly in anomalies:

            if _anomaly_type(anomaly) == "CRASH_SPIKE":
                score += 10

            if _anomaly_type(anomaly) == "PLAYBACK_FAILURE_SPIKE":
                score += 5

        return {
            "cause": "APPLICATION_FAILURE",
            "label": CAUSE_NAMES["APPLICATION_FAILURE"],
            "confidence": round(min(score, 100), 1),
            "evidence": self._unique(evidence)[:8],
            "contributing_signals": signals[:8],
        }

    @staticmethod
    def _unique_signals(
        signals: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Remove duplicate signals while keeping
        the most informative version.
        """

        unique = {}

        for signal in signals:
            metric = str(
                signal.get("metric", "")
            ).strip().lower()

            direction = str(
                signal.get("direction", "")
            ).strip().lower()

            key = (
                metric,
                direction,
            )

            if key not in unique:
                unique[key] = signal
                continue

            existing = unique[key]

            # Prefer the signal containing observed/baseline values.
            if (
                "observed" not in existing
                and "observed" in signal
            ):
                unique[key] = signal

        return list(unique.values())

    # ---------------------------------------------------------------
    # Network telemetry correlation
    # ---------------------------------------------------------------

    def _network_correlation(
        self,
        telemetry: List[Any],
    ) -> Dict[str, Any]:

        if len(telemetry) < 4:
            return {
                "score": 0,
                "signals": [],
                "evidence": [],
            }

        # Sort by timestamp if possible.
        try:
            telemetry = sorted(
                telemetry,
                key=lambda row: _get_text(
                    row,
                    "timestamp",
                ),
            )
        except Exception:
            pass

        first = telemetry[: max(1, len(telemetry) // 5)]
        last = telemetry[-max(1, len(telemetry) // 5):]

        def avg(rows, key):
            values = [
                _get_value(row, key)
                for row in rows
            ]

            return mean(values) if values else 0

        metrics = {
            "latency": (
                avg(first, "latency"),
                avg(last, "latency"),
            ),
            "packet_loss": (
                avg(first, "packet_loss"),
                avg(last, "packet_loss"),
            ),
            "buffering": (
                avg(first, "buffering_time"),
                avg(last, "buffering_time"),
            ),
            "bitrate": (
                avg(first, "bitrate"),
                avg(last, "bitrate"),
            ),
            "jitter": (
                avg(first, "jitter"),
                avg(last, "jitter"),
            ),
        }

        score = 0
        evidence = []
        signals = []

        # Increasing metrics.
        for metric in [
            "latency",
            "packet_loss",
            "buffering",
            "jitter",
        ]:

            baseline, current = metrics[metric]

            if baseline <= 0:
                continue

            change = (
                (current - baseline)
                / baseline
            ) * 100

            if change >= 50:

                contribution = min(
                    15,
                    change / 10,
                )

                score += contribution

                evidence.append(
                    f"{metric.replace('_', ' ').title()} "
                    f"increased by {change:.0f}%."
                )

                signals.append(
                    _make_signal(
                        metric.replace("_", " ").title(),
                        "increase",
                        min(100, change),
                        current,
                        baseline,
                    )
                )

        # Bitrate decreasing is a network symptom.
        baseline, current = metrics["bitrate"]

        if baseline > 0:

            change = (
                (current - baseline)
                / baseline
            ) * 100

            if change <= -30:

                score += min(
                    15,
                    abs(change) / 5,
                )

                evidence.append(
                    f"Bitrate decreased by "
                    f"{abs(change):.0f}%."
                )

                signals.append(
                    _make_signal(
                        "Bitrate",
                        "decrease",
                        min(100, abs(change)),
                        current,
                        baseline,
                    )
                )

        return {
            "score": min(score, 45),
            "signals": signals,
            "evidence": evidence,
        }

    # ---------------------------------------------------------------
    # Helpers
    # ---------------------------------------------------------------

    def _anomaly_evidence_text(
        self,
        anomaly: Any,
    ) -> str:

        anomaly_type = _anomaly_type(anomaly)
        change = _anomaly_change(anomaly)

        label = anomaly_type.replace(
            "_",
            " ",
        ).title()

        if change:

            direction = (
                "changed by"
            )

            return (
                f"{label} {direction} "
                f"{change:.0f}%."
            )

        return f"{label} was detected."

    @staticmethod
    def _unique(items: List[str]) -> List[str]:

        seen = set()
        result = []

        for item in items:

            if item and item not in seen:
                seen.add(item)
                result.append(item)

        return result

    @staticmethod
    def _build_summary(
        primary: Dict[str, Any],
    ) -> str:

        if primary["cause"] == "UNKNOWN":
            return (
                "The available telemetry does not provide "
                "enough correlated evidence to determine a "
                "single root cause."
            )

        return (
            f"{primary['label']} is the most likely root cause "
            f"with {primary['confidence']:.0f}% confidence based "
            f"on correlated telemetry and anomaly evidence."
        )

    @staticmethod
    def _unknown_result():

        return {
            "primary": {
                "cause": "UNKNOWN",
                "label": "Unknown",
                "confidence": 0,
                "evidence": [
                    "Insufficient telemetry or anomaly data."
                ],
                "contributing_signals": [],
            },
            "alternatives": [],
            "analysis_summary": (
                "Insufficient data for root-cause analysis."
            ),
        }


# -------------------------------------------------------------------
# Convenience function
# -------------------------------------------------------------------

def analyze_root_cause(
    telemetry: List[Any],
    anomalies: List[Any],
) -> Dict[str, Any]:

    engine = RootCauseEngine()

    return engine.analyze(
        telemetry,
        anomalies,
    )