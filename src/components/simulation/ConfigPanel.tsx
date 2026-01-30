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

interface ConfigPanelProps {
  onStart: (config: { personaId: string; policyType: string }) => void;
  onStop: () => void;
  isRunning: boolean;
  disabled?: boolean;
}

export function ConfigPanel({ onStart, onStop, isRunning, disabled }: ConfigPanelProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string>("");
  const [policyType, setPolicyType] = useState<string>("none");

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

  const selectedPersonaData = personas.find((p) => p.id === selectedPersona);

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
            onClick={() => onStart({ personaId: selectedPersona, policyType })}
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
