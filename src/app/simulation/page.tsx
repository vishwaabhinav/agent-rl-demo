"use client";

import { useCallback, useMemo } from "react";
import { ConfigPanel } from "@/components/simulation/ConfigPanel";
import { DualTranscript } from "@/components/simulation/DualTranscript";
import { DecisionInspector } from "@/components/simulation/DecisionInspector";
import { PathProgress } from "@/components/simulation/PathProgress";
import { AudioPlayer } from "@/components/simulation/AudioPlayer";
import { TopNav } from "@/components/nav/TopNav";
import { useSimulationSocket } from "@/hooks/useSimulationSocket";
import { useStereoAudioPlayback } from "@/hooks/useStereoAudioPlayback";

export default function SimulationPage() {
  // Audio playback with turn-taking
  const {
    isPlaying: isAudioPlaying,
    playbackTimestamp,
    queueAgentAudio,
    queueBorrowerAudio,
    setCurrentSpeaker,
    hasQueuedAudio,
    agentVolume,
    setAgentVolume,
    borrowerVolume,
    setBorrowerVolume,
    clearQueue: clearAudioQueue,
    revealAllText,
  } = useStereoAudioPlayback({ enabled: true });

  // Audio callbacks for socket - sets current speaker on speech start for turn-taking
  const audioCallbacks = useMemo(
    () => ({
      onAgentAudio: queueAgentAudio,
      onBorrowerAudio: queueBorrowerAudio,
      onAgentSpeechStart: () => setCurrentSpeaker("agent"),
      onBorrowerSpeechStart: () => setCurrentSpeaker("borrower"),
    }),
    [queueAgentAudio, queueBorrowerAudio, setCurrentSpeaker]
  );

  // Simulation socket connection
  const {
    simulationId,
    status,
    personaPath,
    agentState,
    borrowerPathIndex,
    messages,
    decisions,
    agentPending,
    borrowerPending,
    error,
    result,
    isConnected,
    startSimulation,
    stopSimulation,
    resetSimulation,
  } = useSimulationSocket(audioCallbacks);

  // Consider simulation "running" if status is active OR if audio is still playing
  const isAudioStillPlaying = isAudioPlaying || hasQueuedAudio();
  const isRunning = status === "starting" || status === "active" || (status === "completed" && isAudioStillPlaying);

  // Filter and transform messages for DualTranscript - sync with audio playback
  const transcriptMessages = useMemo(() => {
    // Show all messages when idle (before start) or when audio finished
    const showAll = status === "idle" || (status === "completed" && !isAudioStillPlaying);

    return messages
      .filter((m) => showAll || m.receivedAt <= playbackTimestamp)
      .map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
  }, [messages, playbackTimestamp, status, isAudioStillPlaying]);

  const handleStart = useCallback(
    (config: { personaId: string; policyType: string; policyId?: string }) => {
      clearAudioQueue();
      startSimulation(config);
    },
    [clearAudioQueue, startSimulation]
  );

  const handleStop = useCallback(() => {
    stopSimulation();
    clearAudioQueue();
  }, [stopSimulation, clearAudioQueue]);

  function getStatusStyle(s: string): string {
    switch (s) {
      case "active":
        return "bg-emerald-500/20 text-emerald-400";
      case "starting":
        return "bg-amber-500/20 text-amber-400";
      case "completed":
        return "bg-blue-500/20 text-blue-400";
      case "error":
        return "bg-red-500/20 text-red-400";
      default:
        return "bg-zinc-800 text-zinc-400";
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <TopNav />

      {/* Main Content */}
      <main className="px-6 py-6">
        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Result Display - show "finishing" while audio still playing */}
        {result && status === "completed" && isAudioStillPlaying && (
          <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <h3 className="text-sm font-medium text-amber-400 mb-2">Finishing audio playback...</h3>
          </div>
        )}

        {/* Final result - only show when audio is done */}
        {result && status === "completed" && !isAudioStillPlaying && (
          <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <h3 className="text-sm font-medium text-blue-400 mb-2">Simulation Complete</h3>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-zinc-500">Outcome:</span>{" "}
                <span className="text-zinc-300">{result.outcome}</span>
              </div>
              <div>
                <span className="text-zinc-500">Final State:</span>{" "}
                <span className="text-zinc-300">{result.finalState}</span>
              </div>
              <div>
                <span className="text-zinc-500">Turns:</span>{" "}
                <span className="text-zinc-300">{result.totalTurns}</span>
              </div>
              <div>
                <span className="text-zinc-500">Duration:</span>{" "}
                <span className="text-zinc-300">
                  {(result.totalDurationMs / 1000).toFixed(1)}s
                </span>
              </div>
            </div>
            <button
              onClick={resetSimulation}
              className="mt-3 text-xs text-blue-400 hover:text-blue-300"
            >
              Start New Simulation
            </button>
          </div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - Config */}
          <div className="col-span-3 space-y-4">
            <ConfigPanel
              onStart={handleStart}
              onStop={handleStop}
              isRunning={isRunning}
              disabled={!isConnected}
            />
            <PathProgress
              path={personaPath}
              currentIndex={borrowerPathIndex}
              agentState={agentState}
            />
          </div>

          {/* Middle Column - Transcripts */}
          <div className="col-span-6">
            <div className="h-[500px]">
              <DualTranscript
                messages={transcriptMessages}
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
              isDeciding={status === "active" && decisions.length > 0}
            />
            <AudioPlayer
              isPlaying={isAudioPlaying && isRunning}
              agentVolume={agentVolume}
              borrowerVolume={borrowerVolume}
              onAgentVolumeChange={setAgentVolume}
              onBorrowerVolumeChange={setBorrowerVolume}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
