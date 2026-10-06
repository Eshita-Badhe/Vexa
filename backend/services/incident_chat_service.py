from __future__ import annotations

import json
import os
from typing import Any, Dict

import requests


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

    primary = (
        root_cause.get("primary", {})
        if isinstance(root_cause, dict)
        else {}
    )

    return {
        "scenario": incident.get(
            "scenario"
        ),

        "qoe": incident.get(
            "qoe",
            {},
        ),

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

        "anomalies": incident.get(
            "anomalies",
            [],
        ),

        "alerts": incident.get(
            "alerts",
            [],
        ),

        "summary": incident.get(
            "summary",
            {},
        ),
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

    response = requests.post(
        f"{IMAGINE_API_ENDPOINT}/v2/chat/completions",
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

    response.raise_for_status()

    data = response.json()

    answer = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )

    return {
        "answer": answer.strip(),
        "provider": "Qualcomm Imagine",
        "configured": True,
    }