import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Activity,
  ArrowRight,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { fetchScenarioAnalytics, fetchScenarioSimulation, SCENARIO_OPTIONS } from './api';
import type { Anomaly, QoeEntry, ScenarioAnalyticsSummary, ScenarioName, SimulationResponse, TelemetryPoint } from './types';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/incident', label: 'Incidents' },
  { to: '/analytics', label: 'Analytics' },
];

function formatNumber(value: number | undefined, digits = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return Number(value).toFixed(digits);
}

function formatPercent(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return `${value.toFixed(1)}%`;
}

function formatSignedPercent(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return `${Math.abs(value).toFixed(0)}%`;
}

function getStatusTone(status?: string) {
  switch (status) {
    case 'Healthy':
      return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
    case 'Degraded':
      return 'text-amber-200 bg-amber-500/10 border-amber-500/30';
    case 'Poor':
      return 'text-red-200 bg-red-500/10 border-red-500/30';
    default:
      return 'text-slate-200 bg-slate-500/10 border-slate-500/30';
  }
}

function getSeverityTone(severity?: string) {
  switch (severity) {
    case 'CRITICAL':
      return 'text-red-200 bg-red-500/10 border-red-500/30';
    case 'WARNING':
      return 'text-amber-200 bg-amber-500/10 border-amber-500/30';
    default:
      return 'text-cyan-200 bg-cyan-500/10 border-cyan-500/30';
  }
}

function humanizeAnomaly(type: string) {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getLatestTelemetry(result: SimulationResponse | null): TelemetryPoint | null {
  if (!result || !result.telemetry.length) {
    return null;
  }
  return result.telemetry[result.telemetry.length - 1];
}

function getLatestQoe(result: SimulationResponse | null): QoeEntry | null {
  if (!result || !result.qoe.results.length) {
    return null;
  }
  return result.qoe.results[result.qoe.results.length - 1];
}

function calculateTrend(current: number, baseline: number) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) {
    return 0;
  }
  return ((current - baseline) / baseline) * 100;
}

function getIncidentDuration(start: string | undefined, end: string | undefined) {
  if (!start || !end) {
    return '—';
  }
  const ms = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes > 0 ? `${minutes} min ` : ''}${seconds} sec`;
}

function formatTimestamp(value: string | undefined) {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-10 text-center text-slate-300">
      <div className="mx-auto mb-3 h-10 w-10 animate-pulse rounded-full border border-cyan-400/30 bg-cyan-500/10" />
      <p>{message}</p>
    </div>
  );
}

function DashboardHeader({
  selectedScenario,
  onScenarioChange,
  onSimulate,
}: {
  selectedScenario: ScenarioName;
  onScenarioChange: (scenario: ScenarioName) => void;
  onSimulate: () => void;
}) {
  return (
    <header className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-glow backdrop-blur-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
              <ArrowUpRight className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.32em] text-slate-400">Media Stream Quality</p>
              <h1 className="text-2xl font-semibold text-white">Media Stream Quality Detective</h1>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200">
            <span className="text-slate-400">Scenario</span>
            <select
              value={selectedScenario}
              onChange={(event) => onScenarioChange(event.target.value as ScenarioName)}
              className="bg-transparent text-sm text-white outline-none"
            >
              {SCENARIO_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={onSimulate}
            className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
          >
            SIMULATE INCIDENT
          </button>
        </div>
      </div>

      <nav className="mt-6 flex flex-wrap gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `rounded-full border px-4 py-2 text-sm transition ${
                isActive
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                  : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-600 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

function MetricCard({ title, value, detail, change, tone }: { title: string; value: string; detail: string; change?: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow">
      <div className="flex items-center justify-between text-slate-300">
        <span>{title}</span>
        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${tone}`}>{title}</span>
      </div>
      <div className="mt-4 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>{detail}</span>
        {change ? <span>{change}</span> : null}
      </div>
    </div>
  );
}

function OverviewPage({ result, onRefresh }: { result: SimulationResponse | null; onRefresh: () => void }) {
  const navigate = useNavigate();
  const latestQoe = useMemo(() => getLatestQoe(result), [result]);
  const latestTelemetry = useMemo(() => getLatestTelemetry(result), [result]);
  const qoeTrend = useMemo(() => {
    if (!result) return [];
    return result.qoe.results.map((row, index) => ({
      name: `S${index + 1}`,
      qoe: Number(row.qoe_score),
      status: row.status,
    }));
  }, [result]);

  const telemetrySeries = useMemo(() => {
    if (!result) return [];
    return result.telemetry.slice(-24).map((entry, index) => ({
      name: `T${index + 1}`,
      bitrate: entry.bitrate,
      latency: entry.latency,
      buffering_time: entry.buffering_time,
      packet_loss: entry.packet_loss,
    }));
  }, [result]);

  const baseline = result?.telemetry[0];
  const anomalyCount = result?.anomalies?.length ?? 0;
  const criticalCount = result?.anomalies?.filter((item) => item.severity === 'CRITICAL').length ?? 0;
  const qoeStatus = latestQoe?.status ?? result?.qoe.summary.status ?? '—';
  const qoeValue = latestQoe?.qoe_score ?? result?.summary.average_qoe ?? 0;

  const metricCards = [
    {
      title: 'QoE',
      value: latestQoe ? `${formatNumber(latestQoe.qoe_score, 1)}` : '—',
      detail: qoeStatus,
      change: result ? `Avg ${formatNumber(result.summary.average_qoe, 1)}` : undefined,
      tone: 'border-cyan-500/30 text-cyan-200',
    },
    {
      title: 'Bitrate',
      value: latestTelemetry ? `${formatNumber(latestTelemetry.bitrate, 1)} Mbps` : '—',
      detail: baseline && latestTelemetry ? 'Current stream rate' : 'Waiting',
      change: baseline && latestTelemetry ? `${latestTelemetry.bitrate > baseline.bitrate ? '↓' : '↑'} ${formatSignedPercent(calculateTrend(latestTelemetry.bitrate, baseline.bitrate))}` : undefined,
      tone: 'border-emerald-500/30 text-emerald-200',
    },
    {
      title: 'Buffering',
      value: latestTelemetry ? `${formatNumber(latestTelemetry.buffering_time, 1)} sec` : '—',
      detail: baseline && latestTelemetry ? 'Playback delay' : 'Waiting',
      change: baseline && latestTelemetry ? `${latestTelemetry.buffering_time > baseline.buffering_time ? '↑' : '↓'} ${formatSignedPercent(calculateTrend(latestTelemetry.buffering_time, baseline.buffering_time))}` : undefined,
      tone: 'border-amber-500/30 text-amber-200',
    },
    {
      title: 'Latency',
      value: latestTelemetry ? `${formatNumber(latestTelemetry.latency, 0)} ms` : '—',
      detail: baseline && latestTelemetry ? 'Network delay' : 'Waiting',
      change: baseline && latestTelemetry ? `${latestTelemetry.latency > baseline.latency ? '↑' : '↓'} ${formatSignedPercent(calculateTrend(latestTelemetry.latency, baseline.latency))}` : undefined,
      tone: 'border-violet-500/30 text-violet-200',
    },
    {
      title: 'Packet Loss',
      value: latestTelemetry ? `${formatNumber(latestTelemetry.packet_loss, 1)}%` : '—',
      detail: baseline && latestTelemetry ? 'Loss rate' : 'Waiting',
      change: baseline && latestTelemetry ? `${latestTelemetry.packet_loss > baseline.packet_loss ? '↑' : '↓'} ${formatSignedPercent(calculateTrend(latestTelemetry.packet_loss, baseline.packet_loss))}` : undefined,
      tone: 'border-red-500/30 text-red-200',
    },
    {
      title: 'Jitter',
      value: latestTelemetry ? `${formatNumber(latestTelemetry.jitter, 1)} ms` : '—',
      detail: baseline && latestTelemetry ? 'Variation' : 'Waiting',
      change: baseline && latestTelemetry ? `${latestTelemetry.jitter > baseline.jitter ? '↑' : '↓'} ${formatSignedPercent(calculateTrend(latestTelemetry.jitter, baseline.jitter))}` : undefined,
      tone: 'border-sky-500/30 text-sky-200',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-400">Current Status</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">QoE Score</h2>
            <div className="mt-4 flex items-end gap-4">
              <div className="text-5xl font-semibold text-white">{formatNumber(qoeValue, 1)}</div>
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] ${getStatusTone(qoeStatus)}`}>
                {qoeStatus}
              </span>
            </div>
          </div>

          <div className="space-y-3 text-sm text-slate-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span>{anomalyCount} anomalies detected</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <span>{criticalCount} critical incident</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {metricCards.map((card) => (
          <MetricCard key={card.title} {...card} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">QoE Score Over Time</h3>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-cyan-200">
              {result?.scenario.replace(/_/g, ' ') ?? 'Scenario'}
            </span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={qoeTrend}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="qoe" stroke="#22d3ee" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow">
          <h3 className="mb-4 text-lg font-semibold text-white">Detected Anomalies</h3>
          <div className="space-y-3">
            {result && result.anomalies.length > 0 ? (
              result.anomalies.slice(0, 4).map((anomaly) => (
                <div key={anomaly.anomaly_id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                      {humanizeAnomaly(anomaly.type)}
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getSeverityTone(anomaly.severity)}`}>
                      {anomaly.severity}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-300">
                    {formatNumber(anomaly.baseline, 1)} → {formatNumber(anomaly.observed, 1)} {anomaly.metric}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{Math.round(anomaly.confidence * 100)}% confidence</div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-emerald-700/30 bg-emerald-500/5 p-4 text-sm text-emerald-200">
                No anomalies detected. Streaming quality is currently healthy.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-4">
        {[
          { title: 'Bitrate', valueKey: 'bitrate', color: '#34d399', unit: 'Mbps' },
          { title: 'Latency', valueKey: 'latency', color: '#facc15', unit: 'ms' },
          { title: 'Buffering', valueKey: 'buffering_time', color: '#f97316', unit: 'sec' },
          { title: 'Packet Loss', valueKey: 'packet_loss', color: '#f87171', unit: '%' },
        ].map((chart) => {
          const latestMetric = telemetrySeries.length > 0
            ? Number(telemetrySeries[telemetrySeries.length - 1][chart.valueKey as keyof (typeof telemetrySeries)[number]] ?? 0)
            : 0;

          return (
            <div key={chart.title} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow">
              <div className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-400">{chart.title}</div>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetrySeries}>
                    <Line type="monotone" dataKey={chart.valueKey as keyof (typeof telemetrySeries)[number]} stroke={chart.color} strokeWidth={2} dot={false} />
                    <Tooltip />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 text-sm text-slate-200">
                {telemetrySeries.length > 0 ? `${formatNumber(latestMetric, 1)} ${chart.unit}` : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {result && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Incident Detected</h3>
            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getStatusTone(qoeStatus)}`}>
              {qoeStatus}
            </span>
          </div>
          <p className="text-slate-300">Streaming quality degradation detected across the active telemetry stream.</p>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-sm text-slate-400">{anomalyCount} anomalies detected</span>
            <button
              type="button"
              onClick={() => navigate('/incident')}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 transition hover:bg-cyan-500/20"
            >
              VIEW INCIDENT <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function IncidentExplorerPage({ result }: { result: SimulationResponse | null }) {
  const navigate = useNavigate();
  const latestQoe = getLatestQoe(result);
  const telemetry = result?.telemetry ?? [];
  const start = telemetry[0]?.timestamp ?? new Date().toISOString();
  const end = telemetry[telemetry.length - 1]?.timestamp ?? new Date().toISOString();

  const timelineEntries = useMemo(() => {
    const entries = [
      { time: start, label: 'Telemetry stream started' },
      ...(result?.anomalies ?? []).map((item) => ({
        time: item.timestamp,
        label: `${humanizeAnomaly(item.type)} detected`,
      })),
      { time: end, label: `QoE status: ${latestQoe?.status ?? result?.qoe.summary.status ?? 'Unknown'}` },
    ];
    return entries.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [end, latestQoe, result, start]);

  const evidenceItems = useMemo(() => {
    if (!result) return [];
    return result.anomalies.slice(0, 4).map((anomaly) => ({
      label: humanizeAnomaly(anomaly.type),
      baseline: anomaly.baseline,
      observed: anomaly.observed,
      change: anomaly.change_percent,
      metric: anomaly.metric,
    }));
  }, [result]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-amber-400">Incident Explorer</div>
            <h2 className="mt-2 text-3xl font-semibold text-white">INCIDENT #{result ? result.scenario.toUpperCase().slice(0, 4) : 'LIVE'}</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
          >
            Overview
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Scenario</div>
            <div className="mt-2 text-lg font-medium text-white">{result ? result.scenario.replace(/_/g, ' ') : 'Loading'}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">QoE</div>
            <div className="mt-2 text-lg font-medium text-white">{latestQoe ? formatNumber(latestQoe.qoe_score, 1) : '—'}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Status</div>
            <div className="mt-2 text-lg font-medium text-white">{latestQoe?.status ?? '—'}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Duration</div>
            <div className="mt-2 text-lg font-medium text-white">{getIncidentDuration(start, end)}</div>
          </div>
        </div>
      </div>

      {result ? (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow">
            <h3 className="mb-4 text-lg font-semibold text-white">Incident Timeline</h3>
            <div className="space-y-4">
              {timelineEntries.map((entry, index) => (
                <div key={`${entry.time}-${index}`} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="h-3 w-3 rounded-full border border-cyan-400 bg-cyan-500/40" />
                    {index !== timelineEntries.length - 1 ? <div className="mt-1 h-full w-px bg-slate-700" /> : null}
                  </div>
                  <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{formatTimestamp(entry.time)}</div>
                    <div className="mt-2 text-sm text-white">{entry.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow">
            <h3 className="mb-4 text-lg font-semibold text-white">Evidence</h3>
            <div className="space-y-4">
              {evidenceItems.length > 0 ? (
                evidenceItems.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex items-center justify-between gap-4 text-sm text-slate-300">
                      <span className="font-medium text-white">{item.label}</span>
                      <span>{formatNumber(item.baseline, 1)} → {formatNumber(item.observed, 1)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                      <span>{item.metric}</span>
                      <span>{item.change > 0 ? '↑' : '↓'} {formatSignedPercent(item.change)}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{ width: `${Math.min(100, Math.abs(item.change) / 2)}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-emerald-700/30 bg-emerald-500/5 p-4 text-sm text-emerald-200">
                  No evidence available for this scenario.
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow">
              <h3 className="mb-4 text-lg font-semibold text-white">Root Cause Analysis</h3>
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-5 text-sm text-slate-300">
                <p className="text-base font-medium text-white">Awaiting root-cause analysis...</p>
                <p className="mt-3">This section will consume the future root-cause payload including cause, confidence, evidence, and contributing signals.</p>
                <div className="mt-4 space-y-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  <div>root_cause</div>
                  <div>confidence</div>
                  <div>evidence</div>
                  <div>contributing_signals</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow">
              <h3 className="mb-4 text-lg font-semibold text-white">AI Incident Explanation</h3>
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-5 text-sm text-slate-300">
                <p className="text-base font-medium text-white">Awaiting Qualcomm / Cirrascale inference...</p>
                <p className="mt-3">What happened? Why did it happen? Likely cause and confidence. Recommended checks will appear here once the backend explanation API is connected.</p>
                <div className="mt-4 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                  AI Explanation • Powered by Qualcomm / Cirrascale AI
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center text-slate-400">
          No incident data loaded yet.
        </div>
      )}
    </div>
  );
}

function AnalyticsPage({ scenarioAnalytics, loading }: { scenarioAnalytics: ScenarioAnalyticsSummary[]; loading: boolean }) {
  const barData = scenarioAnalytics.map((entry) => ({
    name: entry.label,
    avg_qoe: Number(entry.avg_qoe),
  }));

  const matrixRows = scenarioAnalytics.map((entry) => ({
    scenario: entry.label,
    bitrate: entry.anomalyTypes.includes('BITRATE_DROP') ? '✓' : '—',
    buffer: entry.anomalyTypes.includes('BUFFERING_SPIKE') ? '✓' : '—',
    latency: entry.anomalyTypes.includes('LATENCY_SPIKE') ? '✓' : '—',
    loss: entry.anomalyTypes.includes('PACKET_LOSS_SPIKE') ? '✓' : '—',
    crash: entry.anomalyTypes.includes('CRASH_SPIKE') ? '✓' : '—',
  }));

  const columns = [
    { key: 'bitrate', label: 'Bitrate' },
    { key: 'buffer', label: 'Buffer' },
    { key: 'latency', label: 'Latency' },
    { key: 'loss', label: 'Loss' },
    { key: 'crash', label: 'Crash' },
  ] as const;

  if (loading) {
    return <LoadingState message="Loading all scenarios for analytics..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-400">Analytics</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Scenario Analytics</h2>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow">
        <h3 className="mb-4 text-lg font-semibold text-white">Scenario Comparison</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                <th className="pb-3 pr-4">Scenario</th>
                <th className="pb-3 pr-4">Avg QoE</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Alerts</th>
              </tr>
            </thead>
            <tbody>
              {scenarioAnalytics.map((entry) => (
                <tr key={entry.scenario} className="border-b border-slate-800/80">
                  <td className="py-3 pr-4 font-medium text-white">{entry.label}</td>
                  <td className="py-3 pr-4">{formatNumber(entry.avg_qoe, 1)}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getStatusTone(entry.status)}`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4">{entry.alerts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow">
          <h3 className="mb-4 text-lg font-semibold text-white">QoE By Scenario</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                <YAxis stroke="#94a3b8" domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="avg_qoe" fill="#22d3ee" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow">
          <h3 className="mb-4 text-lg font-semibold text-white">Anomaly Comparison</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-300">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  <th className="pb-3 pr-4">Scenario</th>
                  {columns.map((column) => (
                    <th key={column.key} className="pb-3 pr-4">{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row) => (
                  <tr key={row.scenario} className="border-b border-slate-800/80">
                    <td className="py-3 pr-4 font-medium text-white">{row.scenario}</td>
                    {columns.map((column) => (
                      <td key={`${row.scenario}-${column.key}`} className="py-3 pr-4">
                        {row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioName>('healthy');
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [scenarioAnalytics, setScenarioAnalytics] = useState<ScenarioAnalyticsSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadScenario = async (scenario: ScenarioName = selectedScenario) => {
    setLoading(true);
    setError(null);
    try {
      const nextResult = await fetchScenarioSimulation(scenario);
      setResult(nextResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect to the telemetry engine.');
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const analytics = await fetchScenarioAnalytics();
      setScenarioAnalytics(analytics);
    } catch (err) {
      console.error('Unable to load analytics', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    void loadScenario('healthy');
    void loadAnalytics();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <DashboardHeader
          selectedScenario={selectedScenario}
          onScenarioChange={(scenario) => setSelectedScenario(scenario)}
          onSimulate={() => void loadScenario(selectedScenario)}
        />

        <main className="mt-6">
          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ShieldAlert className="h-4 w-4" />
                Backend unavailable
              </div>
              <p>Unable to connect to telemetry engine.</p>
              <button
                type="button"
                onClick={() => void loadScenario(selectedScenario)}
                className="mt-4 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100"
              >
                Retry
              </button>
            </div>
          ) : null}

          {!error ? (
            <Routes>
              <Route path="/" element={<OverviewPage result={result} onRefresh={() => void loadScenario(selectedScenario)} />} />
              <Route path="/incident" element={<IncidentExplorerPage result={result} />} />
              <Route path="/incidents" element={<IncidentExplorerPage result={result} />} />
              <Route path="/analytics" element={<AnalyticsPage scenarioAnalytics={scenarioAnalytics} loading={analyticsLoading} />} />
            </Routes>
          ) : null}

          {loading && !error ? <LoadingState message="Simulating incident... Analyzing telemetry..." /> : null}
        </main>
      </div>
    </div>
  );
}
