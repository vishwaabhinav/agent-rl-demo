"use client";

import { useState, useMemo } from "react";
import type { Episode, Transition } from "./types";

interface EpisodeExplorerProps {
  episodes?: Episode[];
}

// Sample episode data
const SAMPLE_EPISODES: Episode[] = [
  {
    episodeId: 1,
    return_: 0.35,
    length: 8,
    outcome: "PAYMENT_SETUP_COMPLETE",
    persona: {
      name: "Cooperative & Stable",
      willingnessToPay: "HIGH",
      financialSituation: "STABLE",
      temperament: "COOPERATIVE",
      debtKnowledge: "AWARE",
      patience: 8,
    },
    trajectory: {
      transitions: [
        {
          state: { fsmState: "OPENING", turnCount: 0, timeInState: 1, debtBucket: "MEDIUM", daysPastDueBucket: "90", priorAttempts: 2, identityVerified: false, disclosureComplete: false, lastSignal: null, sentiment: "NEUTRAL", objectionsRaised: 0, offersMade: 0 },
          action: "PROCEED",
          reward: -0.05,
          nextState: { fsmState: "DISCLOSURE", turnCount: 1, timeInState: 1, debtBucket: "MEDIUM", daysPastDueBucket: "90", priorAttempts: 2, identityVerified: false, disclosureComplete: false, lastSignal: "AGREEMENT", sentiment: "POSITIVE", objectionsRaised: 0, offersMade: 0 },
          done: false,
          info: { fsmTransition: { from: "OPENING", to: "DISCLOSURE", wasForced: false, reason: "Standard flow" }, agentUtterance: "Hello, may I speak with John Smith?", borrowerResponse: "Yes, this is John speaking.", detectedSignals: ["AGREEMENT"], rewardBreakdown: { shaping: 0, terminal: 0, turnPenalty: -0.05, total: -0.05 } },
        },
        {
          state: { fsmState: "DISCLOSURE", turnCount: 1, timeInState: 1, debtBucket: "MEDIUM", daysPastDueBucket: "90", priorAttempts: 2, identityVerified: false, disclosureComplete: false, lastSignal: "AGREEMENT", sentiment: "POSITIVE", objectionsRaised: 0, offersMade: 0 },
          action: "IDENTIFY_SELF",
          reward: 0.05,
          nextState: { fsmState: "IDENTITY_VERIFICATION", turnCount: 2, timeInState: 1, debtBucket: "MEDIUM", daysPastDueBucket: "90", priorAttempts: 2, identityVerified: false, disclosureComplete: true, lastSignal: null, sentiment: "NEUTRAL", objectionsRaised: 0, offersMade: 0 },
          done: false,
          info: { fsmTransition: { from: "DISCLOSURE", to: "IDENTITY_VERIFICATION", wasForced: false, reason: "Standard flow" }, agentUtterance: "This is Alex from ABC Collections. This is an attempt to collect a debt.", borrowerResponse: "Okay, I understand.", detectedSignals: [], rewardBreakdown: { shaping: 0.1, terminal: 0, turnPenalty: -0.05, total: 0.05 } },
        },
        {
          state: { fsmState: "NEGOTIATION", turnCount: 5, timeInState: 1, debtBucket: "MEDIUM", daysPastDueBucket: "90", priorAttempts: 2, identityVerified: true, disclosureComplete: true, lastSignal: null, sentiment: "NEUTRAL", objectionsRaised: 0, offersMade: 0 },
          action: "OFFER_PLAN",
          reward: 0.25,
          nextState: { fsmState: "NEGOTIATION", turnCount: 6, timeInState: 2, debtBucket: "MEDIUM", daysPastDueBucket: "90", priorAttempts: 2, identityVerified: true, disclosureComplete: true, lastSignal: "AGREEMENT", sentiment: "POSITIVE", objectionsRaised: 0, offersMade: 1 },
          done: false,
          info: { fsmTransition: { from: "NEGOTIATION", to: "NEGOTIATION", wasForced: false, reason: "Continuing negotiation" }, agentUtterance: "We can set up a payment plan. Would $833 per month work for you?", borrowerResponse: "Yes, that sounds good. Let's do it.", detectedSignals: ["AGREEMENT"], rewardBreakdown: { shaping: 0.3, terminal: 0, turnPenalty: -0.05, total: 0.25 } },
        },
      ],
      totalReturn: 0.35,
      length: 8,
      outcome: "PAYMENT_SETUP_COMPLETE",
      persona: { name: "Cooperative & Stable", willingnessToPay: "HIGH", financialSituation: "STABLE", temperament: "COOPERATIVE", debtKnowledge: "AWARE", patience: 8 },
    },
    timestamp: "2026-01-30T12:00:00Z",
  },
  {
    episodeId: 2,
    return_: -0.85,
    length: 4,
    outcome: "BORROWER_HANGUP",
    persona: {
      name: "Hostile & Disputing",
      willingnessToPay: "LOW",
      financialSituation: "STABLE",
      temperament: "HOSTILE",
      debtKnowledge: "DISPUTING",
      patience: 2,
    },
    trajectory: {
      transitions: [
        {
          state: { fsmState: "OPENING", turnCount: 0, timeInState: 1, debtBucket: "MEDIUM", daysPastDueBucket: "90", priorAttempts: 2, identityVerified: false, disclosureComplete: false, lastSignal: null, sentiment: "NEUTRAL", objectionsRaised: 0, offersMade: 0 },
          action: "PROCEED",
          reward: -0.05,
          nextState: { fsmState: "DISCLOSURE", turnCount: 1, timeInState: 1, debtBucket: "MEDIUM", daysPastDueBucket: "90", priorAttempts: 2, identityVerified: false, disclosureComplete: false, lastSignal: "HOSTILITY", sentiment: "NEGATIVE", objectionsRaised: 1, offersMade: 0 },
          done: false,
          info: { fsmTransition: { from: "OPENING", to: "DISCLOSURE", wasForced: false, reason: "Standard flow" }, agentUtterance: "Hello, may I speak with John Smith?", borrowerResponse: "What do you want? I'm busy.", detectedSignals: ["HOSTILITY"], rewardBreakdown: { shaping: 0, terminal: 0, turnPenalty: -0.05, total: -0.05 } },
        },
      ],
      totalReturn: -0.85,
      length: 4,
      outcome: "BORROWER_HANGUP",
      persona: { name: "Hostile & Disputing", willingnessToPay: "LOW", financialSituation: "STABLE", temperament: "HOSTILE", debtKnowledge: "DISPUTING", patience: 2 },
    },
    timestamp: "2026-01-30T12:01:00Z",
  },
];

export function EpisodeExplorer({ episodes = SAMPLE_EPISODES }: EpisodeExplorerProps) {
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(
    episodes[0] || null
  );
  const [filterOutcome, setFilterOutcome] = useState<string>("all");
  const [filterPersona, setFilterPersona] = useState<string>("all");

  // Get unique outcomes and personas for filters
  const outcomes = useMemo(() => {
    const set = new Set(episodes.map((e) => e.outcome));
    return ["all", ...Array.from(set)];
  }, [episodes]);

  const personas = useMemo(() => {
    const set = new Set(episodes.map((e) => e.persona.name));
    return ["all", ...Array.from(set)];
  }, [episodes]);

  // Filter episodes
  const filteredEpisodes = useMemo(() => {
    return episodes.filter((ep) => {
      if (filterOutcome !== "all" && ep.outcome !== filterOutcome) return false;
      if (filterPersona !== "all" && ep.persona.name !== filterPersona) return false;
      return true;
    });
  }, [episodes, filterOutcome, filterPersona]);

  // Outcome color
  const getOutcomeColor = (outcome: string) => {
    if (outcome.includes("PAYMENT") || outcome.includes("SUCCESS")) return "text-emerald-500";
    if (outcome.includes("HANGUP") || outcome.includes("VIOLATION")) return "text-red-500";
    if (outcome.includes("CALLBACK") || outcome.includes("PROMISE")) return "text-blue-500";
    if (outcome.includes("ESCALATE")) return "text-amber-500";
    return "text-zinc-400";
  };

  // Return color
  const getReturnColor = (value: number) => {
    if (value > 0.2) return "text-emerald-500";
    if (value > 0) return "text-emerald-400";
    if (value > -0.3) return "text-zinc-400";
    return "text-red-500";
  };

  return (
    <div className="flex h-full gap-4">
      {/* Episode List */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        {/* Filters */}
        <div className="p-3 border-b border-zinc-800 space-y-2">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Outcome</label>
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300"
            >
              {outcomes.map((o) => (
                <option key={o} value={o}>
                  {o === "all" ? "All Outcomes" : o.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Persona</label>
            <select
              value={filterPersona}
              onChange={(e) => setFilterPersona(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300"
            >
              {personas.map((p) => (
                <option key={p} value={p}>
                  {p === "all" ? "All Personas" : p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Episode List */}
        <div className="flex-1 overflow-y-auto">
          {filteredEpisodes.map((ep) => (
            <button
              key={ep.episodeId}
              onClick={() => setSelectedEpisode(ep)}
              className={`w-full p-3 text-left border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors ${
                selectedEpisode?.episodeId === ep.episodeId ? "bg-zinc-800" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-500">#{ep.episodeId}</span>
                <span className={`text-xs font-mono ${getReturnColor(ep.return_)}`}>
                  {ep.return_ >= 0 ? "+" : ""}{ep.return_.toFixed(2)}
                </span>
              </div>
              <div className={`text-sm font-medium ${getOutcomeColor(ep.outcome)}`}>
                {ep.outcome.replace(/_/g, " ")}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {ep.persona.name} · {ep.length} turns
              </div>
            </button>
          ))}
          {filteredEpisodes.length === 0 && (
            <div className="p-4 text-center text-zinc-500 text-sm">
              No episodes match filters
            </div>
          )}
        </div>
      </div>

      {/* Episode Detail */}
      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
        {selectedEpisode ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-medium text-zinc-100">
                  Episode #{selectedEpisode.episodeId}
                </h3>
                <span className={`text-lg font-mono ${getReturnColor(selectedEpisode.return_)}`}>
                  Return: {selectedEpisode.return_ >= 0 ? "+" : ""}{selectedEpisode.return_.toFixed(3)}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className={getOutcomeColor(selectedEpisode.outcome)}>
                  {selectedEpisode.outcome.replace(/_/g, " ")}
                </span>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-400">{selectedEpisode.length} turns</span>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-400">{selectedEpisode.persona.name}</span>
              </div>
              {/* Persona Details */}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">
                  {selectedEpisode.persona.temperament}
                </span>
                <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">
                  {selectedEpisode.persona.willingnessToPay} willingness
                </span>
                <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">
                  {selectedEpisode.persona.financialSituation}
                </span>
                <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">
                  Patience: {selectedEpisode.persona.patience}
                </span>
              </div>
            </div>

            {/* State Timeline */}
            <div className="p-4 border-b border-zinc-800 overflow-x-auto">
              <div className="flex items-center gap-1 min-w-max">
                {selectedEpisode.trajectory.transitions.map((t, i) => (
                  <div key={i} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div className="px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-xs text-blue-400">
                        {t.state.fsmState}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-1">{t.action}</div>
                    </div>
                    {i < selectedEpisode.trajectory.transitions.length - 1 && (
                      <div className="w-6 h-px bg-zinc-700 mx-1" />
                    )}
                  </div>
                ))}
                {selectedEpisode.trajectory.transitions.length > 0 && (
                  <>
                    <div className="w-6 h-px bg-zinc-700 mx-1" />
                    <div className="px-2 py-1 bg-zinc-700 rounded text-xs text-zinc-400">
                      {selectedEpisode.trajectory.transitions[selectedEpisode.trajectory.transitions.length - 1].nextState.fsmState}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Conversation Replay */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedEpisode.trajectory.transitions.map((t, i) => (
                <div key={i} className="space-y-2">
                  {/* Turn header */}
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>Turn {i + 1}</span>
                    <span>·</span>
                    <span className="text-blue-400">{t.action}</span>
                    <span>·</span>
                    <span className={getReturnColor(t.reward)}>
                      {t.reward >= 0 ? "+" : ""}{t.reward.toFixed(2)} reward
                    </span>
                  </div>

                  {/* Agent message */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-blue-400">A</span>
                    </div>
                    <div className="flex-1 bg-zinc-800 rounded-lg p-3">
                      <p className="text-sm text-zinc-300">{t.info.agentUtterance}</p>
                    </div>
                  </div>

                  {/* Borrower message */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-zinc-400">B</span>
                    </div>
                    <div className="flex-1 bg-zinc-800/50 rounded-lg p-3">
                      <p className="text-sm text-zinc-400">{t.info.borrowerResponse}</p>
                      {t.info.detectedSignals.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.info.detectedSignals.map((s, j) => (
                            <span
                              key={j}
                              className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reward breakdown */}
                  <div className="ml-11 text-[10px] text-zinc-600 flex gap-3">
                    <span>Shaping: {t.info.rewardBreakdown.shaping.toFixed(2)}</span>
                    <span>Terminal: {t.info.rewardBreakdown.terminal.toFixed(2)}</span>
                    <span>Turn penalty: {t.info.rewardBreakdown.turnPenalty.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            Select an episode to view details
          </div>
        )}
      </div>
    </div>
  );
}
