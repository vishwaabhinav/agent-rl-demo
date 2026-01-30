"use client";

import React, { useState, useEffect } from "react";
import { LearningDashboard } from "@/components/rl/learning-dashboard";
import { EpisodeExplorer } from "@/components/rl/episode-explorer";
import { PolicyInspector } from "@/components/rl/policy-inspector";
import { TopNav } from "@/components/nav/TopNav";
import type {
  LearningCurvePoint,
  AggregateMetrics,
  Episode,
  PolicyData,
  EvalResult,
} from "@/components/rl/types";

type TabId = "dashboard" | "episodes" | "policy";

interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { id: "dashboard", label: "Learning Dashboard", icon: "📈" },
  { id: "episodes", label: "Episode Explorer", icon: "🎬" },
  { id: "policy", label: "Policy Inspector", icon: "🎯" },
];

interface ExperimentData {
  learningCurve: LearningCurvePoint[];
  evalResults: EvalResult[];
  finalMetrics: AggregateMetrics;
  trainTimeMs: number;
  numEpisodes: number;
  learnerType: "bandit" | "qlearning";
  episodes?: Episode[];
  policy?: PolicyData;
}

export default function RLDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [experimentData, setExperimentData] = useState<ExperimentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);

  // Load available result files
  useEffect(() => {
    async function fetchFiles() {
      try {
        const res = await fetch("/api/rl-experiments");
        const data = await res.json();
        setAvailableFiles(data.files || []);
      } catch (error) {
        console.error("Failed to fetch experiments:", error);
        setAvailableFiles([]);
      }
    }
    fetchFiles();
  }, []);

  // Load experiment data when file selected
  useEffect(() => {
    if (!selectedFile) {
      setExperimentData(null);
      return;
    }

    async function loadExperiment() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/rl-experiments?file=${encodeURIComponent(selectedFile)}`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setExperimentData(data);
      } catch (error) {
        console.error("Failed to load experiment:", error);
        setExperimentData(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadExperiment();
  }, [selectedFile]);

  function renderStatusIndicator(): React.ReactNode {
    if (isLoading) {
      return (
        <>
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-zinc-400">Loading...</span>
        </>
      );
    }
    if (experimentData) {
      return (
        <>
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-zinc-400">Ready</span>
        </>
      );
    }
    return (
      <>
        <div className="w-2 h-2 rounded-full bg-zinc-600" />
        <span className="text-zinc-500">No data</span>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <TopNav
        title="RL Training Dashboard"
        description="Debt Collection Agent Learning Analytics"
        statusIndicator={
          <div className="flex items-center gap-2 text-sm">
            {renderStatusIndicator()}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-500">Experiment:</label>
            <select
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="">Select experiment...</option>
              {availableFiles.map((file) => (
                <option key={file} value={file}>
                  {file.replace(".json", "")}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* Tab Navigation */}
      <div className="border-b border-zinc-800 bg-zinc-900/30">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === tab.id
                    ? "bg-zinc-800 text-zinc-100 border-t border-x border-zinc-700"
                    : "text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "dashboard" && (
          <LearningDashboard
            learningCurve={experimentData?.learningCurve}
            evalResults={experimentData?.evalResults}
            finalMetrics={experimentData?.finalMetrics}
            trainTimeMs={experimentData?.trainTimeMs}
            learnerType={experimentData?.learnerType}
          />
        )}

        {activeTab === "episodes" && (
          <EpisodeExplorer episodes={experimentData?.episodes} />
        )}

        {activeTab === "policy" && (
          <PolicyInspector policyData={experimentData?.policy} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-zinc-900/30 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              RL Environment for Debt Collection Agents
            </span>
            <span>
              Built with Q-Learning & Contextual Bandits
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
