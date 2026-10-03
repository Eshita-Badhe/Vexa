from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter

from backend.services.alert_engine import generate_alerts
from backend.services.anomaly_detector import detect_anomalies, group_incident_candidates
from backend.services.telemetry_processor import validate_and_clean_telemetry

router = APIRouter()


@router.post("/anomalies/detect")
def detect_anomalies_endpoint(payload: Dict[str, Any]):
    records = payload.get("records") if isinstance(payload, dict) else payload
    if records is None:
        records = payload
    if isinstance(records, dict):
        records = [records]
    df = validate_and_clean_telemetry(records)
    anomalies = detect_anomalies(df)
    incident_candidates = group_incident_candidates(anomalies)
    return {"anomalies": anomalies, "incident_candidates": incident_candidates}


@router.post("/alerts/generate")
def generate_alerts_endpoint(payload: Dict[str, Any]):
    records = payload.get("telemetry") if isinstance(payload, dict) and "telemetry" in payload else payload
    anomalies = payload.get("anomalies", []) if isinstance(payload, dict) else []
    if records is None:
        records = []
    if isinstance(records, dict):
        records = [records]
    if records:
        df = validate_and_clean_telemetry(records)
    else:
        df = []
    alerts = generate_alerts(df, anomalies)
    return {"alerts": alerts}
