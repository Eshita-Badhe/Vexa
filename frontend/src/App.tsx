import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Route, Routes, useNavigate, Navigate } from "react-router-dom";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  ChevronDown,
  CheckCircle2,
  CircleDot,
  Clock3,
  Cpu,
  Gauge,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  Signal,
  Sparkles,
  TriangleAlert,
  Wifi,
  XCircle,
  Zap,
  Network,
  ShieldCheck,
  X
} from "lucide-react";

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
} from "recharts";

import {
  fetchScenarioAnalytics,
  fetchScenarioSimulation,
  askIncidentQuestion,
  SCENARIO_OPTIONS,
} from "./api";

/* =========================================================
   NAVIGATION
========================================================= */

const navItems = [
  {
    to: "/overview",
    label: "Overview",
    icon: Gauge,
  },
  {
    to: "/incident",
    label: "Incident Explorer",
    icon: ShieldAlert,
  },
  {
    to: "/analytics",
    label: "Analytics",
    icon: BarChart3,
  },
];

/* =========================================================
   HELPERS
========================================================= */

function formatNumber(
  value: unknown,
  digits = 2
): string {
  const n = Number(value);

  return Number.isFinite(n)
    ? n.toFixed(digits)
    : "—";
}

function formatSignedPercent(
  value: unknown
): string {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  if (n === 0) {
    return "0%";
  }

  return `${n > 0 ? "+" : "-"}${Math.abs(n).toFixed(0)}%`;
}

function calculateTrend(
  current: unknown,
  baseline: unknown
): number {
  const a = Number(current);
  const b = Number(baseline);

  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    b === 0
  ) {
    return 0;
  }

  return ((a - b) / b) * 100;
}

function humanize(value = ""): string {
  return String(value)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) =>
      m.toUpperCase()
    );
}

function formatTimestamp(
  value: unknown
): string {
  if (!value) {
    return "—";
  }

  try {
    return new Date(
      String(value)
    ).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatDuration(
  start: unknown,
  end: unknown
): string {
  if (!start || !end) {
    return "—";
  }

  const ms = Math.max(
    0,
    new Date(String(end)).getTime() -
      new Date(String(start)).getTime()
  );

  const seconds = Math.max(
    1,
    Math.round(ms / 1000)
  );

  const minutes = Math.floor(
    seconds / 60
  );

  const remaining =
    seconds % 60;

  return `${minutes ? `${minutes}m ` : ""}${remaining}s`;
}

/* =========================================================
   RESULT HELPERS
========================================================= */

function getLatestTelemetry(
  result: any
) {
  return result?.telemetry?.length
    ? result.telemetry[
        result.telemetry.length - 1
      ]
    : null;
}

function getLatestQoe(
  result: any
) {
  return result?.qoe?.results?.length
    ? result.qoe.results[
        result.qoe.results.length - 1
      ]
    : null;
}

/* =========================================================
   STATUS
========================================================= */

function getStatusConfig(
  status: string
) {
  if (status === "Healthy") {
    return {
      label: "HEALTHY",
      text: "text-emerald-300",
      border:
        "border-emerald-400/20",
      bg:
        "bg-emerald-400/[0.06]",
      dot: "bg-emerald-400",
      icon: CheckCircle2,
    };
  }

  if (status === "Degraded") {
    return {
      label: "DEGRADED",
      text: "text-amber-300",
      border:
        "border-amber-400/20",
      bg:
        "bg-amber-400/[0.06]",
      dot: "bg-amber-400",
      icon: TriangleAlert,
    };
  }

  if (status === "Poor") {
    return {
      label: "CRITICAL",
      text: "text-red-300",
      border:
        "border-red-400/20",
      bg:
        "bg-red-400/[0.06]",
      dot: "bg-red-400",
      icon: ShieldAlert,
    };
  }

  return {
    label: "UNKNOWN",
    text: "text-slate-300",
    border: "border-slate-700",
    bg: "bg-slate-800/40",
    dot: "bg-slate-400",
    icon: CircleDot,
  };
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const config =
    getStatusConfig(status);

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-[0.18em] ${config.text} ${config.border} ${config.bg}`}
    >
      <Icon className="h-3.5 w-3.5" />

      {config.label}
    </span>
  );
}

/* =========================================================
   SEVERITY
========================================================= */

function getSeverityConfig(
  severity: string
) {
  if (severity === "CRITICAL") {
    return {
      text: "text-red-300",
      border:
        "border-red-400/20",
      bg:
        "bg-red-400/[0.06]",
      dot: "bg-red-400",
    };
  }

  if (severity === "WARNING") {
    return {
      text: "text-amber-300",
      border:
        "border-amber-400/20",
      bg:
        "bg-amber-400/[0.06]",
      dot: "bg-amber-400",
    };
  }

  return {
    text: "text-cyan-300",
    border:
      "border-cyan-400/20",
    bg:
      "bg-cyan-400/[0.06]",
    dot: "bg-cyan-400",
  };
}

/* =========================================================
   ROOT CAUSE
========================================================= */

function normalizeRootCause(result: any) {
  const raw = result?.root_cause;

  if (!raw) {
    return {
      cause: "No Root Cause Returned",
      confidence: 0,
      evidence: [],
      signals: [],
      explanation: "",
      alternatives: [],
    };
  }

  const primary = raw.primary || raw;

  const rawConfidence = Number(
    primary.confidence ??
      primary.confidence_score ??
      0
  );

  // Backend may return either:
  // 0.0 - 1.0
  // or
  // 0 - 100
  const confidence =
    rawConfidence <= 1
      ? rawConfidence * 100
      : rawConfidence;

  return {
    cause:
      primary.label ??
      primary.root_cause ??
      primary.cause ??
      primary.primary_cause ??
      "Unknown",

    confidence: Math.round(
      Math.max(
        0,
        Math.min(100, confidence)
      )
    ),

    evidence: Array.isArray(
      primary.evidence
    )
      ? primary.evidence
      : [],

    signals: Array.isArray(
      primary.contributing_signals
    )
      ? primary.contributing_signals
      : [],

    explanation:
      primary.explanation ??
      primary.reason ??
      raw.analysis_summary ??
      "",

    alternatives: Array.isArray(
      raw.alternatives
    )
      ? raw.alternatives
      : [],
  };
}

function getVerificationConfig(
  status: string
) {
  switch (status) {
    case "VERIFIED":
      return {
        label: "DETECTION VERIFIED",
        text: "text-emerald-300",
        border: "border-emerald-400/20",
        bg: "bg-emerald-400/[0.06]",
        dot: "bg-emerald-400",
        icon: CheckCircle2,
      };

    case "PARTIALLY_VERIFIED":
      return {
        label: "PARTIALLY VERIFIED",
        text: "text-amber-300",
        border: "border-amber-400/20",
        bg: "bg-amber-400/[0.06]",
        dot: "bg-amber-400",
        icon: AlertTriangle,
      };

    case "NOT_VERIFIED":
      return {
        label: "NOT VERIFIED",
        text: "text-red-300",
        border: "border-red-400/20",
        bg: "bg-red-400/[0.06]",
        dot: "bg-red-400",
        icon: ShieldAlert,
      };

    default:
      return {
        label: "VERIFICATION PENDING",
        text: "text-slate-300",
        border: "border-slate-700",
        bg: "bg-slate-800/40",
        dot: "bg-slate-500",
        icon: CircleDot,
      };
  }
}

function getCauseIcon(
  cause = ""
) {
  const normalized =
    cause.toLowerCase();

  if (
    normalized.includes("network")
  ) {
    return Wifi;
  }

  if (
    normalized.includes("cdn")
  ) {
    return Server;
  }

  if (
    normalized.includes("server")
  ) {
    return Server;
  }

  if (
    normalized.includes(
      "application"
    )
  ) {
    return Cpu;
  }

  return CheckCircle2;
}

/* =========================================================
   RECOMMENDATIONS
========================================================= */

function getRecommendations(
  cause: string,
  anomalies: any[] = []
) {
  const name =
    cause.toLowerCase();

  const recommendations: string[] =
    [];

  if (
    name.includes("network")
  ) {
    recommendations.push(
      "Inspect regional latency and packet-loss trends.",
      "Check ISP / last-mile congestion and routing changes.",
      "Compare affected regions against healthy regions."
    );
  } else if (
    name.includes("cdn")
  ) {
    recommendations.push(
      "Check CDN edge health and cache-hit ratios.",
      "Compare affected CDN POPs and geographic regions.",
      "Inspect origin-to-edge latency and routing."
    );
  } else if (
    name.includes("server")
  ) {
    recommendations.push(
      "Inspect server CPU, memory and request saturation.",
      "Check backend error rates and queue depth.",
      "Compare overloaded instances with healthy instances."
    );
  } else if (
    name.includes(
      "application"
    )
  ) {
    recommendations.push(
      "Inspect crash logs and recent application releases.",
      "Compare failures by device, OS and app version.",
      "Check playback and startup error traces."
    );
  } else {
    recommendations.push(
      "Continue monitoring QoE and anomaly trends.",
      "Validate that no regional degradation is emerging.",
      "Keep the current telemetry baseline for comparison."
    );
  }

  if (
    anomalies.some(
      (a) =>
        String(a.type).includes(
          "BUFFERING"
        )
    )
  ) {
    recommendations.push(
      "Review buffering spikes against bitrate and latency."
    );
  }

  return [
    ...new Set(
      recommendations
    ),
  ].slice(0, 4);
}

/* =========================================================
   SECTION TITLE
========================================================= */

function SectionTitle({
  eyebrow,
  title,
  icon: Icon = Activity,
  action,
}: {
  eyebrow: string;
  title: string;
  icon?: any;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.28em] text-cyan-400">
          <Icon className="h-3.5 w-3.5" />
          {eyebrow}
        </div>

        <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-white">
          {title}
        </h3>
      </div>

      {action}
    </div>
  );
}

/* =========================================================
   LOADING
========================================================= */

function LoadingState({ message = "Analyzing telemetry..." }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-400/10 bg-slate-900/70 p-8 shadow-glow">

      {/* animated scanning line */}
      <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
        <div className="h-full w-1/3 animate-[loading-scan_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
      </div>

      <div className="flex flex-col items-center justify-center py-10 text-center">

        {/* spinner */}
        <div className="relative flex h-16 w-16 items-center justify-center">

          <div className="absolute inset-0 rounded-full border border-cyan-400/10" />

          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-cyan-400 border-r-cyan-400/30" />

          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-400/[0.06]">
            <Activity className="h-5 w-5 animate-pulse text-cyan-300" />
          </div>

        </div>

        {/* text */}
        <div className="mt-5">

          <div className="text-sm font-semibold text-white">
            {message}
          </div>

          <p className="mt-2 text-xs text-slate-500">
            Processing telemetry signals and detecting anomalies
          </p>

        </div>

        {/* analysis steps */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">

          <div className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-1.5 text-[9px] uppercase tracking-wider text-cyan-300">
            Telemetry
          </div>

          <ArrowRight className="h-3 w-3 text-slate-700" />

          <div className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-1.5 text-[9px] uppercase tracking-wider text-cyan-300">
            QoE
          </div>

          <ArrowRight className="h-3 w-3 text-slate-700" />

          <div className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-1.5 text-[9px] uppercase tracking-wider text-cyan-300">
            Anomalies
          </div>

          <ArrowRight className="h-3 w-3 text-slate-700" />

          <div className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-1.5 text-[9px] uppercase tracking-wider text-cyan-300">
            Root Cause
          </div>

        </div>

      </div>
    </div>
  );
}

/* =========================================================
   METRIC CARD
========================================================= */

function MetricCard({
  title,
  value,
  detail,
  change,
  tone = "cyan",
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  change?: string;
  tone?: string;
  icon: any;
}) {
  const toneMap: Record<
    string,
    [string, string]
  > = {
    cyan: [
      "text-cyan-300",
      "bg-cyan-400",
    ],
    emerald: [
      "text-emerald-300",
      "bg-emerald-400",
    ],
    amber: [
      "text-amber-300",
      "bg-amber-400",
    ],
    violet: [
      "text-violet-300",
      "bg-violet-400",
    ],
    red: [
      "text-red-300",
      "bg-red-400",
    ],
    sky: [
      "text-sky-300",
      "bg-sky-400",
    ],
  };

  const [
    text,
    dot,
  ] =
    toneMap[tone] ||
    toneMap.cyan;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 shadow-glow backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:border-slate-700">
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-400/[0.025] blur-3xl transition group-hover:bg-cyan-400/[0.06]" />

      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon
              className={`h-3.5 w-3.5 ${text}`}
            />

            <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {title}
            </span>
          </div>

          <span
            className={`h-1.5 w-1.5 rounded-full ${dot}`}
          />
        </div>

        <div className="mt-5 flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">
              {value}
            </div>

            <div className="mt-1 text-[10px] text-slate-500">
              {detail}
            </div>
          </div>

          {change ? (
            <span className="rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1 text-[9px] font-semibold text-slate-300">
              {change}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DashboardHeader({
  selectedScenario,
  selectedScenarios,
  onScenarioChange,
  onScenarioToggle,
  onSimulate,
  loading,
}: {
  selectedScenario: string;
  selectedScenarios: string[];
  onScenarioChange: (scenario: string) => void;
  onScenarioToggle: (scenario: string) => void;
  onSimulate: () => void;
  loading: boolean;
}) {
  const navigate = useNavigate();

  const dashboardNav = [
    {
      to: "/overview",
      label: "Overview",
      icon: Gauge,
    },
    {
      to: "/incident",
      label: "Incident Explorer",
      icon: ShieldAlert,
    },
    {
      to: "/analytics",
      label: "Analytics",
      icon: BarChart3,
    },
  ];

  return (
    <header className="signal-panel relative overflow-hidden px-5 py-4 sm:px-6 sm:py-5">

      {/* =====================================================
          BACKGROUND GLOWS
      ===================================================== */}

      <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-cyan-400/[0.05] blur-3xl" />

      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-orange-400/[0.04] blur-3xl" />


      {/* =====================================================
          TOP ROW
      ===================================================== */}

      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">

        {/* =================================================
            BRAND
        ================================================= */}

        <div className="flex items-center gap-4">

          <button
            type="button"
            onClick={() => navigate("/")}
            className="group flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] transition hover:border-cyan-400/40 hover:bg-cyan-400/[0.09]"
            title="Back to VEXA"
          >
            <Activity className="h-6 w-6 text-cyan-300 transition group-hover:scale-110" />
          </button>


          <div>

            <div className="flex items-center gap-3">

              <h1 className="text-lg font-bold tracking-[0.18em] text-white sm:text-xl">
                VEXA
              </h1>

              <span className="hidden rounded-full border border-orange-400/20 bg-orange-400/[0.05] px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.18em] text-orange-300 sm:inline-flex">
                AI Streaming Intelligence
              </span>

            </div>


            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Media Stream Quality Detective
            </p>

          </div>

        </div>


        {/* =================================================
            RIGHT CONTROLS
        ================================================= */}

{/* CONTROLS */}
<div className="flex flex-col gap-2 sm:flex-row sm:items-start">

  {/* SCENARIO CONTROL */}
  <div className="relative">

    <div className="flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-950/80 px-3 py-2.5">

      <Signal className="h-4 w-4 shrink-0 text-cyan-400" />

      <div className="min-w-[190px]">

        <div className="text-[8px] uppercase tracking-[0.2em] text-slate-600">
          Detection Scenario
        </div>

        <select
          value={selectedScenario}
          onChange={(event) =>
            onScenarioChange(event.target.value)
          }
          disabled={loading}
          className="mt-0.5 w-full cursor-pointer bg-transparent text-sm font-semibold text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {SCENARIO_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              className="bg-slate-950 text-white"
            >
              {option.label}
            </option>
          ))}
        </select>

      </div>

    </div>


    {/* FLOATING MULTI-FACTOR PANEL */}
    {selectedScenario === "multi_factor" && (
      <div className="absolute right-0 top-full z-50 mt-2 w-[285px] rounded-xl border border-cyan-400/10 bg-[#080d14]/[0.98] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl">

        {/* PANEL HEADER */}
        <div className="mb-2 flex items-center justify-between">

          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Incident Factors
            </div>

            <div className="mt-0.5 text-[9px] text-slate-600">
              Select 2–3 contributing signals
            </div>
          </div>

          <span className="rounded-md border border-cyan-400/15 bg-cyan-400/[0.05] px-2 py-1 text-[9px] font-semibold text-cyan-300">
            {selectedScenarios.length}/3
          </span>

        </div>


        {/* FACTORS */}
        <div className="grid grid-cols-2 gap-1.5">

          {SCENARIO_OPTIONS
            .filter(
              (option) =>
                option.value !== "healthy" &&
                option.value !== "multi_factor"
            )
            .map((option) => {

              const checked =
                selectedScenarios.includes(option.value);

              const disabled =
                !checked &&
                selectedScenarios.length >= 3;

              return (
                <label
                  key={option.value}
                  className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 transition ${
                    checked
                      ? "border-cyan-400/15 bg-cyan-400/[0.05]"
                      : "border-slate-800/80 bg-slate-950/40"
                  } ${
                    disabled
                      ? "cursor-not-allowed opacity-35"
                      : "cursor-pointer hover:border-slate-700 hover:bg-slate-900"
                  }`}
                >

                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={loading || disabled}
                    onChange={() =>
                      onScenarioToggle(option.value)
                    }
                    className="h-3.5 w-3.5 shrink-0 accent-cyan-400"
                  />

                  <span className="truncate text-[9px] font-medium text-slate-300">
                    {option.label}
                  </span>

                </label>
              );
            })}

        </div>


        {/* SELECTION STATUS */}
        <div className="mt-2 border-t border-slate-800/70 pt-2">

          {selectedScenarios.length < 2 ? (
            <div className="text-[9px] text-amber-300">
              Select at least 2 factors to simulate.
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[9px] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Multi-factor configuration ready
            </div>
          )}

        </div>

      </div>
    )}

  </div>


  {/* SIMULATE BUTTON */}
  <button
    type="button"
    onClick={onSimulate}
    disabled={
      loading ||
      (
        selectedScenario === "multi_factor" &&
        selectedScenarios.length < 2
      )
    }
    className="group inline-flex h-[50px] items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 text-xs font-bold tracking-wide text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
  >
    <Zap className="h-4 w-4 transition group-hover:rotate-12" />

    {loading
      ? "RUNNING..."
      : "SIMULATE INCIDENT"}

    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
  </button>

</div>
      </div>


      {/* =====================================================
          PAGE NAVIGATION
      ===================================================== */}

      <nav className="relative mt-5 flex flex-wrap items-center gap-2 border-t border-slate-800/60 pt-3">

        {dashboardNav.map((item) => {

          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  isActive
                    ? item.to === "/incident"
                      ? "border border-orange-400/20 bg-orange-400/[0.07] text-orange-300 shadow-[0_0_18px_rgba(245,158,11,0.06)]"
                      : "border border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.06)]"
                    : "border border-transparent text-slate-500 hover:bg-slate-900/70 hover:text-white"
                }`
              }
            >

              <Icon className="h-3.5 w-3.5" />

              {item.label}

            </NavLink>
          );

        })}

      </nav>


      {/* =====================================================
          STATUS STRIP
      ===================================================== */}

      <div className="relative mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-800/40 pt-3">

        {/* Telemetry */}
        <div className="flex items-center gap-2">

          <span className="live-dot" />

          <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Telemetry Engine Online
          </span>

        </div>


        {/* Divider */}
        <span className="hidden h-3 w-px bg-slate-800 sm:block" />


        {/* Simulation */}
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Real-Time Simulation
        </span>


        {/* Divider */}
        <span className="hidden h-3 w-px bg-slate-800 sm:block" />


        {/* AI */}
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-orange-300">
          AI Ready
        </span>

      </div>

    </header>
  );
}

/* =========================================================
   QOE HERO
========================================================= */

function QoeHero({
  result,
  qoeValue,
  qoeStatus,
  anomalyCount,
  criticalCount,
}: {
  result: any;
  qoeValue: number;
  qoeStatus: string;
  anomalyCount: number;
  criticalCount: number;
}) {
  const healthy =
    qoeStatus === "Healthy";

  const config =
    getStatusConfig(qoeStatus);

  const scenario =
    humanize(
      result?.scenario ||
        "live"
    );

  const score = Math.max(
    0,
    Math.min(
      100,
      Number(qoeValue) || 0
    )
  );

  return (
    <div className="signal-panel relative overflow-hidden p-5 sm:p-7">
      {/* Decorative rings */}
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full border border-cyan-400/[0.04]" />

      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border border-cyan-400/[0.05]" />

      <div className="relative grid gap-7 xl:grid-cols-[1fr_390px] xl:items-center">
        {/* SCORE */}
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-cyan-400" />

            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-cyan-400">
              Stream Health
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-end gap-4">
            <div>
              <div className="text-6xl font-semibold tracking-[-0.08em] text-white sm:text-7xl">
                {formatNumber(
                  qoeValue,
                  1
                )}
              </div>

              <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-600">
                Composite QoE score
              </div>
            </div>

            <StatusBadge
              status={qoeStatus}
            />
          </div>

          {/* QoE PROGRESS */}
          <div className="mt-6 h-2.5 max-w-2xl overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                healthy
                  ? "bg-emerald-400"
                  : qoeStatus ===
                    "Degraded"
                  ? "bg-amber-400"
                  : "bg-red-400"
              }`}
              style={{
                width: `${score}%`,
              }}
            />
          </div>

          <div className="mt-3 flex max-w-2xl justify-between text-[8px] uppercase tracking-[0.18em] text-slate-600">
            <span>0 critical</span>
            <span>60 degraded</span>
            <span>80 healthy</span>
            <span>100 optimal</span>
          </div>
        </div>

        {/* STATUS PANEL */}
        <div
          className={`rounded-2xl border p-5 ${
            healthy
              ? "healthy-glow border-emerald-400/15 bg-emerald-400/[0.025]"
              : "incident-glow border-red-400/15 bg-red-400/[0.025]"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${config.dot}`}
              />

              <span
                className={`text-[10px] font-bold uppercase tracking-[0.22em] ${config.text}`}
              >
                {healthy
                  ? "System Nominal"
                  : "Active Incident"}
              </span>
            </div>

            <span className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
              {scenario}
            </span>
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-400">
            {healthy
              ? "No active quality degradation detected across the current telemetry stream."
              : "Streaming quality degradation detected. Cross-signal analysis is available in Incident Explorer."}
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
                Signals
              </div>

              <div
                className={`mt-1.5 text-xl font-semibold ${
                  healthy
                    ? "text-emerald-300"
                    : "text-amber-300"
                }`}
              >
                {healthy
                  ? 0
                  : anomalyCount}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
                Critical
              </div>

              <div
                className={`mt-1.5 text-xl font-semibold ${
                  healthy
                    ? "text-emerald-300"
                    : "text-red-300"
                }`}
              >
                {healthy
                  ? 0
                  : criticalCount}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
                Status
              </div>

              <div
                className={`mt-1.5 text-xl font-semibold ${config.text}`}
              >
                {healthy
                  ? "OK"
                  : "ALERT"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ACTIVE SIGNALS
========================================================= */

function ActiveSignals({
  anomalies,
  healthy,
}: {
  anomalies: any[];
  healthy: boolean;
}) {
  return (
    <div className="signal-panel p-5">
      <SectionTitle
        eyebrow="Telemetry Intelligence"
        title="Active Signals"
        icon={Activity}
      />

      <div className="mt-5 space-y-2.5">
        {healthy ||
        anomalies.length === 0 ? (
          <div className="healthy-glow rounded-xl border border-emerald-400/15 bg-emerald-400/[0.025] p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />

              <div>
                <div className="text-sm font-medium text-white">
                  No active anomalies
                </div>

                <div className="mt-1 text-[10px] text-slate-500">
                  Telemetry remains within expected thresholds.
                </div>
              </div>
            </div>
          </div>
        ) : (
          anomalies
            .slice(0, 6)
            .map(
              (anomaly) => {
                const severity =
                  getSeverityConfig(
                    anomaly.severity
                  );

                const confidence =
                  Math.max(
                    0,
                    Math.min(
                      100,
                      Number(
                        anomaly.confidence ||
                          0
                      ) * 100
                    )
                  );

                return (
                  <div
                    key={
                      anomaly.anomaly_id
                    }
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 transition hover:border-slate-700 hover:bg-slate-950/80"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${severity.dot}`}
                        />

                        <span className="truncate text-xs font-semibold text-white">
                          {humanize(
                            anomaly.type
                          )}
                        </span>
                      </div>

                      <span
                        className={`rounded-full border px-2 py-1 text-[8px] font-bold tracking-[0.15em] ${severity.text} ${severity.border} ${severity.bg}`}
                      >
                        {
                          anomaly.severity
                        }
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
                      <span>
                        {formatNumber(
                          anomaly.baseline,
                          1
                        )}{" "}
                        →{" "}
                        {formatNumber(
                          anomaly.observed,
                          1
                        )}{" "}
                        {anomaly.metric}
                      </span>

                      <span>
                        {Math.round(
                          confidence
                        )}
                        %
                      </span>
                    </div>

                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full ${severity.dot}`}
                        style={{
                          width: `${confidence}%`,
                        }}
                      />
                    </div>

                    {anomaly
                      .evidence_summary
                      ?.length ? (
                      <div className="mt-2 text-[9px] leading-4 text-slate-600">
                        {
                          anomaly
                            .evidence_summary[0]
                        }
                      </div>
                    ) : null}
                  </div>
                );
              }
            )
        )}
      </div>
    </div>
  );
}

function DashboardLayout({
  children,
  selectedScenario,
  selectedScenarios,
  onScenarioChange,
  onScenarioToggle,
  onSimulate,
  loading,
}: {
  children: React.ReactNode;
  selectedScenario: string;
  selectedScenarios: string[];
  onScenarioChange: (
    scenario: string
  ) => void;
  onScenarioToggle: (
    scenario: string
  ) => void;
  onSimulate: () => void;
  loading: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#05080d] text-slate-200">

      <div className="relative z-10 mx-auto max-w-[1500px] px-3 py-4 sm:px-5 sm:py-6 lg:px-8">

        <DashboardHeader
          selectedScenario={
            selectedScenario
          }

          selectedScenarios={
            selectedScenarios
          }

          onScenarioChange={
            onScenarioChange
          }

          onScenarioToggle={
            onScenarioToggle
          }

          onSimulate={
            onSimulate
          }

          loading={loading}
        />

        <main className="mt-5">
          {children}
        </main>

      </div>

    </div>
  );
}

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen overflow-hidden bg-[#05080d] text-white">

      {/* Background atmosphere */}
      <div className="pointer-events-none fixed inset-0">

        <div className="absolute left-[-10%] top-[-20%] h-[600px] w-[600px] rounded-full bg-cyan-500/[0.08] blur-[120px]" />

        <div className="absolute right-[-10%] bottom-[-20%] h-[600px] w-[600px] rounded-full bg-orange-500/[0.07] blur-[120px]" />

      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col px-5 py-5 sm:px-8 lg:px-12">

        {/* TOP BRAND BAR */}
<div className="flex items-center justify-between">

  <div className="flex items-center gap-3">

    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06]">
      <Activity className="h-5 w-5 text-cyan-300" />
    </div>

    <div>
      <div className="text-lg font-bold tracking-[0.28em] text-cyan-300">
        VEXA
      </div>

      <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        Media Stream Intelligence Platform
      </div>
    </div>

  </div>


  <div className="flex items-center gap-2">

    <span className="live-dot" />

    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
      SYSTEM ONLINE
    </span>

  </div>

</div>


        {/* HERO */}
        <main className="flex flex-1 items-center py-10">

          <div className="grid w-full items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">

            {/* LEFT */}
            <div>

              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/[0.05] px-3 py-1.5">

                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />

                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-300">
                  AI Streaming Intelligence
                </span>

              </div>


              <h1 className="max-w-5xl text-5xl font-bold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl xl:text-[82px]">

                Detect.
                <span className="text-cyan-300">
                  {" "}Diagnose.
                </span>

                <br />

                Understand every{" "}

                <span className="text-orange-300">
                  stream.
                </span>

              </h1>


              <p className="mt-7 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">

                VEXA is an intelligent media-stream observability
                platform that detects quality degradation,
                correlates streaming signals, identifies likely
                root causes, and turns complex telemetry into
                actionable incident intelligence.

              </p>


              {/* CTA */}
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">

                <button
                  type="button"
                  onClick={() => navigate("/overview")}
                  className="group inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-7 py-4 text-sm font-bold text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.12)] transition hover:-translate-y-1 hover:bg-cyan-300"
                >

                  EXPLORE ANALYSIS

                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />

                </button>


                <button
                  type="button"
                  onClick={() => {
                    document
                      .getElementById("how-it-works")
                      ?.scrollIntoView({
                        behavior: "smooth",
                      });
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-orange-400/20 bg-orange-400/[0.04] px-7 py-4 text-sm font-semibold text-orange-200 transition hover:border-orange-400/40 hover:bg-orange-400/[0.08]"
                >
                  HOW VEXA WORKS
                </button>

              </div>


              {/* Status row */}
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">

                <div className="flex items-center gap-2">
                  <span className="live-dot" />

                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                    Telemetry Engine Online
                  </span>
                </div>

                <span className="hidden h-4 w-px bg-slate-800 sm:block" />

                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Real-Time Simulation
                </span>

                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-300">
                  AI Ready
                </span>

              </div>

            </div>


            {/* RIGHT — VEXA CORE */}
            <div className="flex justify-center lg:justify-end">

              <div className="vexa-orbit">

                <div className="vexa-orbit-ring vexa-orbit-ring-one" />
                <div className="vexa-orbit-ring vexa-orbit-ring-two" />


                <div className="vexa-core">

                  <BrainCircuit className="h-10 w-10 text-cyan-300" />

                  <div className="mt-3 text-sm font-bold tracking-[0.3em] text-white">
                    VEXA
                  </div>

                  <div className="mt-1 text-[9px] uppercase tracking-[0.2em] text-cyan-400">
                    Intelligence Core
                  </div>

                </div>


                <div className="vexa-node vexa-node-top">
                  <Activity className="h-4 w-4" />
                  TELEMETRY
                </div>


                <div className="vexa-node vexa-node-right">
                  <Network className="h-4 w-4" />
                  CORRELATION
                </div>


                <div className="vexa-node vexa-node-bottom">
                  <ShieldCheck className="h-4 w-4" />
                  ROOT CAUSE
                </div>


                <div className="vexa-node vexa-node-left">
                  <Zap className="h-4 w-4" />
                  QOE
                </div>

              </div>

            </div>

          </div>

        </main>


        {/* HOW IT WORKS */}
        <section
          id="how-it-works"
          className="border-t border-slate-800/70 py-12"
        >

          <div className="grid gap-5 md:grid-cols-4">

            {[
              {
                icon: Activity,
                title: "Telemetry",
                text: "Collect streaming performance signals.",
              },
              {
                icon: Gauge,
                title: "QoE Analysis",
                text: "Measure the viewer experience.",
              },
              {
                icon: Network,
                title: "Correlation",
                text: "Connect abnormal signals.",
              },
              {
                icon: BrainCircuit,
                title: "Intelligence",
                text: "Explain the likely root cause.",
              },
            ].map((item, index) => {

              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5"
                >

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05]">
                    <Icon className="h-5 w-5 text-cyan-300" />
                  </div>

                  <div className="mt-4 text-sm font-bold text-white">
                    0{index + 1} — {item.title}
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {item.text}
                  </p>

                </div>
              );

            })}

          </div>

        </section>

      </div>

    </div>
  );
}

/* =========================================================
   OVERVIEW PAGE
========================================================= */

function OverviewPage({
  result,
  onRefresh,
}: {
  result: any;
  onRefresh: () => void;
}) {
  const navigate =
    useNavigate();

  const latestQoe =
    getLatestQoe(result);

  const latestTelemetry =
    getLatestTelemetry(result);

  const qoeStatus =
    latestQoe?.status ||
    result?.qoe?.summary
      ?.status ||
    "Unknown";

  const qoeValue =
    latestQoe?.qoe_score ??
    result?.summary
      ?.average_qoe ??
    0;

  const healthy =
    qoeStatus === "Healthy";

  /*
   * IMPORTANT:
   * Healthy scenarios should not visually
   * report all generated anomalies as incidents.
   */
  const activeAnomalies =
    healthy
      ? []
      : result?.anomalies || [];

  const activeAlerts =
    healthy
      ? []
      : result?.alerts || [];

  const criticalCount =
    activeAnomalies.filter(
      (item: any) =>
        item.severity ===
        "CRITICAL"
    ).length;

  const rootCause =
    normalizeRootCause(
      result
    );

  const recommendations =
    getRecommendations(
      rootCause.cause,
      activeAnomalies
    );

  const baseline =
    result?.telemetry?.[0];

  /* =======================================================
     QOE SERIES
  ======================================================= */

  const qoeTrend =
    useMemo(
      () =>
        (
          result?.qoe
            ?.results || []
        ).map(
          (
            row: any,
            index: number
          ) => ({
            name: `P${index + 1}`,
            qoe: Number(
              row.qoe_score
            ),
          })
        ),
      [result]
    );

  /* =======================================================
     TELEMETRY SERIES
  ======================================================= */

  const telemetrySeries =
    useMemo(
      () =>
        (
          result?.telemetry ||
          []
        )
          .slice(-40)
          .map(
            (
              entry: any,
              index: number
            ) => ({
              name: `T${index + 1}`,
              bitrate:
                Number(
                  entry.bitrate
                ),
              latency:
                Number(
                  entry.latency
                ),
              buffering:
                Number(
                  entry.buffering_time
                ),
              packetLoss:
                Number(
                  entry.packet_loss
                ),
              jitter:
                Number(
                  entry.jitter
                ),
              serverLoad:
                Number(
                  entry.server_load ||
                    0
                ),
            })
          ),
      [result]
    );

  /* =======================================================
     METRIC CARDS
  ======================================================= */

  const metricCards = [
    {
      title: "Bitrate",
      value: latestTelemetry
        ? `${formatNumber(
            latestTelemetry.bitrate,
            1
          )} Mbps`
        : "—",
      detail:
        "Current stream rate",
      change:
        baseline &&
        latestTelemetry
          ? `${
              latestTelemetry.bitrate >=
              baseline.bitrate
                ? "↑"
                : "↓"
            } ${formatSignedPercent(
              calculateTrend(
                latestTelemetry.bitrate,
                baseline.bitrate
              )
            )}`
          : undefined,
      tone: "emerald",
      icon: Activity,
    },

    {
      title: "Buffering",
      value: latestTelemetry
        ? `${formatNumber(
            latestTelemetry.buffering_time,
            1
          )} sec`
        : "—",
      detail:
        "Playback interruption",
      change:
        baseline &&
        latestTelemetry
          ? `${
              latestTelemetry.buffering_time >=
              baseline.buffering_time
                ? "↑"
                : "↓"
            } ${formatSignedPercent(
              calculateTrend(
                latestTelemetry.buffering_time,
                baseline.buffering_time
              )
            )}`
          : undefined,
      tone: "amber",
      icon: Radio,
    },

    {
      title: "Latency",
      value: latestTelemetry
        ? `${formatNumber(
            latestTelemetry.latency,
            0
          )} ms`
        : "—",
      detail:
        "Network delay",
      change:
        baseline &&
        latestTelemetry
          ? `${
              latestTelemetry.latency >=
              baseline.latency
                ? "↑"
                : "↓"
            } ${formatSignedPercent(
              calculateTrend(
                latestTelemetry.latency,
                baseline.latency
              )
            )}`
          : undefined,
      tone: "violet",
      icon: Wifi,
    },

    {
      title: "Packet Loss",
      value: latestTelemetry
        ? `${formatNumber(
            latestTelemetry.packet_loss,
            1
          )}%`
        : "—",
      detail:
        "Network loss rate",
      change:
        baseline &&
        latestTelemetry
          ? `${
              latestTelemetry.packet_loss >=
              baseline.packet_loss
                ? "↑"
                : "↓"
            } ${formatSignedPercent(
              calculateTrend(
                latestTelemetry.packet_loss,
                baseline.packet_loss
              )
            )}`
          : undefined,
      tone: "red",
      icon: Signal,
    },

    {
      title: "Jitter",
      value: latestTelemetry
        ? `${formatNumber(
            latestTelemetry.jitter,
            1
          )} ms`
        : "—",
      detail:
        "Signal variation",
      change:
        baseline &&
        latestTelemetry
          ? `${
              latestTelemetry.jitter >=
              baseline.jitter
                ? "↑"
                : "↓"
            } ${formatSignedPercent(
              calculateTrend(
                latestTelemetry.jitter,
                baseline.jitter
              )
            )}`
          : undefined,
      tone: "sky",
      icon: Activity,
    },
  ];

  return (
    <div className="space-y-5">

      {/* =================================================
          QOE HERO
      ================================================= */}

      <QoeHero
        result={result}
        qoeValue={qoeValue}
        qoeStatus={qoeStatus}
        anomalyCount={
          activeAnomalies.length
        }
        criticalCount={
          criticalCount
        }
      />

      {/* =================================================
          KPI CARDS
      ================================================= */}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {metricCards.map(
          (card) => (
            <MetricCard
              key={card.title}
              {...card}
            />
          )
        )}
      </div>

      {/* =================================================
          QOE + ACTIVE SIGNALS
      ================================================= */}

      <div className="grid gap-5 xl:grid-cols-[1.55fr_0.8fr]">

        {/* QOE CHART */}
        <div className="signal-panel p-5">
          <SectionTitle
            eyebrow="Quality Telemetry"
            title="QoE Signal"
            icon={Activity}
            action={
              <span className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-slate-500">
                <span className="live-dot" />
                Live analysis
              </span>
            }
          />

          <div className="mt-5 h-72">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <LineChart
                data={qoeTrend}
              >
                <CartesianGrid
                  stroke="#18222e"
                  strokeDasharray="3 3"
                />

                <XAxis
                  dataKey="name"
                  stroke="#526273"
                  tick={{
                    fontSize: 9,
                  }}
                />

                <YAxis
                  stroke="#526273"
                  domain={[
                    0,
                    100,
                  ]}
                  tick={{
                    fontSize: 9,
                  }}
                />

                <Tooltip
                  contentStyle={{
                    background:
                      "#080d14",
                    border:
                      "1px solid rgba(148,163,184,0.15)",
                    borderRadius: 12,
                    color: "#fff",
                  }}
                />

                <Line
                  type="monotone"
                  dataKey="qoe"
                  stroke="#22d3ee"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "#22d3ee",
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex justify-between border-t border-slate-800/70 pt-3 text-[8px] uppercase tracking-[0.18em] text-slate-600">
            <span>
              0 critical
            </span>

            <span>
              {humanize(
                result?.scenario ||
                  "scenario"
              )}
            </span>

            <span>
              100 optimal
            </span>
          </div>
        </div>

        <ActiveSignals
          anomalies={
            activeAnomalies
          }
          healthy={healthy}
        />
      </div>

      {/* =================================================
          TELEMETRY TRENDS
      ================================================= */}

      <div className="signal-panel p-5">
        <SectionTitle
          eyebrow="Multi-Signal Monitoring"
          title="Telemetry Trends"
          icon={Signal}
          action={
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500 transition hover:border-slate-700 hover:text-cyan-300"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          }
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

          {[
            [
              "Bitrate",
              "bitrate",
              "Mbps",
              "#34d399",
            ],
            [
              "Latency",
              "latency",
              "ms",
              "#facc15",
            ],
            [
              "Buffering",
              "buffering",
              "sec",
              "#fb923c",
            ],
            [
              "Packet Loss",
              "packetLoss",
              "%",
              "#f87171",
            ],
          ].map(
            ([
              title,
              key,
              unit,
              stroke,
            ]) => {
              const latest =
                telemetrySeries.length
                  ? telemetrySeries[
                      telemetrySeries.length -
                        1
                    ][key]
                  : 0;

              return (
                <div
                  key={title}
                  className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                      {title}
                    </span>

                    <CircleDot
                      className="h-3 w-3"
                      style={{
                        color:
                          stroke,
                      }}
                    />
                  </div>

                  <div className="mt-2 text-xl font-semibold text-white">
                    {formatNumber(
                      latest,
                      1
                    )}

                    <span className="ml-1 text-[9px] font-normal uppercase tracking-wider text-slate-600">
                      {unit}
                    </span>
                  </div>

                  <div className="mt-3 h-20">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <LineChart
                        data={
                          telemetrySeries
                        }
                      >
                        <Line
                          type="monotone"
                          dataKey={key}
                          stroke={
                            stroke
                          }
                          strokeWidth={
                            2
                          }
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            }
          )}
        </div>
      </div>


      {/* =================================================
          ALERT ENGINE
      ================================================= */}

      <div className="signal-panel p-5">
        <SectionTitle
          eyebrow="Alert Engine"
          title="Active Alerts"
          icon={AlertTriangle}
          action={
            <span className="text-[9px] uppercase tracking-[0.18em] text-slate-600">
              {
                activeAlerts.length
              }{" "}
              alert
              {activeAlerts.length ===
              1
                ? ""
                : "s"}
            </span>
          }
        />

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {activeAlerts.length ? (
            activeAlerts
              .slice(0, 6)
              .map(
                (alert: any) => {
                  const severity =
                    getSeverityConfig(
                      alert.severity
                    );

                  return (
                    <div
                      key={alert.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/55 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${severity.dot}`}
                            />

                            <span className="text-xs font-semibold text-white">
                              {
                                alert.title
                              }
                            </span>
                          </div>

                          <p className="mt-2 text-[10px] leading-5 text-slate-500">
                            {
                              alert.description
                            }
                          </p>
                        </div>

                        <span
                          className={`rounded-full border px-2 py-1 text-[8px] font-bold ${severity.text} ${severity.border} ${severity.bg}`}
                        >
                          {
                            alert.severity
                          }
                        </span>
                      </div>

                      <div className="mt-3 border-t border-slate-800 pt-3 text-[9px] text-slate-600">
                        Impact:{" "}
                        <span className="text-slate-400">
                          {
                            alert.impact ||
                            "—"
                          }
                        </span>
                      </div>
                    </div>
                  );
                }
              )
          ) : (
            <div className="md:col-span-2 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.02] p-5 text-sm text-emerald-300">
              No active alerts. The alert engine reports a nominal state.
            </div>
          )}
        </div>
      </div>

      {/* =================================================
          INCIDENT CTA
      ================================================= */}

      <div
        className={`rounded-2xl border p-5 ${
          healthy
            ? "border-emerald-400/10 bg-emerald-400/[0.02]"
            : "border-red-400/15 bg-red-400/[0.025]"
        }`}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {healthy ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-300" />
            ) : (
              <ShieldAlert className="h-6 w-6 text-red-300" />
            )}

            <div>
              <div
                className={`text-[9px] font-bold uppercase tracking-[0.22em] ${
                  healthy
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {healthy
                  ? "System Nominal"
                  : "Incident Detected"}
              </div>

              <h3 className="mt-1 text-base font-semibold text-white">
                {healthy
                  ? "Streaming system operating normally"
                  : "Streaming quality requires investigation"}
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                {healthy
                  ? "No active incidents require investigation."
                  : `${activeAnomalies.length} signals and ${activeAlerts.length} alerts are available for investigation.`}
              </p>
            </div>
          </div>

          {!healthy ? (
            <button
              type="button"
              onClick={() =>
                navigate(
                  "/incident"
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-400/[0.08] px-4 py-3 text-xs font-semibold text-red-200 ring-1 ring-red-400/15 transition hover:bg-red-400/[0.13]"
            >
              Open Incident Explorer

              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   INCIDENT EXPLORER
========================================================= */

function IncidentExplorerPage({
  result,
}: {
  result: any;
}) {
  const [selectedAnomaly, setSelectedAnomaly] =
    useState<any>(null);

  const anomalies =
    result?.anomalies || [];

  const alerts =
    result?.alerts || [];

  const rootCause =
    normalizeRootCause(
      result
    );

const detectionVerification =
  result?.detection_verification;

const verificationScore = Math.round(
  Math.max(
    0,
    Math.min(
      100,
      Number(
        detectionVerification?.verification_score ?? 0
      )
    )
  )
);

const verificationStatus =
  detectionVerification?.status ?? "PENDING";

const verificationConfig =
  getVerificationConfig(
    verificationStatus
  );

const VerificationIcon =
  verificationConfig.icon;

const verificationEvidence =
  detectionVerification?.primary_verification?.evidence ??
  detectionVerification?.verification_evidence ??
  [];
  
  const qoeSummary =
    result?.qoe?.summary || {};

  const telemetry =
    result?.telemetry || [];

  const latest =
    getLatestTelemetry(
      result
    );

  const isHealthy =
    qoeSummary.status ===
    "Healthy";

  const incidentAnomalies =
    isHealthy
      ? []
      : anomalies;

      const [chatMessages, setChatMessages] =
  useState<
    {
      role: "user" | "assistant";
      content: string;
    }[]
  >([
    {
      role: "assistant",
      content:
        "I have analyzed this incident. Ask me about the root cause, signals, QoE degradation, or recommended investigation steps.",
    },
  ]);

const [chatOpen, setChatOpen] = useState(false);

const [chatInput, setChatInput] =
  useState("");

const [chatLoading, setChatLoading] =
  useState(false);

  const sendChatMessage = async () => {
  const question =
    chatInput.trim();

  if (
    !question ||
    chatLoading
  ) {
    return;
  }

  setChatInput("");

  setChatMessages(
    (messages) => [
      ...messages,
      {
        role: "user",
        content: question,
      },
    ]
  );

  setChatLoading(true);

  try {
    const response =
      await askIncidentQuestion(
        question,
        result
      );

    setChatMessages(
      (messages) => [
        ...messages,
        {
          role: "assistant",
          content:
            response.answer ||
            "I could not generate an answer.",
        },
      ]
    );
  } catch (error) {
    setChatMessages(
      (messages) => [
        ...messages,
        {
          role: "assistant",
          content:
            "The incident assistant could not be reached. Please try again.",
        },
      ]
    );
  } finally {
    setChatLoading(false);
  }
};

  useEffect(() => {
    if (
      incidentAnomalies.length &&
      !selectedAnomaly
    ) {
      setSelectedAnomaly(
        incidentAnomalies[0]
      );
    }
  }, [
    incidentAnomalies,
    selectedAnomaly,
  ]);

  /* =======================================================
     EMPTY / HEALTHY STATE
  ======================================================= */

  if (
    !incidentAnomalies.length
  ) {
    return (
      <div className="space-y-5">
        <div className="signal-panel overflow-hidden p-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.04]">
              <CheckCircle2 className="h-9 w-9 text-emerald-300" />
            </div>

            <div className="mt-6 text-[9px] font-bold uppercase tracking-[0.35em] text-emerald-400">
              Incident Explorer
            </div>

            <h2 className="mt-2 text-2xl font-semibold text-white">
              No active incident
            </h2>

            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">
              The current telemetry state does not contain any
              actionable anomalies requiring investigation.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="text-[8px] uppercase tracking-[0.2em] text-slate-600">
                  QoE
                </div>

                <div className="mt-2 text-xl font-semibold text-emerald-300">
                  {formatNumber(
                    qoeSummary.average_qoe ??
                      result?.summary?.average_qoe ??
                      0,
                    1
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="text-[8px] uppercase tracking-[0.2em] text-slate-600">
                  Anomalies
                </div>

                <div className="mt-2 text-xl font-semibold text-emerald-300">
                  0
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="text-[8px] uppercase tracking-[0.2em] text-slate-600">
                  Alerts
                </div>

                <div className="mt-2 text-xl font-semibold text-emerald-300">
                  0
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* =======================================================
     SELECTED ANOMALY DATA
  ======================================================= */

  const selected =
    selectedAnomaly ||
    incidentAnomalies[0];

  const severity =
    getSeverityConfig(
      selected?.severity
    );

  const selectedEvidence =
    selected?.evidence || {};

  const selectedMetric =
    selected?.metric ||
    selectedEvidence.metric ||
    humanize(
      selected?.type ||
        "unknown signal"
    );

  const baseline =
    Number(
      selected?.baseline ??
        selectedEvidence.baseline ??
        0
    );

  const observed =
    Number(
      selected?.observed ??
        selectedEvidence.current ??
        selectedEvidence.observed ??
        0
    );

  const change =
    Number(
      selected?.change_percent ??
        selected?.change ??
        selectedEvidence.change_percent ??
        0
    );

  const confidence =
    Math.round(
      Math.max(
        0,
        Math.min(
          1,
          Number(
            selected?.confidence ||
              0
          )
        )
      ) * 100
    );

  /* =======================================================
     ROOT CAUSE SIGNALS
  ======================================================= */

  const causeEvidence =
    rootCause.evidence || [];

  const causeSignals =
    rootCause.signals || [];

  /* =======================================================
     AI EXPLANATION
  ======================================================= */

  const aiExplanation =
    result?.ai_explanation;

const formatAIContent = (value: any): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join("\n");
  }

  return String(value)
    .replace(/\*\*/g, "")
    .trim();
};

const aiWhat = formatAIContent(
  aiExplanation?.what_happened ||
  aiExplanation?.summary
);

const aiWhy = formatAIContent(
  aiExplanation?.why ||
  aiExplanation?.explanation
);

const aiActions =
  Array.isArray(
    aiExplanation?.recommended_actions
  )
    ? aiExplanation.recommended_actions
    : Array.isArray(
        aiExplanation?.recommended_checks
      )
      ? aiExplanation.recommended_checks
      : [];

  /* =======================================================
     TELEMETRY AROUND INCIDENT
  ======================================================= */

  const telemetryWindow =
    telemetry.slice(
      Math.max(
        0,
        telemetry.length - 20
      )
    );

  return (
    <div className="space-y-5">

      {/* =================================================
          INCIDENT HEADER
      ================================================= */}

      <div className="signal-panel relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-red-400/[0.03] blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="live-dot bg-red-400" />

              <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-red-400">
                Incident Investigation
              </span>
            </div>

            <h2 className="mt-2 text-2xl font-semibold text-white">
              Streaming Quality Degradation
            </h2>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
              Cross-signal analysis of buffering, bitrate,
              latency, packet loss, playback failures and
              application health.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-center">
              <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
                Signals
              </div>

              <div className="mt-1 text-xl font-semibold text-red-300">
                {
                  incidentAnomalies.length
                }
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-center">
              <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
                Critical
              </div>

              <div className="mt-1 text-xl font-semibold text-red-300">
                {
                  incidentAnomalies.filter(
                    (item: any) =>
                      item.severity ===
                      "CRITICAL"
                  ).length
                }
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-center">
              <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
                Alerts
              </div>

              <div className="mt-1 text-xl font-semibold text-amber-300">
                {
                  alerts.length
                }
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =================================================
          INCIDENT TIMELINE
      ================================================= */}

      <div className="signal-panel p-5">
        <SectionTitle
          eyebrow="Detection Timeline"
          title="Anomaly Events"
          icon={Clock3}
        />

        <div className="mt-5 overflow-x-auto pb-2">
          <div className="flex min-w-max gap-3">
            {incidentAnomalies.map(
              (
                anomaly: any,
                index: number
              ) => {
                const itemSeverity =
                  getSeverityConfig(
                    anomaly.severity
                  );

                const active =
                  selected?.anomaly_id ===
                  anomaly.anomaly_id;

                return (
                  <button
                    type="button"
                    key={
                      anomaly.anomaly_id ||
                      index
                    }
                    onClick={() =>
                      setSelectedAnomaly(
                        anomaly
                      )
                    }
                    className={`group relative w-52 rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-cyan-400/30 bg-cyan-400/[0.05] shadow-[0_0_30px_rgba(34,211,238,0.05)]"
                        : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${itemSeverity.dot}`}
                      />

                      <span
                        className={`text-[8px] font-bold uppercase tracking-[0.16em] ${itemSeverity.text}`}
                      >
                        {
                          anomaly.severity
                        }
                      </span>
                    </div>

                    <div className="mt-4 text-xs font-semibold text-white">
                      {humanize(
                        anomaly.type ||
                          "Anomaly"
                      )}
                    </div>

                    <div className="mt-2 text-[9px] text-slate-600">
                      {formatTimestamp(
                        anomaly.timestamp
                      )}
                    </div>

                    <div className="mt-4 text-xl font-semibold text-slate-200">
                      {formatNumber(
                        Number(
                          anomaly.change_percent ||
                            anomaly.change ||
                            0
                        ),
                        0
                      )}
                      %
                    </div>

                    <div className="mt-1 text-[8px] uppercase tracking-[0.15em] text-slate-600">
                      deviation
                    </div>

                    <div
                      className={`absolute bottom-0 left-4 right-4 h-px ${
                        active
                          ? "bg-cyan-400"
                          : "bg-transparent"
                      }`}
                    />
                  </button>
                );
              }
            )}
          </div>
        </div>
      </div>

      {/* =================================================
          MAIN INVESTIGATION
      ================================================= */}

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">

        {/* =================================================
            ANOMALY LIST
        ================================================= */}

        <div className="signal-panel p-5">
          <SectionTitle
            eyebrow="Detected Signals"
            title="Investigation Queue"
            icon={TriangleAlert}
          />

          <div className="mt-5 max-h-[520px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
            {incidentAnomalies.map(
              (
                anomaly: any,
                index: number
              ) => {
                const itemSeverity =
                  getSeverityConfig(
                    anomaly.severity
                  );

                const active =
                  selected?.anomaly_id ===
                  anomaly.anomaly_id;

                return (
                  <button
                    type="button"
                    key={
                      anomaly.anomaly_id ||
                      index
                    }
                    onClick={() =>
                      setSelectedAnomaly(
                        anomaly
                      )
                    }
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-cyan-400/20 bg-cyan-400/[0.04]"
                        : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${itemSeverity.bg}`}
                      >
                        <AlertTriangle
                          className={`h-4 w-4 ${itemSeverity.text}`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-white">
                          {humanize(
                            anomaly.type
                          )}
                        </div>

                        <div className="mt-1 truncate text-[9px] text-slate-600">
                          {anomaly.metric ||
                            "Quality signal"}
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-xs font-semibold ${itemSeverity.text}`}
                        >
                          {formatSignedPercent(
                            Number(
                              anomaly.change_percent ||
                                anomaly.change ||
                                0
                            )
                          )}
                        </div>

                        <div className="mt-1 text-[8px] uppercase tracking-wider text-slate-600">
                          deviation
                        </div>
                      </div>
                    </div>
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* =================================================
            SELECTED ANOMALY
        ================================================= */}

        <div className="signal-panel p-5">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-cyan-400">
                Selected Signal
              </div>

              <h3 className="mt-1 text-xl font-semibold text-white">
                {humanize(
                  selected?.type ||
                    "Unknown anomaly"
                )}
              </h3>

              <p className="mt-1 text-[10px] text-slate-600">
                Metric:{" "}
                <span className="text-slate-400">
                  {selectedMetric}
                </span>
              </p>
            </div>

            <span
              className={`self-start rounded-full border px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.18em] ${severity.text} ${severity.border} ${severity.bg}`}
            >
              {
                selected?.severity
              }
            </span>
          </div>

          {/* METRIC COMPARISON */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-[8px] uppercase tracking-[0.17em] text-slate-600">
                Baseline
              </div>

              <div className="mt-2 text-2xl font-semibold text-slate-200">
                {formatNumber(
                  baseline,
                  2
                )}
              </div>
            </div>

            <div className="rounded-xl border border-red-400/10 bg-red-400/[0.025] p-4">
              <div className="text-[8px] uppercase tracking-[0.17em] text-slate-600">
                Observed
              </div>

              <div className="mt-2 text-2xl font-semibold text-red-300">
                {formatNumber(
                  observed,
                  2
                )}
              </div>
            </div>

            <div className="rounded-xl border border-amber-400/10 bg-amber-400/[0.025] p-4">
              <div className="text-[8px] uppercase tracking-[0.17em] text-slate-600">
                Change
              </div>

              <div className="mt-2 text-2xl font-semibold text-amber-300">
                {formatSignedPercent(
                  change
                )}
              </div>
            </div>
          </div>

          {/* CONFIDENCE */}
          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">
                  Detection Confidence
                </div>

                <div className="mt-1 text-sm font-semibold text-white">
                  {confidence}%
                </div>
              </div>

              <BrainCircuit className="h-5 w-5 text-cyan-400" />
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all"
                style={{
                  width: `${confidence}%`,
                }}
              />
            </div>
          </div>

          {/* EVIDENCE */}
          <div className="mt-5">
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600">
              Evidence
            </div>

            <div className="mt-3 space-y-2">
              {selected?.evidence_summary?.length ? (
                selected.evidence_summary.map(
                  (
                    item: string,
                    index: number
                  ) => (
                    <div
                      key={index}
                      className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                    >
                      <span className="text-cyan-400">
                        <CircleDot className="mt-0.5 h-3 w-3" />
                      </span>

                      <span className="text-[10px] leading-5 text-slate-400">
                        {item}
                      </span>
                    </div>
                  )
                )
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-600">
                  Detailed evidence was not returned by the anomaly detector.
                </div>
              )}
            </div>
          </div>

          {/* RAW EVIDENCE VALUES */}
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {[
              [
                "Z-Score",
                selected?.z_score ??
                  selectedEvidence.z_score ??
                  "—",
              ],
              [
                "Persistence",
                selected?.consecutive_points ??
                  selectedEvidence.consecutive_points ??
                  "—",
              ],
              [
                "Metric",
                selectedMetric,
              ],
              [
                "Timestamp",
                formatTimestamp(
                  selected?.timestamp
                ),
              ],
            ].map(
              ([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                >
                  <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
                    {label}
                  </div>

                  <div className="mt-1.5 truncate text-xs font-medium text-slate-300">
                    {String(value)}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* =================================================
          ROOT CAUSE ANALYSIS
      ================================================= */}

      <div className="signal-panel ai-glow p-5 sm:p-6">

        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05]">
              <BrainCircuit className="h-7 w-7 text-cyan-300" />
            </div>

            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-cyan-400">
                Root Cause Engine
              </div>

              <h3 className="mt-1 text-xl font-semibold text-white">
                {rootCause.cause}
              </h3>
            </div>
          </div>

<div className="grid grid-cols-2 gap-2">

  {/* RCA CONFIDENCE */}
  <div className="rounded-2xl border border-cyan-400/10 bg-cyan-400/[0.025] px-5 py-4 text-center">
    <div className="text-2xl font-semibold text-cyan-300">
      {rootCause.confidence}%
    </div>

    <div className="mt-1 text-[8px] uppercase tracking-[0.18em] text-slate-600">
      RCA Confidence
    </div>
  </div>

  {/* VERIFICATION */}
  <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.025] px-5 py-4 text-center">
    <div className="text-2xl font-semibold text-emerald-300">
      {verificationScore}%
    </div>

    <div className="mt-1 text-[8px] uppercase tracking-[0.18em] text-slate-600">
      Verification
    </div>
  </div>

</div>
        </div>

        {/* CAUSE EVIDENCE */}
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(
            causeSignals.length
              ? causeSignals
              : causeEvidence
          )
            .slice(0, 8)
            .map(
              (
                item: any,
                index: number
              ) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] uppercase tracking-[0.18em] text-slate-600">
                      Signal{" "}
                      {index + 1}
                    </span>

                    <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400" />
                  </div>

                  <div className="mt-3 text-[10px] leading-5 text-slate-400">
                    <div className="mt-3">
                      {typeof item === "string" ? (
                        <div className="text-[10px] leading-5 text-slate-400">
                          {item}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-white">
                              {item?.metric || "Quality Signal"}
                            </span>

                            <span
                              className={`text-[9px] font-semibold uppercase ${
                                item?.direction === "decrease"
                                  ? "text-amber-300"
                                  : "text-cyan-300"
                              }`}
                            >
                              {item?.direction === "decrease"
                                ? "↓ Decrease"
                                : "↑ Increase"}
                            </span>
                          </div>

                          {item?.observed !== undefined ? (
                            <div className="mt-2 text-sm font-semibold text-slate-200">
                              {formatNumber(
                                Number(item.observed),
                                2
                              )}
                              {item?.metric === "Latency"
                                ? " ms"
                                : item?.metric === "Packet Loss"
                                ? "%"
                                : item?.metric === "Buffering"
                                ? " sec"
                                : item?.metric === "Bitrate"
                                ? " Mbps"
                                : ""}
                            </div>
                          ) : null}

                          {item?.baseline !== undefined ? (
                            <div className="mt-1 text-[9px] text-slate-600">
                              Baseline:{" "}
                              {formatNumber(
                                Number(item.baseline),
                                2
                              )}
                            </div>
                          ) : null}

                          {item?.strength !== undefined ? (
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-[8px] uppercase tracking-[0.15em] text-slate-600">
                                <span>Signal strength</span>
                                <span>
                                  {formatNumber(
                                    Number(item.strength),
                                    0
                                  )}
                                  %
                                </span>
                              </div>

                              <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-cyan-400"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.max(
                                        0,
                                        Number(item.strength) || 0
                                      )
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
        </div>
{/* =====================================================
    DETECTION VERIFICATION
===================================================== */}

<div className="signal-panel p-5 sm:p-6">

  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

    <div className="flex items-center gap-3">

      <div
        className={`flex h-11 w-11 items-center justify-center rounded-xl border ${verificationConfig.border} ${verificationConfig.bg}`}
      >
        <VerificationIcon
          className={`h-5 w-5 ${verificationConfig.text}`}
        />
      </div>

      <div>

        <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-500">
          Detection Verification
        </div>

        <div className="mt-1 text-sm font-semibold text-white">
          Independent evidence validation
        </div>

      </div>

    </div>

    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] font-bold tracking-[0.16em] ${verificationConfig.text} ${verificationConfig.border} ${verificationConfig.bg}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${verificationConfig.dot}`}
      />

      {verificationConfig.label}
    </div>

  </div>


  {/* SCORE */}

  <div className="mt-5 grid gap-4 md:grid-cols-[180px_1fr]">

    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-center">

      <div className="text-3xl font-semibold text-white">
        {verificationScore}%
      </div>

      <div className="mt-1 text-[8px] uppercase tracking-[0.18em] text-slate-600">
        Verification Score
      </div>

    </div>


    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">

      <div className="flex items-center justify-between">

        <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Detection consistency
        </span>

        <span
          className={`text-[10px] font-semibold ${verificationConfig.text}`}
        >
          {verificationStatus}
        </span>

      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">

        <div
          className={`h-full rounded-full ${verificationConfig.dot} transition-all duration-500`}
          style={{
            width: `${verificationScore}%`,
          }}
        />

      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        The verification layer checks whether the detected root
        cause is supported by the observed anomalies and telemetry.
      </p>

    </div>

  </div>


  {/* VERIFICATION EVIDENCE */}

  <div className="mt-5">

    <div className="mb-3 text-[8px] font-semibold uppercase tracking-[0.2em] text-slate-600">
      Verification Evidence
    </div>

    {verificationEvidence.length > 0 ? (

      <div className="grid gap-2 md:grid-cols-2">

        {verificationEvidence
          .slice(0, 6)
          .map(
            (
              item: any,
              index: number
            ) => (

              <div
                key={index}
                className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3"
              >

                <VerificationIcon
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${verificationConfig.text}`}
                />

                <span className="text-[10px] leading-5 text-slate-400">
                  {typeof item === "string"
                    ? item
                    : item?.message ||
                      item?.evidence ||
                      JSON.stringify(item)}
                </span>

              </div>

            )
          )}

      </div>

    ) : (

      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-600">
        Verification results will appear here after the backend
        verification layer is enabled.
      </div>

    )}

  </div>

</div>
{/* =======================================================
    AI INCIDENT EXPLANATION
======================================================= */}

<div className="mt-6 rounded-2xl border border-cyan-400/10 bg-cyan-400/[0.025] p-5 sm:p-6">

  {/* Header */}
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

    <div className="flex items-center gap-3">

      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06]">
        <Sparkles className="h-5 w-5 text-cyan-300" />
      </div>

      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-cyan-400">
          AI Incident Explanation
        </div>

        <div className="mt-1 text-sm font-semibold text-white">
          Natural-language incident analysis
        </div>
      </div>

    </div>

    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/10 bg-cyan-400/[0.04] px-3 py-1.5">

      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />

      <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
        Qualcomm Imagine AI
      </span>

    </div>

  </div>


  {/* AI RESPONSE AVAILABLE */}
  {aiExplanation ? (

    <div className="mt-5 space-y-4">

      {/* Root cause summary */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <div className="text-[8px] uppercase tracking-[0.2em] text-slate-600">
              AI-supported assessment
            </div>

            <div className="mt-1 text-sm font-semibold text-white">
              {aiExplanation.root_cause ||
                rootCause.cause}
            </div>
          </div>

          <div className="text-left sm:text-right">

            <div className="text-lg font-semibold text-cyan-300">
              {Math.round(
                Number(
                  aiExplanation.confidence ??
                  rootCause.confidence ??
                  0
                )
              )}
              %
            </div>

            <div className="text-[8px] uppercase tracking-[0.15em] text-slate-600">
              Confidence
            </div>

          </div>

        </div>

      </div>


      {/* What + Why */}
      <div className="grid gap-4 lg:grid-cols-2">

        {aiWhat ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">

            <div className="flex items-center gap-2">

              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />

              <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                What happened
              </span>

            </div>

            <p className="mt-3 whitespace-pre-line text-xs leading-6 text-slate-400">
              {aiWhat}
            </p>

          </div>
        ) : null}



      {/* Recommended checks */}
      {Array.isArray(aiActions) &&
      aiActions.length > 0 ? (

        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">

          <div className="flex items-center gap-2">

            <Zap className="h-3.5 w-3.5 text-amber-300" />

            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-300">
              Recommended checks
            </span>

          </div>

          <div className="mt-3 space-y-2">

            {aiActions
              .slice(0, 5)
              .map(
                (
                  action: string,
                  index: number
                ) => (
                  <div
                    key={`${action}-${index}`}
                    className="flex gap-3 rounded-lg border border-slate-800/70 bg-slate-900/40 p-3"
                  >

                    <span className="text-[9px] font-bold text-cyan-400">
                      0{index + 1}
                    </span>

                    <span className="text-[10px] leading-5 text-slate-400">
                      {action}
                    </span>

                  </div>
                )
              )}

          </div>

        </div>

      ) : null}
    </div>
    </div>

  ) : (

    /* AI NOT AVAILABLE YET */
    <div className="mt-5 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-5">

      <div className="flex items-start gap-3">

        <div className="mt-0.5">
          <Sparkles className="h-4 w-4 text-cyan-400" />
        </div>

        <div>

          <div className="text-xs font-semibold text-white">
            AI explanation unavailable
          </div>

          <p className="mt-2 text-[10px] leading-5 text-slate-500">
            The deterministic investigation has identified
            <span className="text-slate-300">
              {" "}
              {rootCause.cause}
            </span>
            {" "}as the current primary root cause with
            <span className="text-cyan-300">
              {" "}
              {rootCause.confidence}%
            </span>
            {" "}confidence.
          </p>

          <p className="mt-2 text-[9px] text-slate-600">
            Qualcomm Imagine inference will provide the
            natural-language explanation when the AI service
            is configured.
          </p>

        </div>

      </div>

    </div>

  )}

</div>
{/* =========================================================
    FLOATING INCIDENT ASSISTANT
========================================================= */}

{/* Floating button */}
{!chatOpen && (
  <button
    type="button"
    onClick={() => setChatOpen(true)}
    className="fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/30 bg-slate-950/95 text-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.18)] backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:border-cyan-300/50 hover:bg-cyan-400/[0.08]"
    title="Open Incident Assistant"
  >
    <BrainCircuit className="h-6 w-6" />

    {/* Online indicator */}
    <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-cyan-400" />
  </button>
)}


{/* Floating chat window */}
{chatOpen && (
  <div className="fixed bottom-6 right-6 z-[100] flex w-[390px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#071019]/95 shadow-[0_20px_80px_rgba(0,0,0,0.55),0_0_40px_rgba(34,211,238,0.08)] backdrop-blur-2xl">

    {/* =====================================================
        HEADER
    ===================================================== */}

    <div className="border-b border-slate-800/80 bg-slate-950/50 px-4 py-4">

      <div className="flex items-center justify-between">

        <div className="flex items-center gap-3">

          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06]">

            <BrainCircuit className="h-4.5 w-4.5 text-cyan-300" />

            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-cyan-400" />

          </div>

          <div>

            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-400">
              Incident Assistant
            </div>

            <div className="mt-0.5 text-xs font-semibold text-white">
              Ask about this analysis
            </div>

          </div>

        </div>


        <div className="flex items-center gap-2">

          <span className="hidden rounded-full border border-cyan-400/10 bg-cyan-400/[0.04] px-2.5 py-1 text-[7px] font-semibold uppercase tracking-[0.14em] text-cyan-300 sm:block">
            Qualcomm AI
          </span>

          <button
            type="button"
            onClick={() => setChatOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800/70 hover:text-white"
            title="Close assistant"
          >
            <X className="h-4 w-4" />
          </button>

        </div>

      </div>


      <p className="mt-3 text-[9px] leading-5 text-slate-500">
        Ask about the detected root cause, anomalies,
        QoE impact, evidence, or recommended checks.
      </p>

    </div>


    {/* =====================================================
        CHAT MESSAGES
    ===================================================== */}

    <div className="h-[320px] space-y-3 overflow-y-auto p-4 custom-scrollbar">

      {chatMessages.map(
        (message, index) => (

          <div
            key={`${message.role}-${index}`}
            className={
              message.role === "user"
                ? "flex justify-end"
                : "flex justify-start"
            }
          >

            <div
              className={
                message.role === "user"
                  ? "max-w-[82%] rounded-2xl rounded-br-md border border-cyan-400/10 bg-cyan-400/[0.07] px-3.5 py-2.5"
                  : "max-w-[88%] rounded-2xl rounded-bl-md border border-slate-800 bg-slate-950/75 px-3.5 py-2.5"
              }
            >

              <div className="mb-1 text-[7px] font-bold uppercase tracking-[0.18em] text-slate-600">
                {message.role === "user"
                  ? "You"
                  : "Incident Assistant"}
              </div>

              <p className="whitespace-pre-wrap text-[10px] leading-5 text-slate-300">
                {message.content}
              </p>

            </div>

          </div>

        )
      )}


      {/* Loading */}
      {chatLoading && (
        <div className="flex justify-start">

          <div className="rounded-2xl rounded-bl-md border border-slate-800 bg-slate-950/75 px-3.5 py-2.5">

            <div className="flex items-center gap-2">

              <div className="flex gap-1">

                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />

                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 [animation-delay:150ms]" />

                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 [animation-delay:300ms]" />

              </div>

              <span className="text-[8px] text-slate-500">
                Analyzing incident...
              </span>

            </div>

          </div>

        </div>
      )}

    </div>


    {/* =====================================================
        SUGGESTED QUESTIONS
    ===================================================== */}

    <div className="border-t border-slate-800/70 px-4 pt-3">

      <div className="mb-2 flex items-center gap-2">

        <Sparkles className="h-3 w-3 text-cyan-400" />

        <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-slate-600">
          Suggested questions
        </span>

      </div>


      <div className="flex flex-wrap gap-1.5">

        {[
          "Why is this the root cause?",
          "Which signals are strongest?",
          "What should I check first?",
          "Summarize this incident",
        ].map((question) => (

          <button
            key={question}
            type="button"
            onClick={() => setChatInput(question)}
            className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-[8px] text-slate-400 transition hover:border-cyan-400/20 hover:bg-cyan-400/[0.04] hover:text-cyan-300"
          >
            {question}
          </button>

        ))}

      </div>

    </div>


    {/* =====================================================
        INPUT
    ===================================================== */}

    <div className="p-4">

      <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-1.5 focus-within:border-cyan-400/25">

        <input
          value={chatInput}
          onChange={(event) =>
            setChatInput(event.target.value)
          }
          onKeyDown={(event) => {

            if (
              event.key === "Enter" &&
              !event.shiftKey
            ) {
              event.preventDefault();
              void sendChatMessage();
            }

          }}
          placeholder="Ask about this incident..."
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[10px] text-white outline-none placeholder:text-slate-600"
        />


        <button
          type="button"
          disabled={
            !chatInput.trim() ||
            chatLoading
          }
          onClick={() =>
            void sendChatMessage()
          }
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-400/15 bg-cyan-400/[0.07] text-cyan-300 transition hover:bg-cyan-400/[0.12] disabled:cursor-not-allowed disabled:opacity-30"
          title="Send message"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>

      </div>

      <div className="mt-2 text-center text-[7px] text-slate-700">
        Answers are grounded in the current incident analysis
      </div>

    </div>

  </div>
)}
      </div>

      {/* =================================================
          TELEMETRY DURING INCIDENT
      ================================================= */}

      <div className="signal-panel p-5">
        <SectionTitle
          eyebrow="Underlying Telemetry"
          title="Signal Correlation"
          icon={BarChart3}
        />

        <div className="mt-5 h-72">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <LineChart
              data={telemetryWindow}
            >
              <CartesianGrid
                stroke="#18222e"
                strokeDasharray="3 3"
              />

              <XAxis
                dataKey="timestamp"
                tickFormatter={(
                  value
                ) =>
                  formatTimestamp(
                    value
                  )
                }
                stroke="#526273"
                tick={{
                  fontSize: 8,
                }}
              />

              <YAxis
                stroke="#526273"
                tick={{
                  fontSize: 8,
                }}
              />

              <Tooltip
                contentStyle={{
                  background:
                    "#080d14",
                  border:
                    "1px solid rgba(148,163,184,0.15)",
                  borderRadius: 12,
                }}
              />

              <Line
                type="monotone"
                dataKey="bitrate"
                name="Bitrate"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
              />

              <Line
                type="monotone"
                dataKey="latency"
                name="Latency"
                stroke="#facc15"
                strokeWidth={2}
                dot={false}
              />

              <Line
                type="monotone"
                dataKey="buffering_time"
                name="Buffering"
                stroke="#fb923c"
                strokeWidth={2}
                dot={false}
              />

              <Line
                type="monotone"
                dataKey="packet_loss"
                name="Packet Loss"
                stroke="#f87171"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* =================================================
          LATEST SNAPSHOT
      ================================================= */}

      {latest ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "Server Load",
              `${formatNumber(
                latest.server_load ||
                  0,
                1
              )}%`,
              Server,
            ],
            [
              "Startup Time",
              `${formatNumber(
                latest.startup_time ||
                  0,
                1
              )} sec`,
              Clock3,
            ],
            [
              "Playback Failures",
              latest.playback_failures ||
                0,
              XCircle,
            ],
            [
              "Crashes",
              latest.crashes || 0,
              ShieldAlert,
            ],
          ].map(
            ([
              label,
              value,
              Icon,
            ]) => (
              <div
                key={String(
                  label
                )}
                className="signal-panel p-4"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-slate-600" />

                  <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    {label}
                  </span>
                </div>

                <div className="mt-2 text-xl font-semibold text-white">
                  {value}
                </div>
              </div>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

/* =========================================================
   ANALYTICS PAGE
========================================================= */

function AnalyticsPage({
  result,
}: {
  result: any;
}) {
  const telemetry =
    result?.telemetry || [];

  const qoeResults =
    result?.qoe?.results || [];

  const anomalies =
    result?.anomalies || [];

  const qoeSummary =
    result?.qoe?.summary || {};

  /* =======================================================
     ANALYTICS DATA
  ======================================================= */

  const analyticsData =
    useMemo(() => {
      return telemetry
        .slice(-50)
        .map(
          (
            row: any,
            index: number
          ) => ({
            name: `T${index + 1}`,

            bitrate:
              Number(
                row.bitrate || 0
              ),

            buffering:
              Number(
                row.buffering_time ||
                  0
              ),

            latency:
              Number(
                row.latency || 0
              ),

            packetLoss:
              Number(
                row.packet_loss || 0
              ),

            jitter:
              Number(
                row.jitter || 0
              ),

            serverLoad:
              Number(
                row.server_load || 0
              ),
          })
        );
    }, [telemetry]);

  /* =======================================================
     QOE DISTRIBUTION
  ======================================================= */

  const qoeDistribution =
    useMemo(() => {
      let healthy = 0;
      let degraded = 0;
      let poor = 0;

      qoeResults.forEach(
        (item: any) => {
          const score =
            Number(
              item.qoe_score || 0
            );

          if (score >= 80) {
            healthy++;
          } else if (
            score >= 60
          ) {
            degraded++;
          } else {
            poor++;
          }
        }
      );

      return [
        {
          name: "Healthy",
          value: healthy,
        },
        {
          name: "Degraded",
          value: degraded,
        },
        {
          name: "Poor",
          value: poor,
        },
      ];
    }, [qoeResults]);

  /* =======================================================
     ANOMALY DISTRIBUTION
  ======================================================= */

  const anomalyDistribution =
    useMemo(() => {
      const map: Record<
        string,
        number
      > = {};

      anomalies.forEach(
        (item: any) => {
          const key =
            humanize(
              item.type ||
                "Unknown"
            );

          map[key] =
            (map[key] || 0) + 1;
        }
      );

      return Object.entries(
        map
      ).map(
        ([name, value]) => ({
          name,
          value,
        })
      );
    }, [anomalies]);

  /* =======================================================
     AVERAGES
  ======================================================= */

  const averages =
    useMemo(() => {
      if (!telemetry.length) {
        return {
          bitrate: 0,
          buffering: 0,
          latency: 0,
          packetLoss: 0,
          jitter: 0,
          serverLoad: 0,
        };
      }

      const sum = telemetry.reduce(
        (
          acc: any,
          row: any
        ) => {
          acc.bitrate +=
            Number(
              row.bitrate || 0
            );

          acc.buffering +=
            Number(
              row.buffering_time ||
                0
            );

          acc.latency +=
            Number(
              row.latency || 0
            );

          acc.packetLoss +=
            Number(
              row.packet_loss || 0
            );

          acc.jitter +=
            Number(
              row.jitter || 0
            );

          acc.serverLoad +=
            Number(
              row.server_load || 0
            );

          return acc;
        },
        {
          bitrate: 0,
          buffering: 0,
          latency: 0,
          packetLoss: 0,
          jitter: 0,
          serverLoad: 0,
        }
      );

      return {
        bitrate:
          sum.bitrate /
          telemetry.length,

        buffering:
          sum.buffering /
          telemetry.length,

        latency:
          sum.latency /
          telemetry.length,

        packetLoss:
          sum.packetLoss /
          telemetry.length,

        jitter:
          sum.jitter /
          telemetry.length,

        serverLoad:
          sum.serverLoad /
          telemetry.length,
      };
    }, [telemetry]);

  const highestAnomaly =
    anomalies.length
      ? [...anomalies].sort(
          (
            a: any,
            b: any
          ) =>
            Math.abs(
              Number(
                b.change_percent ||
                  b.change ||
                  0
              )
            ) -
            Math.abs(
              Number(
                a.change_percent ||
                  a.change ||
                  0
              )
            )
        )[0]
      : null;

  return (
    <div className="space-y-5">

      {/* =================================================
          ANALYTICS HEADER
      ================================================= */}

      <div className="signal-panel p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-cyan-400">
              Observability Analytics
            </div>

            <h2 className="mt-2 text-2xl font-semibold text-white">
              Stream Performance Analytics
            </h2>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
              Aggregate quality metrics, anomaly distribution,
              infrastructure signals and QoE behaviour from the
              current simulation.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
                Samples
              </div>

              <div className="mt-1 text-lg font-semibold text-white">
                {telemetry.length}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
                Sessions
              </div>

              <div className="mt-1 text-lg font-semibold text-white">
                {result?.summary?.total_sessions ||
                  "—"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
                QoE
              </div>

              <div className="mt-1 text-lg font-semibold text-cyan-300">
                {formatNumber(
                  result?.summary?.average_qoe ||
                    qoeSummary.average_qoe ||
                    0,
                  1
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
                Anomalies
              </div>

              <div className="mt-1 text-lg font-semibold text-amber-300">
                {anomalies.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =================================================
          KPI ANALYTICS
      ================================================= */}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          [
            "Avg Bitrate",
            `${formatNumber(
              averages.bitrate,
              2
            )} Mbps`,
            Activity,
          ],
          [
            "Avg Buffering",
            `${formatNumber(
              averages.buffering,
              2
            )} sec`,
            Radio,
          ],
          [
            "Avg Latency",
            `${formatNumber(
              averages.latency,
              1
            )} ms`,
            Wifi,
          ],
          [
            "Packet Loss",
            `${formatNumber(
              averages.packetLoss,
              2
            )}%`,
            Signal,
          ],
          [
            "Jitter",
            `${formatNumber(
              averages.jitter,
              1
            )} ms`,
            Activity,
          ],
          [
            "Server Load",
            `${formatNumber(
              averages.serverLoad,
              1
            )}%`,
            Server,
          ],
        ].map(
          ([
            label,
            value,
            Icon,
          ]) => (
            <div
              key={String(label)}
              className="signal-panel p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {label}
                </span>

                <Icon className="h-3.5 w-3.5 text-cyan-400/60" />
              </div>

              <div className="mt-2 text-xl font-semibold text-white">
                {value}
              </div>
            </div>
          )
        )}
      </div>

      {/* =================================================
          MAIN ANALYTICS CHART
      ================================================= */}

      <div className="signal-panel p-5">
        <SectionTitle
          eyebrow="Metric Correlation"
          title="Quality Signals Over Time"
          icon={BarChart3}
        />

        <div className="mt-5 h-80">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <LineChart
              data={analyticsData}
            >
              <CartesianGrid
                stroke="#18222e"
                strokeDasharray="3 3"
              />

              <XAxis
                dataKey="name"
                stroke="#526273"
                tick={{
                  fontSize: 8,
                }}
              />

              <YAxis
                stroke="#526273"
                tick={{
                  fontSize: 8,
                }}
              />

              <Tooltip
                contentStyle={{
                  background:
                    "#080d14",
                  border:
                    "1px solid rgba(148,163,184,0.15)",
                  borderRadius: 12,
                }}
              />

              <Line
                type="monotone"
                dataKey="bitrate"
                name="Bitrate"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
              />

              <Line
                type="monotone"
                dataKey="latency"
                name="Latency"
                stroke="#facc15"
                strokeWidth={2}
                dot={false}
              />

              <Line
                type="monotone"
                dataKey="serverLoad"
                name="Server Load"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* =================================================
          QOE + ANOMALY DISTRIBUTION
      ================================================= */}

      <div className="grid gap-5 lg:grid-cols-2">

        {/* QOE DISTRIBUTION */}
        <div className="signal-panel p-5">
          <SectionTitle
            eyebrow="Quality Distribution"
            title="QoE Classification"
            icon={Gauge}
          />

          <div className="mt-5 h-64">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={qoeDistribution}
              >
                <CartesianGrid
                  stroke="#18222e"
                  strokeDasharray="3 3"
                />

                <XAxis
                  dataKey="name"
                  stroke="#526273"
                  tick={{
                    fontSize: 9,
                  }}
                />

                <YAxis
                  stroke="#526273"
                  tick={{
                    fontSize: 8,
                  }}
                />

                <Tooltip
                  contentStyle={{
                    background:
                      "#080d14",
                    border:
                      "1px solid rgba(148,163,184,0.15)",
                    borderRadius: 12,
                  }}
                />

                <Bar
                  dataKey="value"
                  fill="#22d3ee"
                  radius={[
                    6,
                    6,
                    0,
                    0,
                  ]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ANOMALY DISTRIBUTION */}
        <div className="signal-panel p-5">
          <SectionTitle
            eyebrow="Detection Distribution"
            title="Anomaly Types"
            icon={TriangleAlert}
          />

          {anomalyDistribution.length ? (
            <div className="mt-5 space-y-3">
              {anomalyDistribution
                .sort(
                  (
                    a,
                    b
                  ) =>
                    b.value -
                    a.value
                )
                .map(
                  (
                    item,
                    index
                  ) => {
                    const max =
                      Math.max(
                        ...anomalyDistribution.map(
                          (
                            x
                          ) =>
                            x.value
                        )
                      );

                    return (
                      <div
                        key={
                          item.name
                        }
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-cyan-400">
                              {String(
                                index + 1
                              ).padStart(
                                2,
                                "0"
                              )}
                            </span>

                            <span className="text-xs text-slate-300">
                              {
                                item.name
                              }
                            </span>
                          </div>

                          <span className="text-xs font-semibold text-white">
                            {
                              item.value
                            }
                          </span>
                        </div>

                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-cyan-400"
                            style={{
                              width: `${(item.value / max) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  }
                )}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.02] p-5 text-sm text-emerald-300">
              No anomalies detected.
            </div>
          )}
        </div>
      </div>

      {/* =================================================
          ANALYTICS INSIGHT
      ================================================= */}

      <div className="signal-panel ai-glow p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04]">
            <BrainCircuit className="h-5 w-5 text-cyan-300" />
          </div>

          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-cyan-400">
              Automated Insight
            </div>

            <h3 className="mt-1 text-base font-semibold text-white">
              {highestAnomaly
                ? `${humanize(
                    highestAnomaly.type
                  )} is the dominant anomaly`
                : "No dominant anomaly detected"}
            </h3>

            <p className="mt-2 max-w-4xl text-xs leading-6 text-slate-500">
              {highestAnomaly
                ? `The largest observed deviation is ${formatSignedPercent(
                    Number(
                      highestAnomaly.change_percent ||
                        highestAnomaly.change ||
                        0
                    )
                  )}. This signal should be correlated with network, CDN and server telemetry before taking corrective action.`
                : "The current telemetry remains within the expected quality envelope. Continue monitoring QoE and infrastructure metrics."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   GLOBAL FOOTER
========================================================= */

function DashboardFooter() {
  return (
    <footer className="mt-8 border-t border-slate-800/70 pt-5">
      <div className="flex flex-col gap-2 text-[8px] uppercase tracking-[0.18em] text-slate-700 sm:flex-row sm:items-center sm:justify-between">
        <div>
          Media Stream Quality Detective
          <span className="mx-2 text-slate-800">
            //
          </span>
          QoE Intelligence Platform
        </div>

        <div className="flex items-center gap-3">
          <span>
            Telemetry
          </span>

          <span className="text-slate-800">
            •
          </span>

          <span>
            Anomaly Detection
          </span>

          <span className="text-slate-800">
            •
          </span>

          <span>
            Root Cause
          </span>

          <span className="text-slate-800">
            •
          </span>

          <span>
            AI Ready
          </span>
        </div>
      </div>
    </footer>
  );
}

/* =========================================================
   MAIN APPLICATION
========================================================= */

export default function App() {
  const [selectedScenario, setSelectedScenario] =
    useState(
      SCENARIO_OPTIONS?.[0]?.value ||
        "healthy"
    );

  const [
    selectedScenarios,
    setSelectedScenarios,
  ] = useState<string[]>([]);

  const [result, setResult] =
    useState<any>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(
      null
    );

  const [lastUpdated, setLastUpdated] =
    useState<Date | null>(
      null
    );


  const toggleScenario = (
    scenario: string
  ) => {
    setSelectedScenarios((previous) => {

      if (previous.includes(scenario)) {
        return previous.filter(
          (item) => item !== scenario
        );
      }

      if (previous.length >= 3) {
        return previous;
      }

      return [
        ...previous,
        scenario,
      ];
    });
  };

  /* =======================================================
     RUN DETECTION
  ======================================================= */

  const runDetection =
    async () => {
      try {
        setLoading(true);
        setError(null);

        if (
          selectedScenario === "multi_factor" &&
          selectedScenarios.length < 2
        ) {
          setError(
            "Select at least 2 incident factors."
          );

          setLoading(false);

          return;
        }

        const data =
          await fetchScenarioSimulation(
            selectedScenario,
            selectedScenario === "multi_factor"
              ? selectedScenarios
              : undefined
          );

        setResult(data);
        setLastUpdated(
          new Date()
        );
      } catch (err: any) {
        console.error(
          "Simulation failed:",
          err
        );

        setError(
          err?.message ||
            "Unable to connect to the Media Stream Quality backend."
        );
      } finally {
        setLoading(false);
      }
    };

  /* =======================================================
     INITIAL LOAD
  ======================================================= */

useEffect(() => {
  if (window.location.pathname !== "/") {
    runDetection();
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  /* =======================================================
     ROOT CAUSE / STATUS
  ======================================================= */

  const qoeStatus =
    result?.qoe?.summary
      ?.status ||
    result?.summary?.status ||
    "Unknown";

  const isHealthy =
    qoeStatus === "Healthy";

  /* =======================================================
     APP SHELL
  ======================================================= */

  return (
    <div className="min-h-screen bg-[#05080d] text-slate-200">

      {/* =================================================
          BACKGROUND
      ================================================= */}

      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[10%] top-[-15%] h-[500px] w-[500px] rounded-full bg-cyan-500/[0.025] blur-[120px]" />

        <div className="absolute bottom-[-20%] right-[5%] h-[600px] w-[600px] rounded-full bg-violet-500/[0.02] blur-[140px]" />

        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)",
            backgroundSize:
              "48px 48px",
          }}
        />
      </div>

      {/* =================================================
          CONTENT
      ================================================= */}

      <main className="mx-auto max-w-[1700px] px-4 py-4 sm:px-6 lg:px-8">

        {/* =================================================
            GLOBAL ERROR
        ================================================= */}

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/15 bg-red-400/[0.025] p-5">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />

              <div>
                <div className="text-sm font-semibold text-red-200">
                  Backend connection failed
                </div>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={
                    runDetection
                  }
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-400/15 bg-red-400/[0.04] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-red-200 hover:bg-red-400/[0.08]"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* =================================================
            LOADING
        ================================================= */}

<Routes>

  {/* LANDING PAGE */}
  <Route
    path="/"
    element={<LandingPage />}
  />

  {/* OVERVIEW */}
  <Route
    path="/overview"
    element={
      result ? (
<DashboardLayout
  selectedScenario={
    selectedScenario
  }

  selectedScenarios={
    selectedScenarios
  }

  onScenarioChange={(scenario) => {

    setSelectedScenario(
      scenario
    );

    if (
      scenario !== "multi_factor"
    ) {
      setSelectedScenarios([]);
    }

  }}

  onScenarioToggle={
    toggleScenario
  }

  onSimulate={() =>
    void runDetection()
  }

  loading={loading}
>
          <OverviewPage
            result={result}
            onRefresh={runDetection}
          />
        </DashboardLayout>
      ) : (
        <LoadingState />
      )
    }
  />

  {/* INCIDENT EXPLORER */}
  <Route
    path="/incident"
    element={
      result ? (
<DashboardLayout
  selectedScenario={
    selectedScenario
  }

  selectedScenarios={
    selectedScenarios
  }

  onScenarioChange={(scenario) => {

    setSelectedScenario(
      scenario
    );

    if (
      scenario !== "multi_factor"
    ) {
      setSelectedScenarios([]);
    }

  }}

  onScenarioToggle={
    toggleScenario
  }

  onSimulate={() =>
    void runDetection()
  }

  loading={loading}
>
          <IncidentExplorerPage
            result={result}
          />
        </DashboardLayout>
      ) : (
        <LoadingState />
      )
    }
  />

  {/* ANALYTICS */}
  <Route
    path="/analytics"
    element={
      result ? (
<DashboardLayout
  selectedScenario={
    selectedScenario
  }

  selectedScenarios={
    selectedScenarios
  }

  onScenarioChange={(scenario) => {

    setSelectedScenario(
      scenario
    );

    if (
      scenario !== "multi_factor"
    ) {
      setSelectedScenarios([]);
    }

  }}

  onScenarioToggle={
    toggleScenario
  }

  onSimulate={() =>
    void runDetection()
  }

  loading={loading}
>
          <AnalyticsPage
            result={result}
          />
        </DashboardLayout>
      ) : (
        <LoadingState />
      )
    }
  />

  {/* FALLBACK */}
  <Route
    path="*"
    element={<Navigate to="/" replace />}
  />

</Routes>

        {/* =================================================
            FOOTER
        ================================================= */}

        <DashboardFooter />

        {/* =================================================
            STATUS BAR
        ================================================= */}

        <div className="mt-3 flex flex-col gap-2 pb-4 text-[8px] uppercase tracking-[0.15em] text-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                error
                  ? "bg-red-400"
                  : loading
                  ? "animate-pulse bg-amber-400"
                  : "bg-emerald-400"
              }`}
            />

            <span>
              {error
                ? "Backend disconnected"
                : loading
                ? "Running detection pipeline"
                : "Detection engine online"}
            </span>
          </div>

          <div>
            {lastUpdated
              ? `Last analysis ${lastUpdated.toLocaleTimeString()}`
              : "Awaiting analysis"}
          </div>
        </div>
      </main>
    </div>
  );
}