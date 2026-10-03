from __future__ import annotations

from typing import Any, Dict, List

from fastapi import FastAPI

from backend.models.telemetry import GenerateTelemetryRequest, SimulateScenarioRequest
from backend.services.qoe_engine import calculate_qoe, calculate_qoe_for_dataframe, summarize_qoe_results
from backend.services.telemetry_generator import generate_telemetry
from backend.services.telemetry_processor import validate_and_clean_telemetry
from backend.utils.constants import SCENARIO_NAMES

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
    df = generate_telemetry(
        scenario=request.scenario,
        sessions=request.sessions,
        duration_minutes=request.duration_minutes,
        interval_seconds=request.interval_seconds,
        seed=request.seed,
    )
    qoe_results = [calculate_qoe(row) for row in df.to_dict(orient="records")]
    summary = {
        "scenario": request.scenario,
        "total_sessions": request.sessions,
        "average_qoe": round(sum(item["qoe_score"] for item in qoe_results) / len(qoe_results), 2),
        "status": summarize_qoe_results(qoe_results, request.scenario)["status"],
        "average_bitrate": round(float(df["bitrate"].mean()), 2),
        "average_buffering": round(float(df["buffering_time"].mean()), 2),
        "average_latency": round(float(df["latency"].mean()), 2),
        "average_packet_loss": round(float(df["packet_loss"].mean()), 2),
    }
    return {
        "scenario": request.scenario,
        "telemetry": df.to_dict(orient="records"),
        "qoe_results": qoe_results,
        "summary": summary,
    }
