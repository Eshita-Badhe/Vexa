from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TelemetryRecord(BaseModel):
    """Validated streaming telemetry payload for a single sample."""

    model_config = ConfigDict(extra="allow")

    timestamp: Union[datetime, str]
    session_id: str
    region: str
    device: str
    cdn: str
    bitrate: float = Field(..., ge=0)
    buffering_time: float = Field(..., ge=0)
    latency: float = Field(..., ge=0)
    packet_loss: float = Field(..., ge=0, le=100)
    jitter: float = Field(..., ge=0)
    playback_failures: int = Field(..., ge=0)
    crashes: int = Field(..., ge=0)
    startup_time: float = Field(..., ge=0)
    resolution: str
    server_load: Optional[float] = Field(default=None, ge=0, le=100)

    @field_validator("timestamp", mode="before")
    @classmethod
    def normalize_timestamp(cls, value: Any) -> Any:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            return value
        raise TypeError("timestamp must be a datetime or ISO-8601 string")


class GenerateTelemetryRequest(BaseModel):
    scenario: Literal[
        "healthy",
        "network_congestion",
        "cdn_degradation",
        "server_overload",
        "application_failure",
    ]
    sessions: int = Field(default=100, ge=1)
    duration_minutes: int = Field(default=30, ge=1)
    interval_seconds: int = Field(default=10, ge=1)
    seed: int = Field(default=42, ge=0)


class SimulateScenarioRequest(BaseModel):
    scenario: Literal[
        "healthy",
        "network_congestion",
        "cdn_degradation",
        "server_overload",
        "application_failure",
    ] = "healthy"
    sessions: int = Field(default=25, ge=1)
    duration_minutes: int = Field(default=5, ge=1)
    interval_seconds: int = Field(default=10, ge=1)
    seed: int = Field(default=42, ge=0)
