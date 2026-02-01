"use client";

import { useState, useEffect } from "react";
import type { FSMState } from "@/lib/types";

interface Persona {
  id: string;
  name: string;
  description: string;
  pathLength: number;
  path: FSMState[];
}

interface TrainedPolicy {
  id: string;
  type: "bandit" | "qlearning" | "unknown";
  episodesTrained: number;
  successRate: number;
  avgReturn: number;
  createdAt: string;
  trainTimeMs: number | null;
}

interface ConfigPanelProps {
  onStart: (config: {
    personaId: string;
    policyType: string;
    policyId?: string;
  }) => void;
  onStop: () => void;
  isRunning: boolean;
  disabled?: boolean;
}

export function ConfigPanel({ onStart, onStop, isRunning, disabled }: ConfigPanelProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [policies, setPolicies] = useState<TrainedPolicy[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string>("");
  const [policyType, setPolicyType] = useState<string>("none");
  const [selectedPolicy, setSelectedPolicy] = useState<string>("");

  // Load personas
  useEffect(() => {
    fetch("/api/simulation?action=personas")
      .then((res) => res.json())
      .then((data) => {
        setPersonas(data.personas || []);
        if (data.personas?.length > 0) {
          setSelectedPersona(data.personas[0].id);
        }
      })
      .catch(console.error);
  }, []);

  // Load available trained policies from database
  useEffect(() => {
    fetch("/api/simulation?action=policies")
      .then((res) => res.json())
      .then((data) => {
        setPolicies(data.policies || []);
      })
      .catch(console.error);
  }, []);

  // Filter policies by type
  const filteredPolicies = policies.filter((p) => {
    if (policyType === "bandit") return p.type === "bandit";
    if (policyType === "qlearning") return p.type === "qlearning";
    return false;
  });

  // Reset policy selection when policy type changes
  useEffect(() => {
    setSelectedPolicy("");
  }, [policyType]);

  const selectedPersonaData = personas.find((p) => p.id === selectedPersona);

  const handleStart = () => {
    onStart({
      personaId: selectedPersona,
      policyType,
      policyId: policyType !== "none" ? selectedPolicy || undefined : undefined,
    });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-medium text-zinc-300">Configuration</h3>

      {/* Persona Selection */}
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Persona</label>
        <select
          value={selectedPersona}
          onChange={(e) => setSelectedPersona(e.target.value)}
          disabled={isRunning || disabled}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-300"
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {selectedPersonaData && (
          <p className="text-xs text-zinc-500 mt-1">{selectedPersonaData.description}</p>
        )}
      </div>

      {/* Policy Selection */}
      <div>
        <label className="block text-xs text-zinc-500 mb-1">RL Policy</label>
        <div className="space-y-1">
          {[
            { value: "none", label: "None (Baseline)" },
            { value: "bandit", label: "Contextual Bandit" },
            { value: "qlearning", label: "Q-Learning" },
          ].map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-zinc-400">
              <input
                type="radio"
                name="policy"
                value={option.value}
                checked={policyType === option.value}
                onChange={(e) => setPolicyType(e.target.value)}
                disabled={isRunning || disabled}
                className="accent-blue-500"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      {/* Policy Selection (when policy type is not "none") */}
      {policyType !== "none" && (
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Load Trained Policy
          </label>
          <select
            value={selectedPolicy}
            onChange={(e) => setSelectedPolicy(e.target.value)}
            disabled={isRunning || disabled}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-300"
          >
            <option value="">Fresh (untrained)</option>
            {filteredPolicies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id.slice(0, 25)}... ({p.episodesTrained} eps, {(p.successRate * 100).toFixed(0)}% success)
              </option>
            ))}
          </select>
          {filteredPolicies.length === 0 && (
            <p className="text-xs text-zinc-500 mt-1">
              No trained {policyType} policies found. Run training first.
            </p>
          )}
          {selectedPolicy && (
            <div className="mt-2 p-2 bg-zinc-800/50 rounded text-xs text-zinc-400">
              <div>Episodes: {filteredPolicies.find(p => p.id === selectedPolicy)?.episodesTrained}</div>
              <div>Success: {((filteredPolicies.find(p => p.id === selectedPolicy)?.successRate || 0) * 100).toFixed(1)}%</div>
              <div>Avg Return: {(filteredPolicies.find(p => p.id === selectedPolicy)?.avgReturn || 0).toFixed(3)}</div>
            </div>
          )}
        </div>
      )}

      {/* Path Preview */}
      {selectedPersonaData && selectedPersonaData.path && (
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Path ({selectedPersonaData.pathLength} states)
          </label>
          <div className="flex flex-wrap gap-1">
            {selectedPersonaData.path.map((state, i) => (
              <span
                key={i}
                className="text-xs px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400"
              >
                {state.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="pt-2">
        {!isRunning ? (
          <button
            onClick={handleStart}
            disabled={disabled || !selectedPersona}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            Start Simulation
          </button>
        ) : (
          <button
            onClick={onStop}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            Stop Simulation
          </button>
        )}
      </div>
    </div>
  );
}
