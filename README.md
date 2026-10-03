# Media Stream Quality Detective

This project is the first module for a streaming-quality monitoring platform. It generates deterministic telemetry datasets, validates them, calculates explainable QoE scores, and exposes a minimal FastAPI surface for future anomaly-detection and root-cause-analysis work.

## Architecture

- Dataset generation: synthetic telemetry scenarios with repeatable seeded output.
- Data validation: ensures telemetry values are realistic and within expected bounds.
- QoE engine: explains each score using transparent metric normalization and weighted aggregation.
- API layer: small set of endpoints for generation, validation, and scenario simulation.

The module is intentionally designed to plug into the next stages:

Anomaly Detector → Root Cause Finder → AI Explanation Layer → Dashboard

## Technology stack

- Python 3.11+
- FastAPI
- Pandas
- NumPy
- Pydantic
- Uvicorn
- pytest

## Installation

```bash
cd /path/to/project
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## Telemetry schema

Each telemetry row includes:

- timestamp
- session_id
- region
- device
- cdn
- bitrate (Mbps)
- buffering_time (seconds)
- latency (milliseconds)
- packet_loss (%)
- jitter (milliseconds)
- playback_failures (count)
- crashes (count)
- startup_time (seconds)
- resolution
- server_load (%) (optional)

## Scenario definitions

1. Healthy
   - High bitrate, low buffering, low latency, stable packet loss, minimal failures.
2. Network Congestion
   - Quality degrades gradually over time due to increased latency, packet loss, and buffering.
3. CDN Degradation
   - Same CDN and region trend together, while other CDNs remain healthier.
4. Server Overload
   - Increased latency, startup time, and playback failures correlate with server load.
5. Application Failure
   - Network is healthy, but playback failures and crashes increase over time.

## Generate datasets

```bash
python -m backend.services.telemetry_generator --scenario healthy --sessions 100 --duration 30 --output data/healthy.csv
python -m backend.services.telemetry_generator --scenario network_congestion --sessions 100 --duration 30 --output data/network_congestion.csv
python -m backend.services.telemetry_generator --scenario cdn_degradation --sessions 100 --duration 30 --output data/cdn_degradation.csv
python -m backend.services.telemetry_generator --scenario server_overload --sessions 100 --duration 30 --output data/server_overload.csv
python -m backend.services.telemetry_generator --scenario application_failure --sessions 100 --duration 30 --output data/application_failure.csv
```

## Start the API

```bash
python -m uvicorn backend.main:app --reload
```

Open the API documentation at:

- http://localhost:8000/docs

## API examples

### Health

```bash
curl http://localhost:8000/health
```

### Scenarios

```bash
curl http://localhost:8000/scenarios
```

### Generate telemetry

```bash
curl -X POST http://localhost:8000/telemetry/generate \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "network_congestion",
    "sessions": 10,
    "duration_minutes": 5,
    "interval_seconds": 10,
    "seed": 42
  }'
```

### Calculate QoE

```bash
curl -X POST http://localhost:8000/qoe/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "records": [{
      "timestamp": "2024-01-01T00:00:00",
      "session_id": "session_001",
      "region": "Pune",
      "device": "Android",
      "cdn": "CDN-A",
      "bitrate": 8.0,
      "buffering_time": 0.5,
      "latency": 45,
      "packet_loss": 0.6,
      "jitter": 18,
      "playback_failures": 0,
      "crashes": 0,
      "startup_time": 1.8,
      "resolution": "1080p"
    }]
  }'
```

### Simulate a scenario

```bash
curl -X POST http://localhost:8000/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "application_failure",
    "sessions": 25,
    "duration_minutes": 5,
    "interval_seconds": 10,
    "seed": 42
  }'
```

## QoE formula

The QoE score is calculated in two phases.

1. Convert each raw metric to a normalized quality score from 0 to 100.
2. Combine them with the weighted formula:

QoE = 0.30 * bitrate_score + 0.25 * buffering_score + 0.20 * latency_score + 0.15 * packet_loss_score + 0.10 * reliability_score

### Metric normalization logic

- Bitrate score: the higher the bitrate, the better the score.
- Buffering score: the lower the buffering time, the better the score.
- Latency score: lower latency yields a stronger score.
- Packet-loss score: low packet loss is preferred.
- Reliability score: higher failure or crash counts reduce score sharply.

### QoE classification

- 80 to 100: Healthy
- 60 to 79: Degraded
- 0 to 59: Poor

## Example QoE output

```json
{
  "session_id": "session_001",
  "qoe_score": 58.4,
  "status": "Poor",
  "components": {
    "bitrate_score": 42.0,
    "buffering_score": 38.0,
    "latency_score": 55.0,
    "packet_loss_score": 70.0,
    "reliability_score": 85.0
  }
}
```

This output is designed so future modules can append:

- anomalies
- root_cause
- explanation payloads
- dashboard metadata

## Validation rules

The telemetry processor enforces the following:

- bitrate >= 0
- buffering_time >= 0
- latency >= 0
- packet_loss between 0 and 100
- jitter >= 0
- playback_failures >= 0
- crashes >= 0
- startup_time >= 0

Impossible values are clipped to safe bounds, and invalid records are rejected before QoE is calculated.

## Testing

```bash
python -m pytest -q
```

## Future integration points

This module creates a clean contract for future work:

- Anomaly Detector: consume telemetry and QoE history.
- Root Cause Finder: read scenario trends and session features.
- AI Explainer: use QoE components and metrics for narrative explanation.
- Dashboard: consume scenario summaries and per-session results.

This is an explainable, deterministic, hackathon-friendly MVP designed to be extended without coupling to a machine-learning model.
