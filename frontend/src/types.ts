export type ScenarioName =
  | 'healthy'
  | 'network_congestion'
  | 'cdn_degradation'
  | 'server_overload'
  | 'application_failure';

export interface TelemetryPoint {
  timestamp: string;
  session_id: string;
  region: string;
  device: string;
  cdn: string;
  bitrate: number;
  buffering_time: number;
  latency: number;
  packet_loss: number;
  jitter: number;
  playback_failures: number;
  crashes: number;
  startup_time: number;
  resolution: string;
  server_load?: number;
}

export interface QoeEntry {
  session_id: string;
  qoe_score: number;
  status: 'Healthy' | 'Degraded' | 'Poor';
  components: {
    bitrate_score: number;
    buffering_score: number;
    latency_score: number;
    packet_loss_score: number;
    reliability_score: number;
  };
  metrics: {
    bitrate: number;
    buffering_time: number;
    latency: number;
    packet_loss: number;
    playback_failures: number;
    crashes: number;
  };
}

export interface QoeSummary {
  scenario: string;
  total_sessions: number;
  average_qoe: number;
  status: string;
}

export interface Anomaly {
  anomaly_id: string;
  timestamp: string;
  session_id: string;
  type: string;
  severity: string;
  confidence: number;
  metric: string;
  baseline: number;
  observed: number;
  change_percent: number;
  evidence: Record<string, number>;
  evidence_summary: string[];
}

export interface Alert {
  id: string;
  severity: string;
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  source: string;
  triggered_at: string;
}

export interface SimulationSummary {
  scenario: string;
  total_sessions: number;
  average_qoe: number;
  status: string;
  average_bitrate: number;
  average_buffering: number;
  average_latency: number;
  average_packet_loss: number;
}

export interface RootCauseAnalysis {
  root_cause?: string;
  confidence?: number;
  evidence?: string[];
  contributing_signals?: string[];
}

export interface AIExplanation {
  what_happened?: string;
  why?: string;
  root_cause?: string;
  confidence?: number;
  recommended_checks?: string[];
  provider?: string;
}

export interface SimulationResponse {
  scenario: string;
  telemetry: TelemetryPoint[];
  qoe: {
    summary: QoeSummary;
    results: QoeEntry[];
  };
  qoe_results: QoeEntry[];
  summary: SimulationSummary;
  anomalies: Anomaly[];
  alerts: Alert[];
  root_cause?: RootCauseAnalysis;
  ai_explanation?: AIExplanation;
}

export interface ScenarioAnalyticsSummary {
  scenario: ScenarioName;
  label: string;
  avg_qoe: number;
  status: string;
  alerts: number;
  anomalyTypes: string[];
}
