import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv


# =========================================================
# ENVIRONMENT
# =========================================================

BASE_DIR = Path(__file__).resolve().parents[1]

load_dotenv(BASE_DIR / ".env")


# =========================================================
# Qualcomm Imagine API Configuration
# =========================================================

IMAGINE_API_ENDPOINT = os.getenv(
    "IMAGINE_API_ENDPOINT",
    "https://aisuite.cirrascale.com/apis",
)

IMAGINE_API_KEY = os.getenv(
    "IMAGINE_API_KEY"
)

IMAGINE_MODEL = os.getenv(
    "IMAGINE_MODEL"
)


# =========================================================
# Configuration Check
# =========================================================

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


# =========================================================
# Prompt Builder
# =========================================================

def build_incident_prompt(
    evidence: Dict[str, Any]
) -> str:

    return f"""
You are an expert media streaming observability analyst.

Analyze the following streaming incident.

IMPORTANT RULES:

1. Do NOT invent a root cause.

2. The deterministic Root Cause Engine has already
   identified the most likely root cause.

3. The Detection Verification Layer has independently
   checked whether the detected root cause is supported.

4. Do NOT change the detected root cause.

5. If verification status is VERIFIED, explain why
   the telemetry and anomalies support the detection.

6. If verification status is PARTIALLY_VERIFIED, clearly
   mention that the detection has partial supporting evidence.

7. If verification status is NOT_VERIFIED, do not present
   the detection as confirmed. Clearly state that the
   available evidence is insufficient or inconsistent.

8. For multi-factor incidents, explain the verification
   status of each contributing cause separately.

9. Use ONLY the supplied telemetry, anomalies,
   root-cause evidence and verification evidence.

10. Do not manufacture metrics, anomalies or evidence.

11. Explain the incident clearly for an operations engineer.

12. Keep the response concise and evidence-based.

Return a concise explanation in plain text, in two or three sentences.

Do not return JSON, markdown, or a tool call.

Explain:
- what happened,
- why it happened based on the supplied evidence,
- the detected root cause,
- and the verification status when relevant.

Do not change the deterministic root cause.

Do not invent any additional evidence.

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

---------------------------------------------------------
DETECTION VERIFICATION
---------------------------------------------------------

The deterministic verification layer has independently
checked whether the detected root cause is supported by
the telemetry and anomaly evidence.

Verification result:

{json.dumps(
    evidence.get("detection_verification", {}),
    indent=2
)}

Now write the concise plain-text explanation.
"""


# =========================================================
# Extract Model Response
# =========================================================

def _extract_text(
    response_data: Dict[str, Any]
) -> str:

    if not isinstance(response_data, dict):
        return ""

    choices = response_data.get(
        "choices",
        []
    )

    if isinstance(choices, list):

        for choice in choices:

            if not isinstance(choice, dict):
                continue

            # ---------------------------------------------
            # OpenAI-compatible message.content
            # ---------------------------------------------

            message = choice.get(
                "message"
            ) or {}

            if isinstance(message, dict):

                content = message.get(
                    "content"
                )

                if (
                    isinstance(content, str)
                    and content.strip()
                ):
                    return content.strip()

                # Some providers return content
                # as a list of objects.
                if isinstance(content, list):

                    chunks = []

                    for item in content:

                        if not isinstance(
                            item,
                            dict
                        ):
                            continue

                        text = (
                            item.get("text")
                            or item.get("content")
                            or item.get("value")
                        )

                        if (
                            isinstance(text, str)
                            and text.strip()
                        ):
                            chunks.append(
                                text.strip()
                            )

                    if chunks:
                        return "\n".join(
                            chunks
                        )

            # ---------------------------------------------
            # Legacy text response
            # ---------------------------------------------

            text = choice.get(
                "text"
            )

            if (
                isinstance(text, str)
                and text.strip()
            ):
                return text.strip()

            if isinstance(text, list):

                chunks = []

                for item in text:

                    if not isinstance(
                        item,
                        dict
                    ):
                        continue

                    value = (
                        item.get("text")
                        or item.get("content")
                        or item.get("value")
                    )

                    if (
                        isinstance(value, str)
                        and value.strip()
                    ):
                        chunks.append(
                            value.strip()
                        )

                if chunks:
                    return "\n".join(
                        chunks
                    )

    # ---------------------------------------------
    # Other possible response formats
    # ---------------------------------------------

    for key in [
        "output_text",
        "generated_text",
        "completion",
        "text",
    ]:

        value = response_data.get(
            key
        )

        if (
            isinstance(value, str)
            and value.strip()
        ):
            return value.strip()

    return ""


# =========================================================
# Structured Fallback Explanation
# =========================================================

def build_structured_fallback(
    evidence: Dict[str, Any]
) -> Dict[str, Any]:

    root_cause = (
        evidence.get("root_cause")
        or "Unknown"
    )

    confidence = int(
        evidence.get(
            "root_cause_confidence",
            0
        )
        or 0
    )

    qoe = evidence.get(
        "qoe"
    )

    qoe_status = (
        evidence.get("qoe_status")
        or "Unknown"
    )

    anomalies = evidence.get(
        "anomalies",
        []
    )

    first_anomaly = (
        anomalies[0]
        if anomalies
        else {}
    )

    anomaly_type = (
        first_anomaly.get("type")
        or "no significant anomaly"
    )

    anomaly_severity = (
        first_anomaly.get("severity")
        or "unclassified"
    )

    why = first_anomaly.get(
        "evidence"
    )

    root_cause_evidence = []
    
    if isinstance(why, list):

        why = "\n".join(
            f"• {str(item).strip()}"
            for item in why
            if str(item).strip()
        )

    elif why:

        why = str(why).strip()

    if not why:

        root_cause_evidence = evidence.get(
            "root_cause_evidence",
            []
        )

    if root_cause_evidence:

        if isinstance(root_cause_evidence, list):

            why = "\n".join(
                f"• {str(item).strip()}"
                for item in root_cause_evidence[:3]
                if str(item).strip()
            )

        else:

            why = str(
                root_cause_evidence
            ).strip()

    else:

        why = (
            f"No significant anomaly was detected; "
            f"the root-cause analysis classified the "
            f"incident as {root_cause}."
        )
    # ---------------------------------------------
    # Verification information
    # ---------------------------------------------

    detection_verification = (
        evidence.get(
            "detection_verification"
        )
        or {}
    )

    verification_status = (
        detection_verification.get(
            "status"
        )
        or "PENDING"
    )

    verification_score = int(
        detection_verification.get(
            "verification_score",
            0
        )
        or 0
    )

    verification_summary = (
        detection_verification.get(
            "analysis_summary"
        )
        or detection_verification.get(
            "primary_verification",
            {}
        ).get(
            "summary"
        )
        or ""
    )

    return {

        "summary": (
            f"The {evidence.get('scenario', 'streaming')} "
            f"scenario has an average QoE of "
            f"{qoe} ({qoe_status})."
        ),

        "what_happened": (
            f"The {evidence.get('scenario', 'streaming')} "
            f"scenario has an average QoE of "
            f"{qoe} ({qoe_status}), with "
            f"{anomaly_type} detected at "
            f"{anomaly_severity} severity."
        ),

        "why": str(
            why
        ),

        "root_cause": str(
            root_cause
        ),

        "confidence": max(
            0,
            min(
                confidence,
                100
            )
        ),

        "verification_status": (
            verification_status
        ),

        "verification_score": (
            max(
                0,
                min(
                    verification_score,
                    100
                )
            )
        ),

        "verification_summary": (
            verification_summary
        ),

        "evidence": (
            evidence.get(
                "root_cause_evidence",
                []
            )
        ),

        "recommended_checks": [

            "Review CDN or edge latency for the affected region.",

            "Check packet loss and jitter during the incident window.",

            "Validate streaming server load and playback failure logs.",

        ],

        "recommended_actions": [

            "Investigate the strongest correlated telemetry signals.",

            "Validate the detected root cause against the affected infrastructure.",

        ],

        "provider": (
            "Qualcomm Imagine (fallback)"
        ),
    }


# =========================================================
# Parse JSON Returned By Model
# =========================================================

def _parse_json_response(
    text: str
) -> Dict[str, Any]:

    text = text.strip()

    # Remove markdown code fences
    # if model unexpectedly returns them.

    if text.startswith(
        "```"
    ):

        lines = text.splitlines()

        if (
            lines
            and lines[0].startswith("```")
        ):
            lines = lines[1:]

        if (
            lines
            and lines[-1].strip() == "```"
        ):
            lines = lines[:-1]

        text = "\n".join(
            lines
        ).strip()

        if text.lower().startswith(
            "json"
        ):
            text = text[4:].strip()

    try:

        parsed = json.loads(
            text
        )

        if isinstance(
            parsed,
            dict
        ):
            return parsed

    except json.JSONDecodeError:
        pass

    # Plain-text Qualcomm response.
    return {
        "what_happened": text
    }


# =========================================================
# Call Qualcomm AI
# =========================================================

def explain_incident(
    evidence: Dict[str, Any]
) -> Optional[Dict[str, Any]]:

    # -----------------------------------------------------
    # No credentials → use fallback
    # -----------------------------------------------------

    if not is_qualcomm_configured():

        print(
            "Qualcomm AI is not configured. "
            "Using structured fallback explanation."
        )

        return build_structured_fallback(
            evidence
        )

    # -----------------------------------------------------
    # Build endpoint safely
    # -----------------------------------------------------

    base_url = (
        IMAGINE_API_ENDPOINT.rstrip("/")
    )

    if base_url.endswith(
        "/v2"
    ):

        url = (
            base_url
            + "/chat/completions"
        )

    else:

        url = (
            base_url
            + "/v2/chat/completions"
        )

    # -----------------------------------------------------
    # Build prompt
    # -----------------------------------------------------

    prompt = build_incident_prompt(
        evidence
    )

    # -----------------------------------------------------
    # Request payload
    # -----------------------------------------------------

    payload = {

        "model": IMAGINE_MODEL,

        "messages": [

            {
                "role": "system",

                "content": (
                    "You are a media streaming "
                    "quality and observability "
                    "expert."
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

    # -----------------------------------------------------
    # Headers
    # -----------------------------------------------------

    headers = {

        "Authorization": (
            f"Bearer {IMAGINE_API_KEY}"
        ),

        "Content-Type": (
            "application/json"
        ),
    }

    # -----------------------------------------------------
    # Request
    # -----------------------------------------------------

    try:

        print(
            "QUALCOMM AI: REQUEST START"
        )

        response = requests.post(

            url,

            headers=headers,

            json=payload,

            timeout=60,
        )

        print(
            "QUALCOMM AI: RESPONSE",
            response.status_code
        )

        response.raise_for_status()

        response_data = (
            response.json()
        )

        generated_text = (
            _extract_text(
                response_data
            )
        )

        # -------------------------------------------------
        # Empty response → fallback
        # -------------------------------------------------

        if not generated_text:

            print(
                "Qualcomm returned an empty "
                "or unusable response; "
                "using structured fallback explanation."
            )

            return build_structured_fallback(
                evidence
            )

        # -------------------------------------------------
        # Parse response
        # -------------------------------------------------

        parsed = _parse_json_response(
            generated_text
        )

        # -------------------------------------------------
        # Required fields
        # -------------------------------------------------

        required_fields = {

            "what_happened",

            "why",

            "root_cause",

            "confidence",

            "recommended_checks",

        }

        if required_fields.issubset(
            parsed
        ):

            # Keep deterministic verification
            # authoritative even if AI omits it.

            verification = (
                evidence.get(
                    "detection_verification"
                )
                or {}
            )

            parsed.setdefault(
                "verification_status",
                verification.get(
                    "status",
                    "PENDING"
                )
            )

            parsed.setdefault(
                "verification_score",
                verification.get(
                    "verification_score",
                    0
                )
            )

            parsed.setdefault(
                "verification_summary",
                verification.get(
                    "analysis_summary",
                    ""
                )
            )

            parsed.setdefault(
                "evidence",
                evidence.get(
                    "root_cause_evidence",
                    []
                )
            )

            parsed.setdefault(
                "recommended_actions",
                []
            )

            parsed.setdefault(
                "provider",
                "Qualcomm Imagine"
            )

            return parsed

        # -------------------------------------------------
        # Qualcomm returned plain text
        # -------------------------------------------------

        explanation = (
            build_structured_fallback(
                evidence
            )
        )

        model_text = parsed.get(
            "what_happened"
        )

        if model_text:

            explanation[
                "what_happened"
            ] = str(
                model_text
            ).strip()

            explanation[
                "provider"
            ] = "Qualcomm Imagine"

        return explanation

    # -----------------------------------------------------
    # Request error → fallback
    # -----------------------------------------------------

    except requests.RequestException as exc:

        print(
            f"Qualcomm AI request failed: {exc}"
        )

        return build_structured_fallback(
            evidence
        )

    # -----------------------------------------------------
    # Other error → fallback
    # -----------------------------------------------------

    except Exception as exc:

        print(
            f"Qualcomm AI processing failed: {exc}"
        )

        return build_structured_fallback(
            evidence
        )


# =========================================================
# Build Evidence For AI
# =========================================================

def build_ai_evidence(
    scenario: str,
    telemetry_records,
    qoe_results,
    anomalies,
    root_cause,
    detection_verification=None,
) -> Dict[str, Any]:

    # -----------------------------------------------------
    # Latest telemetry
    # -----------------------------------------------------

    latest_records = (
        telemetry_records[-5:]
    )

    # -----------------------------------------------------
    # Telemetry summary
    # -----------------------------------------------------

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

                float(
                    record[field]
                )

                for record in telemetry_records

                if record.get(field)
                is not None

            ]

            if values:

                telemetry_summary[
                    field
                ] = {

                    "average": round(

                        sum(values)
                        / len(values),

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

            float(
                result.get(
                    "qoe_score",
                    result.get(
                        "qoe",
                        0
                    )
                )
            )

            for result in qoe_results

            if result.get(
                "qoe_score",
                result.get("qoe")
            ) is not None

        ]

        if qoe_values:

            average_qoe = round(

                sum(qoe_values)
                / len(qoe_values),

                2,
            )

    # -----------------------------------------------------
    # Anomalies
    # -----------------------------------------------------

    anomaly_summary = []

    for anomaly in anomalies[:15]:

        anomaly_summary.append({

            "type": anomaly.get(
                "type"
            ),

            "severity": anomaly.get(
                "severity"
            ),

            "confidence": anomaly.get(
                "confidence"
            ),

            "evidence": anomaly.get(
                "evidence_summary"
            ),
        })

    # -----------------------------------------------------
    # Root Cause
    # -----------------------------------------------------

    root_cause_name = None

    root_cause_confidence = 0

    if root_cause:

        primary_cause = (
            root_cause.get(
                "primary",
                root_cause
            )
        )

        if isinstance(
            primary_cause,
            dict
        ):

            root_cause_name = (
                primary_cause.get(
                    "label",
                    primary_cause.get(
                        "cause"
                    )
                )
            )

            root_cause_confidence = (
                primary_cause.get(
                    "confidence",
                    0
                )
            )

            root_cause_evidence = (
                primary_cause.get(
                    "evidence",
                    []
                )
            )

    # -----------------------------------------------------
    # QoE Status
    # -----------------------------------------------------

    qoe_status = None

    if qoe_results:

        statuses = [

            result.get(
                "status"
            )

            for result in qoe_results

            if result.get(
                "status"
            )

        ]

        if statuses:

            qoe_status = (
                statuses[-1]
            )

    # -----------------------------------------------------
    # Detection Verification
    # -----------------------------------------------------

    if detection_verification is None:

        detection_verification = {}

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

        "detection_verification":
            detection_verification,

        "telemetry_summary":
            telemetry_summary,

        "latest_records":
            latest_records,

        "anomalies":
            anomaly_summary,

        "root_cause_evidence":
            root_cause_evidence,
    }