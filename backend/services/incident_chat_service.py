from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

IMAGINE_API_ENDPOINT = os.getenv(
    "IMAGINE_API_ENDPOINT",
    "https://aisuite.cirrascale.com/apis",
)

IMAGINE_API_KEY = os.getenv(
    "IMAGINE_API_KEY",
)

IMAGINE_MODEL = os.getenv(
    "IMAGINE_MODEL",
)


def build_incident_context(
    incident: Dict[str, Any],
) -> Dict[str, Any]:

    root_cause = incident.get(
        "root_cause",
        {},
    )

    qoe = incident.get("qoe", {})
    qoe_summary = (
        qoe.get("summary", qoe)
        if isinstance(qoe, dict)
        else {}
    )

    primary = (
        root_cause.get("primary", {})
        if isinstance(root_cause, dict)
        else {}
    )

    anomalies = incident.get("anomalies", [])
    compact_anomalies = [
        {
            "type": anomaly.get("type"),
            "severity": anomaly.get("severity"),
            "confidence": anomaly.get("confidence"),
            "metric": anomaly.get("metric"),
            "change_percent": anomaly.get("change_percent"),
            "evidence": str(
                anomaly.get("evidence_summary")
                or anomaly.get("evidence", "")
            )[:240],
        }
        for anomaly in anomalies[-8:]
        if isinstance(anomaly, dict)
    ]

    alerts = incident.get("alerts", [])
    compact_alerts = [
        {
            "severity": alert.get("severity"),
            "title": str(alert.get("title", ""))[:120],
            "message": str(alert.get("message", ""))[:240],
            "anomaly_type": alert.get("anomaly_type"),
            "confidence": alert.get("confidence"),
        }
        for alert in alerts[-8:]
        if isinstance(alert, dict)
    ]

    return {
        "scenario": incident.get(
            "scenario"
        ),

        "qoe": {
            "average_qoe": qoe_summary.get("average_qoe"),
            "status": qoe_summary.get("status"),
            "total_sessions": qoe_summary.get("total_sessions"),
        },

        "root_cause": {
            "cause": primary.get(
                "cause"
            ),
            "label": primary.get(
                "label"
            ),
            "confidence": primary.get(
                "confidence"
            ),
            "evidence": primary.get(
                "evidence",
                [],
            ),
            "contributing_signals": primary.get(
                "contributing_signals",
                [],
            ),
        },

        "alternatives": root_cause.get(
            "alternatives",
            []
        ),

        "analysis_summary": root_cause.get(
            "analysis_summary",
            ""
        ),

        "anomalies": compact_anomalies,

        "alerts": compact_alerts,

        "summary": incident.get("summary", {}),
    }

def ask_incident_question(
    question: str,
    incident: Dict[str, Any],
) -> Dict[str, Any]:

    context = build_incident_context(
        incident
    )

    if not IMAGINE_API_KEY:
        return {
            "answer": (
                "Qualcomm Imagine AI is not configured yet. "
                "The incident analysis is available, but "
                "AI-powered interactive questioning requires "
                "an Imagine API key."
            ),
            "provider": "Qualcomm Imagine",
            "configured": False,
        }

    system_prompt = """
You are the Incident Investigation Assistant
for a Media Stream Quality monitoring platform.

You answer questions ONLY using the supplied
incident analysis context.

The deterministic Root Cause Engine is authoritative
for the primary root cause.

Do NOT invent telemetry values.
Do NOT change the detected root cause.
Do NOT claim certainty beyond the supplied confidence.

You may:
- explain the detected root cause
- explain anomalies
- explain QoE degradation
- compare alternative causes
- explain contributing signals
- recommend investigation checks
- summarize the incident

If the supplied context does not contain enough
information to answer a question, say so clearly.

Keep answers concise, technical, and useful
for a streaming operations investigator.
"""

    user_prompt = f"""
INCIDENT CONTEXT:

{json.dumps(context, indent=2, default=str)}

INVESTIGATOR QUESTION:

{question}

Answer the investigator's question using only
the incident context above.
"""

    try:
        base_url = IMAGINE_API_ENDPOINT.rstrip("/")
        if base_url.endswith("/v2"):
            request_url = base_url + "/chat/completions"
        else:
            request_url = base_url + "/v2/chat/completions"

        response = requests.post(
            request_url,
            headers={
                "Authorization": (
                    f"Bearer {IMAGINE_API_KEY}"
                ),
                "Content-Type": "application/json",
            },
            json={
                "model": IMAGINE_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": system_prompt,
                    },
                    {
                        "role": "user",
                        "content": user_prompt,
                    },
                ],
                "temperature": 0.2,
            },
            timeout=60,
        )

        if response.status_code >= 400:
            return {
                "answer": (
                    "Qualcomm Imagine is temporarily unavailable. "
                    "The incident analysis is still available, but the AI assistant could not generate a live answer right now. "
                    f"HTTP {response.status_code}."
                ),
                "provider": "Qualcomm Imagine",
                "configured": True,
            }

        data = response.json()
        answer = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )

        if not answer or not str(answer).strip():
            return {
                "answer": (
                    "Qualcomm Imagine returned no usable answer. "
                    "The deterministic incident analysis is still available, but the AI explanation is currently unavailable."
                ),
                "provider": "Qualcomm Imagine",
                "configured": True,
            }

        return {
            "answer": str(answer).strip(),
            "provider": "Qualcomm Imagine",
            "configured": True,
        }

    except requests.RequestException as exc:
        return {
            "answer": (
                "Qualcomm Imagine is not responding right now. "
                "The incident analysis remains available, but AI-powered chat is temporarily unavailable. "
                f"Details: {exc}"
            ),
            "provider": "Qualcomm Imagine",
            "configured": True,
        }
    except Exception as exc:
        return {
            "answer": (
                "The incident AI assistant could not complete the request. "
                "The deterministic analysis is still available. "
                f"Details: {exc}"
            ),
            "provider": "Qualcomm Imagine",
            "configured": True,
        }