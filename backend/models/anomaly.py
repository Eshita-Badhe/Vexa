from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Severity = Literal["INFO", "WARNING", "CRITICAL"]


class AnomalyRecord(BaseModel):
    """Explainable anomaly payload for a single abnormal condition."""

    model_config = ConfigDict(extra="allow")

    anomaly_id: str
    timestamp: datetime | str
    session_id: str
    type: str
    severity: Severity
    confidence: float = Field(ge=0.0, le=1.0)
    metric: Optional[str] = None
    baseline: Optional[float] = None
    observed: Optional[float] = None
    change_percent: Optional[float] = None
    evidence: Dict[str, Any] = Field(default_factory=dict)
    evidence_summary: List[str] = Field(default_factory=list)


class AlertRecord(BaseModel):
    """User-facing alert generated from one or more anomalies."""

    model_config = ConfigDict(extra="allow")

    alert_id: str
    timestamp: datetime | str
    session_id: str
    severity: Severity
    title: str
    message: str
    anomaly_type: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: List[str] = Field(default_factory=list)
