import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")


# ---------------------------------------------------------
# Qualcomm Imagine API Configuration
# ---------------------------------------------------------

IMAGINE_API_ENDPOINT = os.getenv(
    "IMAGINE_API_ENDPOINT",
    "https://aisuite.cirrascale.com/apis",
)

IMAGINE_API_KEY = os.getenv("IMAGINE_API_KEY")

IMAGINE_MODEL = os.getenv("IMAGINE_MODEL")


# ---------------------------------------------------------
# Configuration Check
# ---------------------------------------------------------

def is_qualcomm_configured() -> bool:
    """
    Returns True only when all Qualcomm API
    configuration values are available.
    """

    return bool(
        IMAGINE_API_KEY
        and IMAGINE_API_ENDPOINT
        and IMAGINE_MODEL
    )


# ---------------------------------------------------------
# Prompt Builder
# ---------------------------------------------------------

def build_incident_prompt(
    evidence: Dict[str, Any]
) -> str:

    return f"""
You are an expert media streaming observability analyst.

Analyze the following streaming incident.

IMPORTANT RULES:

1. Do NOT invent a root cause.
2. The structured detection system has already identified
   the most likely root cause.
3. Use ONLY the supplied telemetry, anomalies and
   root-cause evidence.
4. Explain the incident clearly for an operations engineer.
5. Keep the response concise and evidence-based.

Return a concise explanation in plain text, in two or three sentences.
Do not return JSON, markdown, or a tool call. Explain what happened
and cite the supplied evidence. Do not repeat the root-cause label
unless the evidence supports it.

---------------------------------------------------------
INCIDENT
---------------------------------------------------------

Scenario:
{evidence.get("scenario")}

QoE:
{evidence.get("qoe")}

QoE Status:
{evidence.get("qoe_status")}

Likely Root Cause:
{evidence.get("root_cause")}

Root Cause Confidence:
{evidence.get("root_cause_confidence")}%

---------------------------------------------------------
TELEMETRY SUMMARY
---------------------------------------------------------

{json.dumps(
    evidence.get("telemetry_summary", {}),
    indent=2
)}

---------------------------------------------------------
DETECTED ANOMALIES
---------------------------------------------------------

{json.dumps(
    evidence.get("anomalies", []),
    indent=2
)}

---------------------------------------------------------
ROOT CAUSE EVIDENCE
---------------------------------------------------------

{json.dumps(
    evidence.get("root_cause_evidence", []),
    indent=2
)}

Now write the concise plain-text explanation.
"""


# ---------------------------------------------------------
# Extract Model Response
# ---------------------------------------------------------

def _extract_text(
    response_data: Dict[str, Any]
) -> str:

    if not isinstance(response_data, dict):
        return ""

    choices = response_data.get("choices", [])

    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue

            message = choice.get("message") or {}
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip()
                if isinstance(content, list):
                    chunks = []
                    for item in content:
                        if isinstance(item, dict):
                            text = item.get("text") or item.get("content") or item.get("value")
                            if isinstance(text, str) and text.strip():
                                chunks.append(text.strip())
                    if chunks:
                        return "\n".join(chunks)

            text = choice.get("text")
            if isinstance(text, str) and text.strip():
                return text.strip()
            if isinstance(text, list):
                chunks = []
                for item in text:
                    if isinstance(item, dict):
                        value = item.get("text") or item.get("content") or item.get("value")
                        if isinstance(value, str) and value.strip():
                            chunks.append(value.strip())
                if chunks:
                    return "\n".join(chunks)

    for key in ["output_text", "generated_text", "completion", "text"]:
        value = response_data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    return ""


# ---------------------------------------------------------
# Fallback Explanation
# ---------------------------------------------------------

def build_structured_fallback(
    evidence: Dict[str, Any]
) -> Dict[str, Any]:

    root_cause = evidence.get("root_cause") or "Unknown"
    confidence = int(evidence.get("root_cause_confidence", 0) or 0)
    qoe = evidence.get("qoe")
    qoe_status = evidence.get("qoe_status") or "Unknown"

    anomalies = evidence.get("anomalies", [])
    first_anomaly = anomalies[0] if anomalies else {}
    anomaly_type = first_anomaly.get("type") or "no significant anomaly"
    anomaly_severity = first_anomaly.get("severity") or "unclassified"
    why = first_anomaly.get("evidence")
    if not why:
        root_cause_evidence = evidence.get("root_cause_evidence", [])
        if root_cause_evidence:
            why = "; ".join(str(item) for item in root_cause_evidence[:2])
        else:
            why = (
                f"No significant anomaly was detected; the root-cause "
                f"analysis classified the incident as {root_cause}."
            )

    return {
        "what_happened": (
            f"The {evidence.get('scenario', 'streaming')} scenario "
            f"has an average QoE of {qoe} ({qoe_status})."
        ),
        "why": str(why),
        "root_cause": str(root_cause),
        "confidence": max(0, min(confidence, 100)),
        "recommended_checks": [
            "Review CDN or edge latency for the affected region.",
            "Check packet loss and jitter during the incident window.",
            "Validate streaming server load and playback failure logs.",
        ],
        "provider": "Qualcomm Imagine (fallback)",
    }


# ---------------------------------------------------------
# Parse JSON Returned By Model
# ---------------------------------------------------------

def _parse_json_response(
    text: str
) -> Dict[str, Any]:

    text = text.strip()

    # Remove markdown code fences if model adds them
    if text.startswith("```"):

        lines = text.splitlines()

        if lines and lines[0].startswith("```"):
            lines = lines[1:]

        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]

        text = "\n".join(lines).strip()

        if text.lower().startswith("json"):
            text = text[4:].strip()

    try:

        parsed = json.loads(text)

        if isinstance(parsed, dict):
            return parsed

    except json.JSONDecodeError:
        pass

    return {"what_happened": text}


# ---------------------------------------------------------
# Call Qualcomm AI
# ---------------------------------------------------------

def explain_incident(
    evidence: Dict[str, Any]
) -> Optional[Dict[str, Any]]:

    # No credentials → don't break the application
    if not is_qualcomm_configured():

        print(
            "Qualcomm AI is not configured. "
            "Using structured fallback explanation."
        )

        return None

    base_url = IMAGINE_API_ENDPOINT.rstrip("/")
    if base_url.endswith("/v2"):
        url = base_url + "/chat/completions"
    else:
        url = base_url + "/v2/chat/completions"

    prompt = build_incident_prompt(evidence)

    payload = {

        "model": IMAGINE_MODEL,

        "messages": [

            {
                "role": "system",
                "content": (
                    "You are a media streaming quality "
                    "and observability expert."
                ),
            },

            {
                "role": "user",
                "content": prompt,
            },

        ],

        "stream": False,

        "temperature": 0.1,
    }

    headers = {

        "Authorization": (
            f"Bearer {IMAGINE_API_KEY}"
        ),

        "Content-Type": "application/json",
    }

    try:

        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=60,
        )

        response.raise_for_status()

        response_data = response.json()

        generated_text = _extract_text(
            response_data
        )

        if not generated_text:
            print(
                "Qualcomm returned an empty or unusable response; "
                "using structured fallback explanation."
            )
            return build_structured_fallback(
                evidence
            )

        parsed = _parse_json_response(
            generated_text
        )
        required_fields = {
            "what_happened",
            "why",
            "root_cause",
            "confidence",
            "recommended_checks",
        }
        if required_fields.issubset(parsed):
            parsed.setdefault("provider", "Qualcomm Imagine")
            return parsed

        explanation = build_structured_fallback(evidence)
        model_text = parsed.get("what_happened")
        if model_text:
            explanation["what_happened"] = str(model_text).strip()
            explanation["provider"] = "Qualcomm Imagine"
        return explanation

    except requests.RequestException as exc:

        print(
            f"Qualcomm AI request failed: {exc}"
        )

        return None

    except Exception as exc:

        print(
            f"Qualcomm AI processing failed: {exc}"
        )

        return None


# ---------------------------------------------------------
# Build Evidence For AI
# ---------------------------------------------------------

def build_ai_evidence(
    scenario: str,
    telemetry_records,
    qoe_results,
    anomalies,
    root_cause,
) -> Dict[str, Any]:

    # Keep the latest few records for context
    latest_records = telemetry_records[-5:]

    telemetry_summary = {}

    if telemetry_records:

        numeric_fields = [

            "bitrate",
            "buffering_time",
            "latency",
            "packet_loss",
            "jitter",
            "playback_failures",
            "crashes",
            "startup_time",
            "server_load",

        ]

        for field in numeric_fields:

            values = [

                float(record[field])

                for record in telemetry_records

                if record.get(field) is not None

            ]

            if values:

                telemetry_summary[field] = {

                    "average": round(
                        sum(values) / len(values),
                        2,
                    ),

                    "minimum": round(
                        min(values),
                        2,
                    ),

                    "maximum": round(
                        max(values),
                        2,
                    ),
                }

    # -----------------------------------------------------
    # QoE
    # -----------------------------------------------------

    average_qoe = 0.0

    if qoe_results:

        qoe_values = [

            float(result.get("qoe_score", result.get("qoe", 0)))

            for result in qoe_results

            if result.get("qoe_score", result.get("qoe")) is not None

        ]

        if qoe_values:

            average_qoe = round(
                sum(qoe_values) / len(qoe_values),
                2,
            )

    # -----------------------------------------------------
    # Anomalies
    # -----------------------------------------------------

    anomaly_summary = []

    for anomaly in anomalies[:15]:

        anomaly_summary.append({

            "type": anomaly.get("type"),

            "severity": anomaly.get("severity"),

            "confidence": anomaly.get("confidence"),

            "evidence": anomaly.get(
                "evidence_summary"
            ),
        })

    # -----------------------------------------------------
    # Root Cause
    # -----------------------------------------------------

    root_cause_name = None

    root_cause_confidence = 0

    root_cause_evidence = []

    if root_cause:

        primary_cause = root_cause.get("primary", root_cause)
        if isinstance(primary_cause, dict):
            root_cause_name = primary_cause.get(
                "label",
                primary_cause.get("cause"),
            )

            root_cause_confidence = primary_cause.get(
                "confidence",
                0,
            )

            root_cause_evidence = primary_cause.get(
                "evidence",
                [],
            )

    # -----------------------------------------------------
    # QoE Status
    # -----------------------------------------------------

    qoe_status = None

    if qoe_results:

        statuses = [

            result.get("status")

            for result in qoe_results

            if result.get("status")

        ]

        if statuses:

            qoe_status = statuses[-1]

    # -----------------------------------------------------
    # Final Evidence Object
    # -----------------------------------------------------

    return {

        "scenario": scenario,

        "qoe": average_qoe,

        "qoe_status": qoe_status,

        "root_cause": root_cause_name,

        "root_cause_confidence":
            root_cause_confidence,

        "telemetry_summary":
            telemetry_summary,

        "latest_records":
            latest_records,

        "anomalies":
            anomaly_summary,

        "root_cause_evidence":
            root_cause_evidence,
    }