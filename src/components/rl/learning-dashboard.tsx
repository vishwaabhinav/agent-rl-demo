"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";
import type {
  LearningCurvePoint,
  AggregateMetrics,
  EvalResult,
} from "./types";
import { SAMPLE_LEARNING_CURVE, SAMPLE_METRICS, BASELINE_METRICS } from "./types";
import { ExperimentRadar, type ExperimentVersion } from "./experiment-radar";

interface LearningDashboardProps {
  learningCurve?: LearningCurvePoint[];
  evalResults?: EvalResult[];
  finalMetrics?: AggregateMetrics;
  baselineMetrics?: AggregateMetrics;
  trainTimeMs?: number;
  learnerType?: "bandit" | "qlearning";
  isTraining?: boolean;
  currentEpisode?: number;
  /** All available experiments for the radar comparison */
  allExperiments?: ExperimentVersion[];
  /** Callback when an experiment is selected in the radar */
  onExperimentSelect?: (id: string) => void;
}

export function LearningDashboard({
  learningCurve = SAMPLE_LEARNING_CURVE,
  evalResults = [],
  finalMetrics = SAMPLE_METRICS,
  baselineMetrics = BASELINE_METRICS,
  trainTimeMs = 0,
  learnerType = "bandit",
  isTraining = false,
  currentEpisode = 0,
  allExperiments = [],
  onExperimentSelect,
}: LearningDashboardProps) {
  const [smoothWindow, setSmoothWindow] = useState(10);

  // Compute smoothed learning curve
  const smoothedCurve = useMemo(() => {
    return learningCurve.map((point, i) => {
      const start = Math.max(0, i - smoothWindow + 1);
      const window = learningCurve.slice(start, i + 1);
      const avgReturn =
        window.reduce((sum, p) => sum + p.trainReturn, 0) / window.length;
      return {
        ...point,
        smoothedReturn: avgReturn,
      };
    });
  }, [learningCurve, smoothWindow]);

  // Format time
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // Metric card component
  const MetricCard = ({
    label,
    value,
    subtext,
    trend,
  }: {
    label: string;
    value: string;
    subtext?: string;
    trend?: "up" | "down" | "neutral";
  }) => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="text-2xl font-mono font-semibold text-zinc-100 flex items-center gap-2">
        {value}
        {trend && (
          <span
            className={
              trend === "up"
                ? "text-emerald-500 text-sm"
                : trend === "down"
                ? "text-red-500 text-sm"
                : "text-zinc-500 text-sm"
            }
          >
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "−"}
          </span>
        )}
      </div>
      {subtext && <div className="text-xs text-zinc-500 mt-1">{subtext}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">
            Learning Dashboard
          </h2>
          <p className="text-sm text-zinc-500">
            {learnerType === "bandit" ? "Contextual Bandit" : "Q-Learning"} ·{" "}
            {isTraining
              ? `Training (${currentEpisode}/${learningCurve.length})`
              : `${learningCurve.length} episodes`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Smoothing:</label>
            <input
              type="range"
              min="1"
              max="50"
              value={smoothWindow}
              onChange={(e) => setSmoothWindow(Number(e.target.value))}
              className="w-24 accent-blue-500"
            />
            <span className="text-xs text-zinc-400 w-6">{smoothWindow}</span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Avg Return"
          value={finalMetrics.avgReturn.toFixed(3)}
          subtext={`± ${finalMetrics.stdReturn.toFixed(3)}`}
          trend={
            baselineMetrics
              ? finalMetrics.avgReturn > baselineMetrics.avgReturn
                ? "up"
                : "down"
              : undefined
          }
        />
        <MetricCard
          label="Success Rate"
          value={`${(finalMetrics.successRate * 100).toFixed(1)}%`}
          trend={
            baselineMetrics
              ? finalMetrics.successRate > baselineMetrics.successRate
                ? "up"
                : "down"
              : undefined
          }
        />
        <MetricCard
          label="Hangup Rate"
          value={`${(finalMetrics.hangupRate * 100).toFixed(1)}%`}
          trend={
            baselineMetrics
              ? finalMetrics.hangupRate < baselineMetrics.hangupRate
                ? "up"
                : "down"
              : undefined
          }
        />
        <MetricCard
          label="Avg Length"
          value={finalMetrics.avgLength.toFixed(1)}
          subtext="turns"
        />
      </div>

      {/* Multi-Experiment Radar Comparison */}
      <ExperimentRadar
        experiments={allExperiments}
        baselineMetrics={baselineMetrics}
        onExperimentSelect={onExperimentSelect}
      />

      {/* Learning Curve Chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">
          Learning Curve
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={smoothedCurve}>
              <defs>
                <linearGradient id="returnGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="episode"
                stroke="#52525b"
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={{ stroke: "#52525b" }}
              />
              <YAxis
                stroke="#52525b"
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={{ stroke: "#52525b" }}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px" }}
                iconType="line"
              />
              <Area
                type="monotone"
                dataKey="trainReturn"
                stroke="#3b82f680"
                fill="url(#returnGradient)"
                name="Episode Return"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="smoothedReturn"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="Smoothed Return"
              />
              {evalResults.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="evalReturn"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: "#10b981", r: 4 }}
                  name="Eval Return"
                  connectNulls
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row: Success Rate + Persona Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Success Rate Over Time */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">
            Success Rate Progress
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={smoothedCurve.filter((p) => p.evalSuccessRate !== undefined)}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="episode"
                  stroke="#52525b"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                />
                <YAxis
                  stroke="#52525b"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  domain={[0, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(v) => [`${((v as number) * 100).toFixed(1)}%`, "Success"]}
                />
                <Line
                  type="monotone"
                  dataKey="evalSuccessRate"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: "#10b981", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Outcome Distribution */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">
            Outcome Distribution
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: "Success", value: finalMetrics.successRate, fill: "#10b981" },
                  { name: "Partial", value: finalMetrics.partialSuccessRate - finalMetrics.successRate, fill: "#3b82f6" },
                  { name: "Hangup", value: finalMetrics.hangupRate, fill: "#ef4444" },
                  { name: "Escalate", value: finalMetrics.escalationRate, fill: "#f59e0b" },
                  { name: "Other", value: Math.max(0, 1 - finalMetrics.partialSuccessRate - finalMetrics.hangupRate - finalMetrics.escalationRate), fill: "#52525b" },
                ]}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="#52525b"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  domain={[0, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#52525b"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(v) => [`${((v as number) * 100).toFixed(1)}%`]}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Training Stats */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="text-zinc-500">
            Training time: <span className="text-zinc-300">{formatTime(trainTimeMs)}</span>
          </div>
          <div className="text-zinc-500">
            Episodes: <span className="text-zinc-300">{learningCurve.length}</span>
          </div>
          <div className="text-zinc-500">
            Learner: <span className="text-zinc-300 capitalize">{learnerType}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
