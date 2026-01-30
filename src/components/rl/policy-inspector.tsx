"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { PolicyData, QValueEntry } from "./types";

interface PolicyInspectorProps {
  policyData?: PolicyData;
}

// Sample Q-values for demo
const SAMPLE_QVALUES: QValueEntry[] = [
  { stateKey: "fsm:OPENING|...", fsmState: "OPENING", actionValues: { PROCEED: 0.15, ASK_CLARIFY: -0.05, HANDLE_PUSHBACK: -0.12 } },
  { stateKey: "fsm:DISCLOSURE|...", fsmState: "DISCLOSURE", actionValues: { IDENTIFY_SELF: 0.22, ASK_CLARIFY: 0.05, PROCEED: 0.18 } },
  { stateKey: "fsm:NEGOTIATION|sent:POSITIVE|...", fsmState: "NEGOTIATION", actionValues: { EMPATHIZE: 0.12, OFFER_PLAN: 0.35, COUNTER_OFFER: 0.28, REQUEST_CALLBACK: 0.08, PROCEED: 0.15 } },
  { stateKey: "fsm:NEGOTIATION|sent:NEGATIVE|...", fsmState: "NEGOTIATION", actionValues: { EMPATHIZE: 0.32, OFFER_PLAN: 0.15, COUNTER_OFFER: 0.18, REQUEST_CALLBACK: 0.22, PROCEED: 0.05 } },
  { stateKey: "fsm:PAYMENT_SETUP|...", fsmState: "PAYMENT_SETUP", actionValues: { CONFIRM_PLAN: 0.28, SEND_PAYMENT_LINK: 0.42, ASK_CLARIFY: 0.08, PROCEED: 0.35 } },
];

const SAMPLE_POLICY: PolicyData = {
  type: "qlearning",
  qValues: SAMPLE_QVALUES,
  greedyPolicy: {
    "fsm:OPENING|...": "PROCEED",
    "fsm:DISCLOSURE|...": "IDENTIFY_SELF",
    "fsm:NEGOTIATION|sent:POSITIVE|...": "OFFER_PLAN",
    "fsm:NEGOTIATION|sent:NEGATIVE|...": "EMPATHIZE",
    "fsm:PAYMENT_SETUP|...": "SEND_PAYMENT_LINK",
  },
  episodesTrained: 500,
};

// Color scale for Q-values
const getQValueColor = (value: number, min: number, max: number) => {
  const range = max - min || 1;
  const normalized = (value - min) / range;

  if (normalized > 0.7) return "#10b981"; // emerald
  if (normalized > 0.4) return "#3b82f6"; // blue
  if (normalized > 0.2) return "#6366f1"; // indigo
  return "#71717a"; // zinc
};

export function PolicyInspector({ policyData = SAMPLE_POLICY }: PolicyInspectorProps) {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"heatmap" | "bars">("bars");

  // Get unique FSM states
  const fsmStates = useMemo(() => {
    if (!policyData.qValues) return [];
    const states = new Set(policyData.qValues.map((q) => q.fsmState));
    return Array.from(states);
  }, [policyData]);

  // Get all actions across all states
  const allActions = useMemo(() => {
    if (!policyData.qValues) return [];
    const actions = new Set<string>();
    policyData.qValues.forEach((q) => {
      Object.keys(q.actionValues).forEach((a) => actions.add(a));
    });
    return Array.from(actions).sort();
  }, [policyData]);

  // Get Q-values for selected state
  const selectedQValues = useMemo(() => {
    if (!selectedState || !policyData.qValues) return null;
    return policyData.qValues.find((q) => q.stateKey === selectedState);
  }, [selectedState, policyData]);

  // Prepare bar chart data for selected state
  const barChartData = useMemo(() => {
    if (!selectedQValues) return [];
    return Object.entries(selectedQValues.actionValues)
      .map(([action, value]) => ({ action, value }))
      .sort((a, b) => b.value - a.value);
  }, [selectedQValues]);

  // Get global min/max for color scale
  const [globalMin, globalMax] = useMemo(() => {
    if (!policyData.qValues) return [0, 1];
    let min = Infinity;
    let max = -Infinity;
    policyData.qValues.forEach((q) => {
      Object.values(q.actionValues).forEach((v) => {
        if (v < min) min = v;
        if (v > max) max = v;
      });
    });
    return [min, max];
  }, [policyData]);

  // Prepare action preferences per FSM state
  const actionPreferences = useMemo(() => {
    if (!policyData.qValues) return [];

    const byFsmState = new Map<string, { action: string; avgValue: number }[]>();

    policyData.qValues.forEach((q) => {
      const entries = Object.entries(q.actionValues).map(([action, value]) => ({
        action,
        avgValue: value,
      }));

      if (!byFsmState.has(q.fsmState)) {
        byFsmState.set(q.fsmState, []);
      }

      // Merge values
      entries.forEach((e) => {
        const existing = byFsmState.get(q.fsmState)!.find((x) => x.action === e.action);
        if (existing) {
          existing.avgValue = (existing.avgValue + e.avgValue) / 2;
        } else {
          byFsmState.get(q.fsmState)!.push(e);
        }
      });
    });

    return Array.from(byFsmState.entries()).map(([fsmState, actions]) => ({
      fsmState,
      actions: actions.sort((a, b) => b.avgValue - a.avgValue),
      bestAction: actions.sort((a, b) => b.avgValue - a.avgValue)[0]?.action,
    }));
  }, [policyData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Policy Inspector</h2>
          <p className="text-sm text-zinc-500">
            {policyData.type === "qlearning" ? "Q-Learning" : "Contextual Bandit"} ·{" "}
            {policyData.episodesTrained} episodes trained
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("bars")}
            className={`px-3 py-1.5 text-sm rounded ${
              viewMode === "bars"
                ? "bg-blue-500 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-300"
            }`}
          >
            Bar Chart
          </button>
          <button
            onClick={() => setViewMode("heatmap")}
            className={`px-3 py-1.5 text-sm rounded ${
              viewMode === "heatmap"
                ? "bg-blue-500 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-300"
            }`}
          >
            Heatmap
          </button>
        </div>
      </div>

      {/* Action Preferences by FSM State */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">
          Action Preferences by State
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {actionPreferences.map((item) => (
            <div
              key={item.fsmState}
              className="bg-zinc-800/50 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-zinc-300">
                  {item.fsmState}
                </span>
                <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                  {item.bestAction}
                </span>
              </div>
              <div className="space-y-1">
                {item.actions.slice(0, 4).map((a, i) => (
                  <div key={a.action} className="flex items-center gap-2">
                    <div
                      className="h-2 rounded"
                      style={{
                        width: `${Math.max(10, ((a.avgValue - globalMin) / (globalMax - globalMin)) * 100)}%`,
                        backgroundColor: getQValueColor(a.avgValue, globalMin, globalMax),
                      }}
                    />
                    <span className="text-xs text-zinc-500 truncate flex-1">
                      {a.action}
                    </span>
                    <span className="text-xs font-mono text-zinc-400">
                      {a.avgValue.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Q-Value Heatmap or State Detail */}
      {viewMode === "heatmap" ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">
            Q-Value Heatmap (State × Action)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left text-zinc-500 font-normal p-2 border-b border-zinc-800">
                    State
                  </th>
                  {allActions.slice(0, 8).map((action) => (
                    <th
                      key={action}
                      className="text-left text-zinc-500 font-normal p-2 border-b border-zinc-800 text-xs"
                    >
                      {action.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {policyData.qValues?.slice(0, 10).map((q) => (
                  <tr key={q.stateKey} className="border-b border-zinc-800/50">
                    <td className="p-2 text-zinc-400 text-xs max-w-48 truncate">
                      {q.fsmState}
                    </td>
                    {allActions.slice(0, 8).map((action) => {
                      const value = q.actionValues[action];
                      return (
                        <td key={action} className="p-1">
                          {value !== undefined ? (
                            <div
                              className="w-full h-8 rounded flex items-center justify-center text-xs font-mono"
                              style={{
                                backgroundColor: getQValueColor(value, globalMin, globalMax) + "40",
                                color: getQValueColor(value, globalMin, globalMax),
                              }}
                            >
                              {value.toFixed(2)}
                            </div>
                          ) : (
                            <div className="w-full h-8 rounded bg-zinc-800/30" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Color legend */}
          <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
            <span>Low</span>
            <div className="flex-1 h-2 rounded bg-gradient-to-r from-zinc-600 via-indigo-500 to-emerald-500" />
            <span>High</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* State Selector */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-4">
              Select State to Inspect
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {policyData.qValues?.map((q) => (
                <button
                  key={q.stateKey}
                  onClick={() => setSelectedState(q.stateKey)}
                  className={`w-full text-left p-2 rounded text-sm transition-colors ${
                    selectedState === q.stateKey
                      ? "bg-blue-500/20 border border-blue-500/30 text-blue-400"
                      : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  <div className="font-medium">{q.fsmState}</div>
                  <div className="text-xs text-zinc-500 truncate">
                    {q.stateKey}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Q-Values Bar Chart */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-4">
              {selectedQValues
                ? `Q-Values for ${selectedQValues.fsmState}`
                : "Select a state"}
            </h3>
            {selectedQValues ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                    <XAxis
                      type="number"
                      stroke="#52525b"
                      tick={{ fill: "#71717a", fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="action"
                      stroke="#52525b"
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        border: "1px solid #27272a",
                        borderRadius: "6px",
                        fontSize: "12px",
                      }}
                      formatter={(value) => [(value as number).toFixed(3), "Q-Value"]}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {barChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={getQValueColor(entry.value, globalMin, globalMax)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-zinc-500">
                Select a state to view Q-values
              </div>
            )}
          </div>
        </div>
      )}

      {/* Greedy Policy Summary */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">
          Greedy Policy Summary
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(policyData.greedyPolicy).map(([state, action]) => {
            const fsmState = state.match(/fsm:(\w+)/)?.[1] || state;
            return (
              <div
                key={state}
                className="bg-zinc-800/50 rounded p-2 text-center"
              >
                <div className="text-xs text-zinc-500 mb-1">{fsmState}</div>
                <div className="text-sm text-emerald-400 font-medium">
                  {action}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
