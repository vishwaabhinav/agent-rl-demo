"use client";

import { useState, useMemo, useEffect } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Check, ChevronDown, FlaskConical, Layers, X } from "lucide-react";
import type { AggregateMetrics } from "./types";

// Color palette - muted jewel tones that layer well
const EXPERIMENT_COLORS = [
  { stroke: "#10b981", fill: "#10b981", name: "Emerald" },
  { stroke: "#3b82f6", fill: "#3b82f6", name: "Blue" },
  { stroke: "#f59e0b", fill: "#f59e0b", name: "Amber" },
  { stroke: "#ec4899", fill: "#ec4899", name: "Pink" },
  { stroke: "#8b5cf6", fill: "#8b5cf6", name: "Violet" },
  { stroke: "#14b8a6", fill: "#14b8a6", name: "Teal" },
  { stroke: "#f97316", fill: "#f97316", name: "Orange" },
  { stroke: "#06b6d4", fill: "#06b6d4", name: "Cyan" },
];

const BASELINE_COLOR = { stroke: "#ef4444", fill: "#ef4444", name: "Baseline" };

export interface ExperimentVersion {
  id: string;
  shortId: string;
  learnerType: "bandit" | "qlearning" | "baseline";
  episodesTrained: number;
  successRate: number;
  avgReturn: number;
  createdAt: string;
  metrics: AggregateMetrics;
}

interface ExperimentRadarProps {
  experiments: ExperimentVersion[];
  baselineMetrics?: AggregateMetrics;
  onExperimentSelect?: (id: string) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getShortId(id: string): string {
  // Extract meaningful part: "qlearning-2026-02-01T12-58-56" -> "qlearn-0201-1258"
  const parts = id.split("-");
  if (parts.length >= 4) {
    const type = parts[0].slice(0, 6);
    const date = parts.slice(1, 4).join("-");
    const match = date.match(/(\d{4})-(\d{2})-(\d{2})T?(\d{2})?-?(\d{2})?/);
    if (match) {
      return `${type}-${match[2]}${match[3]}-${match[4] || "00"}${match[5] || "00"}`;
    }
  }
  return id.slice(0, 12);
}

export function ExperimentRadar({
  experiments,
  baselineMetrics,
  onExperimentSelect,
}: ExperimentRadarProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBaseline, setShowBaseline] = useState(true);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [hoveredExperiment, setHoveredExperiment] = useState<string | null>(null);

  // Auto-select the most recent experiment on mount
  useEffect(() => {
    if (experiments.length > 0 && selectedIds.size === 0) {
      setSelectedIds(new Set([experiments[0].id]));
    }
  }, [experiments]);

  // Build radar data with all selected experiments
  const radarData = useMemo(() => {
    const getMetricValue = (m: AggregateMetrics, key: string): number => {
      switch (key) {
        case "successRate": return m.successRate * 100;
        case "partialSuccessRate": return m.partialSuccessRate * 100;
        case "retention": return (1 - m.hangupRate) * 100;
        case "deescalation": return (1 - m.escalationRate) * 100;
        case "efficiency": return Math.max(0, 100 - (m.avgLength - 1) * 5);
        default: return 0;
      }
    };

    const metricKeys = [
      { key: "successRate", label: "Success Rate" },
      { key: "partialSuccessRate", label: "Partial Success" },
      { key: "retention", label: "Retention" },
      { key: "deescalation", label: "De-escalation" },
      { key: "efficiency", label: "Efficiency" },
    ];

    return metricKeys.map((metric) => {
      const point: Record<string, number | string> = {
        metric: metric.label,
        fullMark: 100,
      };

      // Add baseline
      if (showBaseline && baselineMetrics) {
        point.baseline = getMetricValue(baselineMetrics, metric.key);
      }

      // Add selected experiments
      experiments
        .filter((exp) => selectedIds.has(exp.id))
        .forEach((exp) => {
          point[exp.id] = getMetricValue(exp.metrics, metric.key);
        });

      return point;
    });
  }, [experiments, selectedIds, showBaseline, baselineMetrics]);

  const toggleExperiment = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      if (newSet.size >= 6) {
        // Remove oldest selection
        const first = newSet.values().next().value;
        if (first) newSet.delete(first);
      }
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const getColorForExperiment = (id: string): typeof EXPERIMENT_COLORS[0] => {
    const selectedArray = Array.from(selectedIds);
    const idx = selectedArray.indexOf(id);
    return EXPERIMENT_COLORS[idx % EXPERIMENT_COLORS.length];
  };

  const selectedExperiments = experiments.filter((e) => selectedIds.has(e.id));

  return (
    <div className="bg-[#0a0e14] border border-[#1e3a4f]/40 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1e3a4f]/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#00d4ff]/70" />
          <h3 className="text-sm font-medium text-[#c5d5e5]">Policy Comparison</h3>
          <span className="text-[10px] text-[#5a6a7a] bg-[#1e3a4f]/30 px-1.5 py-0.5 rounded">
            {selectedIds.size} selected
          </span>
        </div>

        {/* Version Picker */}
        <div className="relative">
          <button
            onClick={() => setIsPickerOpen(!isPickerOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0d1117] border border-[#1e3a4f]/60 rounded text-xs text-[#8a9aaa] hover:border-[#00d4ff]/40 transition-colors"
          >
            <FlaskConical className="w-3 h-3" />
            <span>Add Version</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${isPickerOpen ? "rotate-180" : ""}`} />
          </button>

          {isPickerOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsPickerOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-[#0d1117] border border-[#1e3a4f]/60 rounded-lg shadow-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-[#1e3a4f]/40 text-[10px] uppercase tracking-wider text-[#5a6a7a]">
                  Available Experiments
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {experiments.map((exp) => {
                    const isSelected = selectedIds.has(exp.id);
                    const color = isSelected ? getColorForExperiment(exp.id) : null;

                    return (
                      <button
                        key={exp.id}
                        onClick={() => toggleExperiment(exp.id)}
                        className={`
                          w-full px-3 py-2.5 flex items-start gap-3 text-left transition-colors
                          ${isSelected ? "bg-[#1e3a4f]/20" : "hover:bg-[#1e3a4f]/10"}
                        `}
                      >
                        {/* Selection indicator */}
                        <div
                          className={`
                            mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0
                            ${isSelected
                              ? "border-transparent"
                              : "border-[#3a4a5a]"
                            }
                          `}
                          style={isSelected ? { backgroundColor: color?.fill } : undefined}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>

                        {/* Experiment info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-[#c5d5e5] truncate">
                              {exp.shortId}
                            </span>
                            <span className={`
                              text-[9px] px-1.5 py-0.5 rounded font-medium uppercase
                              ${exp.learnerType === "qlearning"
                                ? "bg-violet-500/20 text-violet-400"
                                : exp.learnerType === "bandit"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-zinc-500/20 text-zinc-400"
                              }
                            `}>
                              {exp.learnerType === "qlearning" ? "Q" : exp.learnerType === "bandit" ? "B" : "—"}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[10px] text-[#5a6a7a]">
                            <span>{exp.episodesTrained} eps</span>
                            <span>{(exp.successRate * 100).toFixed(0)}% success</span>
                            <span>{formatDate(exp.createdAt)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Baseline toggle */}
                <div className="px-3 py-2 border-t border-[#1e3a4f]/40">
                  <button
                    onClick={() => setShowBaseline(!showBaseline)}
                    className="w-full flex items-center gap-3 text-left"
                  >
                    <div
                      className={`
                        w-4 h-4 rounded border flex items-center justify-center
                        ${showBaseline
                          ? "border-transparent bg-red-500"
                          : "border-[#3a4a5a]"
                        }
                      `}
                    >
                      {showBaseline && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <div>
                      <div className="text-xs text-[#c5d5e5]">Show Baseline</div>
                      <div className="text-[10px] text-[#5a6a7a]">Random policy reference</div>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Selected experiments tags */}
      {selectedExperiments.length > 0 && (
        <div className="px-4 py-2 border-b border-[#1e3a4f]/20 flex items-center gap-2 flex-wrap">
          {showBaseline && baselineMetrics && (
            <div
              className="group flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] cursor-pointer transition-all hover:ring-1 hover:ring-red-500/30"
              style={{ backgroundColor: `${BASELINE_COLOR.fill}15` }}
              onMouseEnter={() => setHoveredExperiment("baseline")}
              onMouseLeave={() => setHoveredExperiment(null)}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: BASELINE_COLOR.fill }}
              />
              <span className="text-red-400 font-medium">Baseline</span>
              <button
                onClick={() => setShowBaseline(false)}
                className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
              >
                <X className="w-3 h-3 text-red-400/60 hover:text-red-400" />
              </button>
            </div>
          )}

          {selectedExperiments.map((exp) => {
            const color = getColorForExperiment(exp.id);
            const isHovered = hoveredExperiment === exp.id;

            return (
              <div
                key={exp.id}
                className={`
                  group flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] cursor-pointer transition-all
                  ${isHovered ? "ring-1" : ""}
                `}
                style={{
                  backgroundColor: `${color.fill}15`,
                  ...(isHovered && { boxShadow: `0 0 0 1px ${color.fill}40` }),
                }}
                onMouseEnter={() => setHoveredExperiment(exp.id)}
                onMouseLeave={() => setHoveredExperiment(null)}
                onClick={() => onExperimentSelect?.(exp.id)}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color.fill }}
                />
                <span style={{ color: color.fill }} className="font-medium">
                  {exp.shortId}
                </span>
                <span className="text-[#5a6a7a]">
                  {exp.episodesTrained}ep · {(exp.successRate * 100).toFixed(0)}%
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExperiment(exp.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                >
                  <X
                    className="w-3 h-3 hover:opacity-100"
                    style={{ color: `${color.fill}80` }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Radar Chart */}
      <div className="p-4">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
              <PolarGrid stroke="#1e3a4f" strokeOpacity={0.6} />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: "#8a9aaa", fontSize: 11, fontWeight: 500 }}
                tickLine={false}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: "#5a6a7a", fontSize: 9 }}
                tickCount={5}
                axisLine={false}
              />

              {/* Baseline radar */}
              {showBaseline && baselineMetrics && (
                <Radar
                  name="Baseline"
                  dataKey="baseline"
                  stroke={BASELINE_COLOR.stroke}
                  fill={BASELINE_COLOR.fill}
                  fillOpacity={hoveredExperiment === "baseline" ? 0.25 : 0.1}
                  strokeWidth={hoveredExperiment === "baseline" ? 2.5 : 1.5}
                  strokeDasharray="4 4"
                  isAnimationActive={false}
                />
              )}

              {/* Selected experiment radars */}
              {selectedExperiments.map((exp, idx) => {
                const color = getColorForExperiment(exp.id);
                const isHovered = hoveredExperiment === exp.id;

                return (
                  <Radar
                    key={exp.id}
                    name={exp.shortId}
                    dataKey={exp.id}
                    stroke={color.stroke}
                    fill={color.fill}
                    fillOpacity={isHovered ? 0.35 : 0.15}
                    strokeWidth={isHovered ? 2.5 : 2}
                    isAnimationActive={false}
                  />
                );
              })}

              <Tooltip
                contentStyle={{
                  backgroundColor: "#0d1117",
                  border: "1px solid #1e3a4f",
                  borderRadius: "8px",
                  fontSize: "11px",
                  padding: "8px 12px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                }}
                labelStyle={{ color: "#c5d5e5", fontWeight: 600, marginBottom: "4px" }}
                formatter={(value, name) => {
                  if (typeof value !== "number") return [String(value), String(name)];
                  const displayName = name === "baseline"
                    ? "Baseline"
                    : experiments.find((e) => e.id === name)?.shortId || String(name);
                  return [`${value.toFixed(1)}%`, displayName];
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Legend / Stats comparison */}
      {selectedExperiments.length > 0 && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {["Success Rate", "Retention", "Avg Return", "Episodes", "Type"].map((stat) => (
              <div key={stat} className="bg-[#0d1117] rounded px-3 py-2">
                <div className="text-[9px] uppercase tracking-wider text-[#5a6a7a] mb-1.5">
                  {stat}
                </div>
                <div className="space-y-1">
                  {showBaseline && baselineMetrics && stat !== "Episodes" && stat !== "Type" && (
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span className="text-[#5a6a7a]">base</span>
                      </div>
                      <span className="font-mono text-red-400">
                        {stat === "Success Rate" && `${(baselineMetrics.successRate * 100).toFixed(0)}%`}
                        {stat === "Retention" && `${((1 - baselineMetrics.hangupRate) * 100).toFixed(0)}%`}
                        {stat === "Avg Return" && baselineMetrics.avgReturn.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {selectedExperiments.slice(0, 3).map((exp) => {
                    const color = getColorForExperiment(exp.id);
                    return (
                      <div key={exp.id} className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: color.fill }}
                          />
                          <span className="text-[#5a6a7a] truncate max-w-[60px]">
                            {exp.shortId.slice(0, 8)}
                          </span>
                        </div>
                        <span className="font-mono" style={{ color: color.fill }}>
                          {stat === "Success Rate" && `${(exp.successRate * 100).toFixed(0)}%`}
                          {stat === "Retention" && `${((1 - exp.metrics.hangupRate) * 100).toFixed(0)}%`}
                          {stat === "Avg Return" && exp.avgReturn.toFixed(2)}
                          {stat === "Episodes" && exp.episodesTrained}
                          {stat === "Type" && (exp.learnerType === "qlearning" ? "Q-Learn" : "Bandit")}
                        </span>
                      </div>
                    );
                  })}
                  {selectedExperiments.length > 3 && (
                    <div className="text-[9px] text-[#5a6a7a]">
                      +{selectedExperiments.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {selectedExperiments.length === 0 && !showBaseline && (
        <div className="px-4 pb-8 pt-4 text-center">
          <div className="text-[#5a6a7a] text-sm">
            Select experiments to compare
          </div>
          <button
            onClick={() => setIsPickerOpen(true)}
            className="mt-2 text-xs text-[#00d4ff] hover:underline"
          >
            Add Version →
          </button>
        </div>
      )}
    </div>
  );
}
