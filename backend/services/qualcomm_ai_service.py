import json
import os
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv

load_dotenv()


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

Return ONLY valid JSON with exactly these fields:

{{
  "what_happened": "...",
  "why": "...",
  "root_cause": "...",
  "confidence": 0,
  "recommended_checks": [
    "...",
    "..."
  ],
  "provider": "Qualcomm Imagine"
}}

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

Now generate the JSON explanation.
"""


# ---------------------------------------------------------
# Extract Model Response
# ---------------------------------------------------------

def _extract_text(
    response_data: Dict[str, Any]
) -> str:

    choices = response_data.get("choices", [])

    if not choices:
        return ""

    first_choice = choices[0]

    message = first_choice.get("message")

    if isinstance(message, dict):

        content = message.get("content")

        if content:
            return str(content)

    text = first_choice.get("text")

    if text:
        return str(text)

    return ""


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

    # Safe fallback
    return {
        "what_happened": text,
        "why": "",
        "root_cause": "",
        "confidence": 0,
        "recommended_checks": [],
        "provider": "Qualcomm Imagine",
    }


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

    url = (
        IMAGINE_API_ENDPOINT.rstrip("/")
        + "/v2/chat/completions"
    )

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

            raise RuntimeError(
                "Qualcomm returned an empty response."
            )

        return _parse_json_response(
            generated_text
        )

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

            float(result["qoe"])

            for result in qoe_results

            if result.get("qoe") is not None

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

        root_cause_name = root_cause.get(
            "cause"
        )

        root_cause_confidence = root_cause.get(
            "confidence",
            0,
        )

        root_cause_evidence = root_cause.get(
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