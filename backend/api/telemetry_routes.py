from __future__ import annotations

from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException

from backend.models.telemetry import GenerateTelemetryRequest, SimulateScenarioRequest
from backend.services.alert_engine import generate_alerts
from backend.services.anomaly_detector import detect_anomalies
from backend.services.qoe_engine import calculate_qoe, calculate_qoe_for_dataframe, summarize_qoe_results
from backend.services.telemetry_generator import generate_telemetry
from backend.services.telemetry_processor import validate_and_clean_telemetry
from backend.utils.constants import SCENARIO_NAMES
from backend.services.root_cause_engine import analyze_root_cause
from backend.services.qualcomm_ai_service import (
    build_ai_evidence,
    explain_incident,
)
from backend.services.incident_chat_service import (ask_incident_question)
from backend.services.detection_verifier import verify_detection

app = FastAPI(title="Media Stream Quality API", version="1.0.0")


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/scenarios")
def list_scenarios():
    return {"scenarios": SCENARIO_NAMES}


@app.post("/telemetry/generate")
def generate_telemetry_endpoint(request: GenerateTelemetryRequest):
    df = generate_telemetry(
        scenario=request.scenario,
        sessions=request.sessions,
        duration_minutes=request.duration_minutes,
        interval_seconds=request.interval_seconds,
        seed=request.seed,
    )
    return df.to_dict(orient="records")


@app.post("/qoe/calculate")
def calculate_qoe_endpoint(payload: Dict[str, Any]):
    records = payload.get("records")
    if records is None:
        records = payload
    if isinstance(records, dict):
        records = [records]
    df = validate_and_clean_telemetry(records)
    results = calculate_qoe_for_dataframe(df)
    return {"count": len(results), "results": results}


@app.post("/simulate")
def simulate_scenario(request: SimulateScenarioRequest):

    # ---------------------------------------------------------
    # 0. Resolve simulation mode
    # ---------------------------------------------------------

    if request.scenario == "multi_factor":

        selected_scenarios = request.scenarios or []

        if len(selected_scenarios) < 2:
            raise HTTPException(
                status_code=400,
                detail="Multi-factor simulation requires at least 2 scenarios.",
            )

        if len(selected_scenarios) > 3:
            raise HTTPException(
                status_code=400,
                detail="Multi-factor simulation supports at most 3 scenarios.",
            )

        simulation_label = "multi_factor"

    else:

        selected_scenarios = [
            request.scenario
        ]

        simulation_label = request.scenario

    # ---------------------------------------------------------
    # 1. Generate telemetry
    # ---------------------------------------------------------

    print("SIMULATE START")

    df = generate_telemetry(
        scenario=simulation_label,
        scenarios=selected_scenarios,
        sessions=request.sessions,
        duration_minutes=request.duration_minutes,
        interval_seconds=request.interval_seconds,
        seed=request.seed,
    )

    print("SIMULATE: TELEMETRY DONE")

    # ---------------------------------------------------------
    # 2. Calculate QoE
    # ---------------------------------------------------------

    telemetry_records = df.to_dict(
        orient="records"
    )

    qoe_results = [
        calculate_qoe(row)
        for row in telemetry_records
    ]

    print("SIMULATE: QOE DONE")

    qoe_summary = summarize_qoe_results(
        qoe_results,
        simulation_label,
    )

    # ---------------------------------------------------------
    # 3. Detect anomalies
    # ---------------------------------------------------------

    anomalies = detect_anomalies(df)

    print("SIMULATE: ANOMALIES DONE")

    # ---------------------------------------------------------
    # 4. Generate alerts
    # ---------------------------------------------------------


    alerts = generate_alerts(
        df,
        anomalies,
    )

    
    print("SIMULATE: ALERTS DONE")

    # ---------------------------------------------------------
    # 5. Root Cause Analysis
    # ---------------------------------------------------------

    root_cause = analyze_root_cause(
        telemetry_records,
        anomalies,
        scenarios=selected_scenarios,
    )

    print("SIMULATE: ROOT CAUSE DONE")

    # ---------------------------------------------------------
    # 5.1 Detection Verification
    # ---------------------------------------------------------

    detection_verification = verify_detection(
        root_cause=root_cause,
        anomalies=anomalies,
        telemetry=telemetry_records,
        selected_scenarios=selected_scenarios,
    )

    print("SIMULATE: VERIFICATION DONE")

    # ---------------------------------------------------------
    # 6. Qualcomm AI Explanation
    # ---------------------------------------------------------

    ai_explanation = None

    try:

        ai_evidence = build_ai_evidence(
            scenario=simulation_label,
            telemetry_records=telemetry_records,
            qoe_results=qoe_results,
            anomalies=anomalies,
            root_cause=root_cause,
            detection_verification=detection_verification,
        )
        print("SIMULATE: AI EVIDENCE DONE")
        ai_explanation = explain_incident(
            ai_evidence
        )
        print("SIMULATE: AI EXPLANATION DONE")
    except Exception as exc:

        print(
            f"Qualcomm AI explanation failed: {exc}"
        )

    # ---------------------------------------------------------
    # 7. Average QoE
    # ---------------------------------------------------------

    average_qoe = (
        sum(
            item["qoe_score"]
            for item in qoe_results
        )
        / len(qoe_results)
        if qoe_results
        else 0
    )

    # ---------------------------------------------------------
    # 8. Summary
    # ---------------------------------------------------------

    summary = {

        "scenario": simulation_label,

        "scenarios": selected_scenarios,

        "is_multi_factor": (
            simulation_label == "multi_factor"
        ),

        "total_sessions": request.sessions,

        "average_qoe": round(
            average_qoe,
            2,
        ),

        "status": qoe_summary["status"],

        "average_bitrate": round(
            float(df["bitrate"].mean()),
            2,
        ),

        "average_buffering": round(
            float(
                df["buffering_time"].mean()
            ),
            2,
        ),

        "average_latency": round(
            float(df["latency"].mean()),
            2,
        ),

        "average_packet_loss": round(
            float(df["packet_loss"].mean()),
            2,
        ),

    }

    # ---------------------------------------------------------
    # 9. Final response
    # ---------------------------------------------------------

    return {

        "scenario": simulation_label,

        "scenarios": selected_scenarios,

        "is_multi_factor": (
            simulation_label == "multi_factor"
        ),

        "telemetry": telemetry_records,

        "qoe": {
            "summary": qoe_summary,
            "results": qoe_results,
        },

        "qoe_results": qoe_results,

        "summary": summary,

        "anomalies": anomalies,

        "alerts": alerts,

        "root_cause": root_cause,

        "ai_explanation": ai_explanation,

        "detection_verification": detection_verification,
    }

@app.post("/incident/chat")
def incident_chat(
    payload: Dict[str, Any]
):

    question = str(
        payload.get(
            "question",
            "",
        )
    ).strip()

    incident = payload.get(
        "incident",
        {},
    )

    if not question:
        return {
            "answer": "Please enter a question.",
            "provider": "System",
            "configured": False,
        }

    return ask_incident_question(
        question,
        incident,
    )