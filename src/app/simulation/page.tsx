"use client";

import { useState, useEffect } from "react";
import { ConfigPanel } from "@/components/simulation/ConfigPanel";
import { DualTranscript } from "@/components/simulation/DualTranscript";
import { DecisionInspector } from "@/components/simulation/DecisionInspector";
import { PathProgress } from "@/components/simulation/PathProgress";
import { AudioPlayer } from "@/components/simulation/AudioPlayer";
import type { FSMState } from "@/lib/types";

interface TranscriptMessage {
  id: string;
  side: "agent" | "borrower";
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

interface Decision {
  turn: number;
  selectedAction: string;
  policyDecisionMs: number;
}

interface Persona {
  id: string;
  name: string;
  description: string;
  pathLength: number;
  path: FSMState[];
}

export default function SimulationPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [agentState, setAgentState] = useState<FSMState>("OPENING");
  const [pathIndex, setPathIndex] = useState(0);
  const [currentPath, setCurrentPath] = useState<FSMState[]>([]);
  const [agentPending, setAgentPending] = useState("");
  const [borrowerPending, setBorrowerPending] = useState("");
  const [personas, setPersonas] = useState<Persona[]>([]);

  // Load personas on mount
  useEffect(() => {
    fetch("/api/simulation?action=personas")
      .then((res) => res.json())
      .then((data) => {
        setPersonas(data.personas || []);
      })
      .catch(console.error);
  }, []);

  const handleStart = (config: { personaId: string; policyType: string }) => {
    console.log("Starting simulation with config:", config);
    setIsRunning(true);
    setMessages([]);
    setDecisions([]);
    setAgentState("OPENING");
    setPathIndex(0);

    // Find selected persona and set its path
    const selectedPersona = personas.find((p) => p.id === config.personaId);
    if (selectedPersona?.path) {
      setCurrentPath(selectedPersona.path);
    }

    // TODO: Connect to Socket.IO and start simulation
    // The orchestrator would emit events that update state here
  };

  const handleStop = () => {
    console.log("Stopping simulation");
    setIsRunning(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-semibold tracking-tight">Voice Simulation</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Voice-to-voice agent simulation with RL policy injection
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - Config */}
          <div className="col-span-3 space-y-4">
            <ConfigPanel
              onStart={handleStart}
              onStop={handleStop}
              isRunning={isRunning}
            />
            <PathProgress
              path={currentPath}
              currentIndex={pathIndex}
              agentState={agentState}
            />
          </div>

          {/* Middle Column - Transcripts */}
          <div className="col-span-6">
            <div className="h-[500px]">
              <DualTranscript
                messages={messages}
                agentPending={agentPending}
                borrowerPending={borrowerPending}
              />
            </div>
          </div>

          {/* Right Column - Decision + Audio */}
          <div className="col-span-3 space-y-4">
            <DecisionInspector
              currentDecision={decisions[decisions.length - 1]}
              decisionHistory={decisions}
              isDeciding={false}
            />
            <AudioPlayer
              agentAudioQueue={[]}
              borrowerAudioQueue={[]}
              isPlaying={isRunning}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
