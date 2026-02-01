"use client";

import React, { useState, useEffect } from "react";
import { LearningDashboard } from "@/components/rl/learning-dashboard";
import { EpisodeExplorer } from "@/components/rl/episode-explorer";
import { PolicyInspector } from "@/components/rl/policy-inspector";
import { TopNav } from "@/components/nav/TopNav";
import { LineChart, Film, Target } from "lucide-react";
import type { ReactNode } from "react";
import type { ExperimentVersion } from "@/components/rl/experiment-radar";

type TabId = "dashboard" | "episodes" | "policy";

interface TabConfig {
  id: TabId;
  label: string;
  icon: ReactNode;
}

const TABS: TabConfig[] = [
  { id: "dashboard", label: "Learning", icon: <LineChart className="w-3.5 h-3.5" strokeWidth={1.5} /> },
  { id: "episodes", label: "Episodes", icon: <Film className="w-3.5 h-3.5" strokeWidth={1.5} /> },
  { id: "policy", label: "Policy", icon: <Target className="w-3.5 h-3.5" strokeWidth={1.5} /> },
];

interface Experiment {
  id: string;
  type: "training" | "voice-simulation";
  learnerType: string | null;
  createdAt: string;
  trainTimeMs: number | null;
  totalEpisodes: number;
  avgReturn: number;
  successRate: number;
  finalMetrics?: {
    avgReturn: number;
    stdReturn?: number;
    successRate: number;
    partialSuccessRate?: number;
    avgLength?: number;
    hangupRate?: number;
    escalationRate?: number;
  } | null;
}

interface ExperimentDetail {
  id: string;
  type: "training" | "voice-simulation";
  learnerType: string | null;
  createdAt: string;
  trainTimeMs: number | null;
  config: object | null;
  finalMetrics: {
    avgReturn: number;
    stdReturn?: number;
    successRate: number;
    partialSuccessRate?: number;
    avgLength?: number;
    hangupRate?: number;
    escalationRate?: number;
  } | null;
  learnerState: string | null;
  learningCurve: Array<{
    episode: number;
    trainReturn: number | null;
    evalReturn: number | null;
    evalSuccessRate: number | null;
  }>;
  episodes: Array<{
    id: string;
    episodeNum: number;
    personaId: string | null;
    personaName: string | null;
    outcome: string | null;
    totalReturn: number | null;
    turns: number | null;
  }>;
}

export default function RLDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("episodes");
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>("");
  const [experimentDetail, setExperimentDetail] = useState<ExperimentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load experiments list from database
  useEffect(() => {
    async function fetchExperiments() {
      try {
        const res = await fetch("/api/experiments?action=list");
        const data = await res.json();
        setExperiments(data.experiments || []);
        // Auto-select first experiment
        if (data.experiments?.length > 0 && !selectedExperimentId) {
          setSelectedExperimentId(data.experiments[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch experiments:", error);
        setExperiments([]);
      }
    }
    fetchExperiments();
  }, []);

  // Load experiment details when selected
  useEffect(() => {
    if (!selectedExperimentId) {
      setExperimentDetail(null);
      return;
    }

    async function loadExperiment() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/experiments?action=get&id=${encodeURIComponent(selectedExperimentId)}`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setExperimentDetail(data);
      } catch (error) {
        console.error("Failed to load experiment:", error);
        setExperimentDetail(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadExperiment();
  }, [selectedExperimentId]);

  // Transform learning curve for LearningDashboard (convert null to undefined)
  const learningCurve = experimentDetail?.learningCurve.map((p) => ({
    episode: p.episode,
    trainReturn: p.trainReturn ?? 0,
    evalReturn: p.evalReturn ?? undefined,
    evalSuccessRate: p.evalSuccessRate ?? undefined,
  }));

  // Parse learner state for Policy Inspector
  const parsePolicyData = () => {
    if (!experimentDetail?.learnerState) return undefined;
    try {
      const state = JSON.parse(experimentDetail.learnerState);
      const learnerType = experimentDetail.learnerType as "bandit" | "qlearning";

      if (learnerType === "bandit" && state.weights) {
        // Convert bandit weights to qValues format for PolicyInspector
        // Create synthetic entries per FSM state with average weight as "value"
        const fsmStates = ["OPENING", "DISCLOSURE", "IDENTITY_VERIFICATION", "NEGOTIATION", "PAYMENT_SETUP", "WRAPUP"];
        const qValues = fsmStates.map((fsmState) => {
          const actionValues: Record<string, number> = {};
          for (const [action, weights] of Object.entries(state.weights)) {
            const weightArray = weights as number[];
            // Use average of weights as action value
            actionValues[action] = weightArray.reduce((a, b) => a + b, 0) / weightArray.length;
          }
          return {
            stateKey: `fsm:${fsmState}`,
            fsmState,
            actionValues,
          };
        });

        // Build greedy policy
        const greedyPolicy: Record<string, string> = {};
        for (const entry of qValues) {
          let bestAction = "";
          let bestValue = -Infinity;
          for (const [action, value] of Object.entries(entry.actionValues)) {
            if (value > bestValue) {
              bestValue = value;
              bestAction = action;
            }
          }
          greedyPolicy[entry.stateKey] = bestAction;
        }

        return {
          type: "bandit" as const,
          qValues,
          greedyPolicy,
          episodesTrained: state.episodesTrained || experimentDetail.episodes.length,
        };
      }

      if (learnerType === "qlearning" && state.qTable) {
        // Convert Q-table to qValues format
        const qValues = Object.entries(state.qTable).map(([stateKey, actions]) => ({
          stateKey,
          fsmState: stateKey.split("|")[0]?.replace("fsm:", "") || "UNKNOWN",
          actionValues: actions as Record<string, number>,
        }));

        const greedyPolicy: Record<string, string> = {};
        for (const entry of qValues) {
          let bestAction = "";
          let bestValue = -Infinity;
          for (const [action, value] of Object.entries(entry.actionValues)) {
            if (value > bestValue) {
              bestValue = value;
              bestAction = action;
            }
          }
          greedyPolicy[entry.stateKey] = bestAction;
        }

        return {
          type: "qlearning" as const,
          qValues,
          greedyPolicy,
          episodesTrained: state.episodesTrained || experimentDetail.episodes.length,
        };
      }

      return undefined;
    } catch (e) {
      console.error("Failed to parse learner state:", e);
      return undefined;
    }
  };

  const policyData = parsePolicyData();

  // Transform experiments to ExperimentVersion format for radar chart
  const experimentVersions: ExperimentVersion[] = experiments
    .filter((exp) => exp.learnerType) // Only include RL experiments
    .map((exp) => {
      const shortId = (() => {
        const parts = exp.id.split("-");
        if (parts.length >= 4) {
          const type = parts[0].slice(0, 6);
          const dateMatch = exp.id.match(/(\d{4})-(\d{2})-(\d{2})T?(\d{2})?-?(\d{2})?/);
          if (dateMatch) {
            return `${type}-${dateMatch[2]}${dateMatch[3]}-${dateMatch[4] || "00"}${dateMatch[5] || "00"}`;
          }
        }
        return exp.id.slice(0, 12);
      })();

      const fm = exp.finalMetrics;

      return {
        id: exp.id,
        shortId,
        learnerType: (exp.learnerType as "bandit" | "qlearning") || "baseline",
        episodesTrained: exp.totalEpisodes,
        successRate: fm?.successRate ?? exp.successRate,
        avgReturn: fm?.avgReturn ?? exp.avgReturn,
        createdAt: exp.createdAt,
        metrics: {
          numEpisodes: exp.totalEpisodes,
          avgReturn: fm?.avgReturn ?? exp.avgReturn,
          stdReturn: fm?.stdReturn ?? 0,
          successRate: fm?.successRate ?? exp.successRate,
          partialSuccessRate: fm?.partialSuccessRate ?? 0,
          avgLength: fm?.avgLength ?? 0,
          hangupRate: fm?.hangupRate ?? 0,
          escalationRate: fm?.escalationRate ?? 0,
        },
      };
    });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <TopNav />

      {/* Page toolbar with tabs and controls */}
      <div className="bg-[#080b10]">
        <div className="px-6 flex items-center justify-between h-10">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  relative px-3 h-10 flex items-center gap-2 text-xs font-medium transition-colors
                  ${activeTab === tab.id
                    ? "text-[#00d4ff]"
                    : "text-[#5a6a7a] hover:text-[#8a9aaa]"
                  }
                `}
              >
                <span className={activeTab === tab.id ? "opacity-100" : "opacity-60"}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-2 right-2 h-px bg-[#00d4ff]" />
                )}
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Loading...
              </div>
            )}
            <select
              value={selectedExperimentId}
              onChange={(e) => setSelectedExperimentId(e.target.value)}
              className="bg-[#0a0e14] border border-[#1e3a4f]/60 rounded px-2 py-1 text-xs text-[#8a9aaa] focus:outline-none focus:border-[#00d4ff]/50 min-w-[200px]"
            >
              <option value="">Select experiment...</option>
              {experiments.map((exp) => (
                <option key={exp.id} value={exp.id}>
                  {exp.type === "voice-simulation" ? "🎤 " : "📊 "}
                  {exp.id.slice(0, 30)}... ({exp.totalEpisodes} eps)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="px-6 py-6">
        {activeTab === "dashboard" && (
          <LearningDashboard
            learningCurve={learningCurve}
            evalResults={[]}
            finalMetrics={experimentDetail?.finalMetrics ? {
              numEpisodes: experimentDetail.episodes.length,
              avgReturn: experimentDetail.finalMetrics.avgReturn,
              stdReturn: experimentDetail.finalMetrics.stdReturn ?? 0,
              successRate: experimentDetail.finalMetrics.successRate,
              partialSuccessRate: experimentDetail.finalMetrics.partialSuccessRate ?? 0,
              avgLength: experimentDetail.finalMetrics.avgLength ?? 0,
              hangupRate: experimentDetail.finalMetrics.hangupRate ?? 0,
              escalationRate: experimentDetail.finalMetrics.escalationRate ?? 0,
            } : undefined}
            trainTimeMs={experimentDetail?.trainTimeMs ?? undefined}
            learnerType={experimentDetail?.learnerType as "bandit" | "qlearning" | undefined}
            allExperiments={experimentVersions}
            onExperimentSelect={(id) => setSelectedExperimentId(id)}
          />
        )}

        {activeTab === "episodes" && (
          <EpisodeExplorer
            experimentId={selectedExperimentId}
            episodes={experimentDetail?.episodes}
          />
        )}

        {activeTab === "policy" && (
          <PolicyInspector policyData={policyData} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#080b10] mt-auto">
        <div className="px-6 py-3 flex items-center justify-between text-[10px] text-[#5a6a7a]">
          <span>RL Environment for Debt Collection Agents</span>
          <span>Q-Learning & Contextual Bandits</span>
        </div>
      </footer>
    </div>
  );
}
