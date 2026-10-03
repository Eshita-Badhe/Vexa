import type { ScenarioAnalyticsSummary, ScenarioName, SimulationResponse } from './types';

const API_BASE_URL = 'http://localhost:8000';

export const SCENARIO_OPTIONS: Array<{ value: ScenarioName; label: string }> = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'network_congestion', label: 'Network Congestion' },
  { value: 'cdn_degradation', label: 'CDN Degradation' },
  { value: 'server_overload', label: 'Server Overload' },
  { value: 'application_failure', label: 'Application Failure' },
];

export async function fetchScenarioSimulation(scenario: ScenarioName): Promise<SimulationResponse> {
  const response = await fetch(`${API_BASE_URL}/simulate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scenario,
      sessions: 25,
      duration_minutes: 5,
      interval_seconds: 10,
      seed: 42,
    }),
  });

  if (!response.ok) {
    throw new Error(`Simulation request failed with status ${response.status}`);
  }

  return response.json() as Promise<SimulationResponse>;
}

export async function fetchScenarioAnalytics(): Promise<ScenarioAnalyticsSummary[]> {
  const results = await Promise.all(
    SCENARIO_OPTIONS.map(async ({ value, label }) => {
      const data = await fetchScenarioSimulation(value);
      return {
        scenario: value,
        label,
        avg_qoe: Number(data.summary.average_qoe ?? data.qoe.summary.average_qoe ?? 0),
        status: String(data.summary.status ?? data.qoe.summary.status ?? 'Unknown'),
        alerts: Array.isArray(data.alerts) ? data.alerts.length : 0,
        anomalyTypes: Array.from(new Set((data.anomalies ?? []).map((item) => item.type))),
      };
    }),
  );

  return results;
}
