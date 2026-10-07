import type {
  ScenarioAnalyticsSummary,
  ScenarioName,
  SimulationResponse,
} from './types';

const API_BASE_URL = 'http://localhost:8000';

export const SCENARIO_OPTIONS: Array<{
  value: ScenarioName | 'multi_factor';
  label: string;
}> = [
  {
    value: 'healthy',
    label: 'Healthy',
  },
  {
    value: 'network_congestion',
    label: 'Network Congestion',
  },
  {
    value: 'cdn_degradation',
    label: 'CDN Degradation',
  },
  {
    value: 'server_overload',
    label: 'Server Overload',
  },
  {
    value: 'application_failure',
    label: 'Application Failure',
  },
  {
    value: 'multi_factor',
    label: 'Multi-Factor Incident',
  },
];

export async function fetchScenarioSimulation(
  scenario: ScenarioName | 'multi_factor',
  scenarios?: ScenarioName[],
): Promise<SimulationResponse> {
  const payload =
    scenario === 'multi_factor'
      ? {
          scenario: 'multi_factor',
          scenarios,
          sessions: 25,
          duration_minutes: 5,
          interval_seconds: 10,
          seed: 42,
        }
      : {
          scenario,
          sessions: 25,
          duration_minutes: 5,
          interval_seconds: 10,
          seed: 42,
        };

  const response = await fetch(`${API_BASE_URL}/simulate`, {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
    },

    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();

    throw new Error(
      message || 'Simulation request failed.',
    );
  }

  return response.json();
}

export async function fetchScenarioAnalytics(): Promise<
  ScenarioAnalyticsSummary[]
> {
  const individualScenarios = SCENARIO_OPTIONS.filter(
    (
      option,
    ): option is {
      value: ScenarioName;
      label: string;
    } => option.value !== 'multi_factor',
  );

  const results = await Promise.all(
    individualScenarios.map(async ({ value, label }) => {
      const data = await fetchScenarioSimulation(value);

      return {
        scenario: value,
        label,

        avg_qoe: Number(
          data.summary.average_qoe ??
            data.qoe.summary.average_qoe ??
            0,
        ),

        status: String(
          data.summary.status ??
            data.qoe.summary.status ??
            'Unknown',
        ),

        alerts: Array.isArray(data.alerts)
          ? data.alerts.length
          : 0,

        anomalyTypes: Array.from(
          new Set(
            (data.anomalies ?? []).map(
              (item) => item.type,
            ),
          ),
        ),
      };
    }),
  );

  return results;
}

export async function askIncidentQuestion(
  question: string,
  incident: any,
) {
  const response = await fetch(
    `${API_BASE_URL}/incident/chat`,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        question,
        incident,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      'Unable to contact the incident assistant.',
    );
  }

  return response.json();
}