"use client";

import { useState, useMemo, useEffect } from "react";

interface EpisodeSummary {
  id: string;
  episodeNum: number;
  personaId: string | null;
  personaName: string | null;
  outcome: string | null;
  totalReturn: number | null;
  turns: number | null;
}

interface TranscriptTurn {
  turnNum: number;
  fsmState: string;
  action: string;
  agentText: string | null;
  borrowerText: string | null;
  reward: number | null;
  rewardBreakdown: {
    shaping?: number;
    terminal?: number;
    turnPenalty?: number;
    total?: number;
  } | null;
  detectedSignals: string[] | null;
}

interface EpisodeDetail {
  id: string;
  experimentId: string;
  episodeNum: number;
  personaId: string | null;
  personaName: string | null;
  persona: {
    name?: string;
    willingnessToPay?: string;
    financialSituation?: string;
    temperament?: string;
    debtKnowledge?: string;
    patience?: number;
  } | null;
  outcome: string | null;
  totalReturn: number | null;
  turns: number | null;
  transcript: TranscriptTurn[];
}

interface EpisodeExplorerProps {
  experimentId?: string;
  episodes?: EpisodeSummary[];
}

export function EpisodeExplorer({ experimentId, episodes = [] }: EpisodeExplorerProps) {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [episodeDetail, setEpisodeDetail] = useState<EpisodeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filterOutcome, setFilterOutcome] = useState<string>("all");
  const [filterPersona, setFilterPersona] = useState<string>("all");

  // Auto-select first episode when episodes change
  useEffect(() => {
    if (episodes.length > 0 && !selectedEpisodeId) {
      setSelectedEpisodeId(episodes[0].id);
    }
  }, [episodes, selectedEpisodeId]);

  // Fetch episode detail when selected
  useEffect(() => {
    if (!selectedEpisodeId) {
      setEpisodeDetail(null);
      return;
    }

    async function fetchDetail() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/experiments?action=episode&id=${encodeURIComponent(selectedEpisodeId!)}`);
        if (!res.ok) throw new Error("Failed to load episode");
        const data = await res.json();
        setEpisodeDetail(data);
      } catch (error) {
        console.error("Failed to load episode:", error);
        setEpisodeDetail(null);
      } finally {
        setIsLoading(false);
      }
    }
    fetchDetail();
  }, [selectedEpisodeId]);

  // Get unique outcomes and personas for filters
  const outcomes = useMemo(() => {
    const set = new Set(episodes.map((e) => e.outcome).filter(Boolean) as string[]);
    return ["all", ...Array.from(set)];
  }, [episodes]);

  const personas = useMemo(() => {
    const set = new Set(episodes.map((e) => e.personaName).filter(Boolean) as string[]);
    return ["all", ...Array.from(set)];
  }, [episodes]);

  // Filter episodes
  const filteredEpisodes = useMemo(() => {
    return episodes.filter((ep) => {
      if (filterOutcome !== "all" && ep.outcome !== filterOutcome) return false;
      if (filterPersona !== "all" && ep.personaName !== filterPersona) return false;
      return true;
    });
  }, [episodes, filterOutcome, filterPersona]);

  // Outcome color
  const getOutcomeColor = (outcome: string | null) => {
    if (!outcome) return "text-zinc-400";
    if (outcome.includes("PAYMENT") || outcome.includes("SUCCESS")) return "text-emerald-500";
    if (outcome.includes("HANGUP") || outcome.includes("VIOLATION")) return "text-red-500";
    if (outcome.includes("CALLBACK") || outcome.includes("PROMISE")) return "text-blue-500";
    if (outcome.includes("ESCALATE")) return "text-amber-500";
    return "text-zinc-400";
  };

  // Return color
  const getReturnColor = (value: number | null) => {
    if (value === null) return "text-zinc-500";
    if (value > 0.2) return "text-emerald-500";
    if (value > 0) return "text-emerald-400";
    if (value > -0.3) return "text-zinc-400";
    return "text-red-500";
  };

  if (!experimentId) {
    return (
      <div className="flex items-center justify-center h-96 text-[#5a6a7a] text-sm">
        Select an experiment to view episodes
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-[#5a6a7a] text-sm">
        No episodes found for this experiment
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-180px)] gap-4">
      {/* Episode List */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-[#0a0e14] rounded-lg overflow-hidden">
        {/* Filters */}
        <div className="p-3 bg-[#080b10] space-y-2">
          <div>
            <label className="text-[10px] text-[#5a6a7a] block mb-1">Outcome</label>
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value)}
              className="w-full bg-[#0a0e14] border border-[#1e3a4f]/60 rounded px-2 py-1 text-xs text-[#8a9aaa] focus:outline-none focus:border-[#00d4ff]/50"
            >
              {outcomes.map((o) => (
                <option key={o} value={o}>
                  {o === "all" ? "All Outcomes" : o.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#5a6a7a] block mb-1">Persona</label>
            <select
              value={filterPersona}
              onChange={(e) => setFilterPersona(e.target.value)}
              className="w-full bg-[#0a0e14] border border-[#1e3a4f]/60 rounded px-2 py-1 text-xs text-[#8a9aaa] focus:outline-none focus:border-[#00d4ff]/50"
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
              key={ep.id}
              onClick={() => setSelectedEpisodeId(ep.id)}
              className={`w-full p-3 text-left border-b border-[#1e3a4f]/30 hover:bg-[#0d1218] transition-colors ${
                selectedEpisodeId === ep.id ? "bg-[#0d1218]" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[#5a6a7a]">#{ep.episodeNum}</span>
                <span className={`text-xs font-mono ${getReturnColor(ep.totalReturn)}`}>
                  {ep.totalReturn !== null ? (ep.totalReturn >= 0 ? "+" : "") + ep.totalReturn.toFixed(2) : "—"}
                </span>
              </div>
              <div className={`text-xs font-medium ${getOutcomeColor(ep.outcome)}`}>
                {ep.outcome?.replace(/_/g, " ") || "Unknown"}
              </div>
              <div className="text-[10px] text-[#5a6a7a] mt-1">
                {ep.personaName || "Unknown"} · {ep.turns ?? 0} turns
              </div>
            </button>
          ))}
          {filteredEpisodes.length === 0 && (
            <div className="p-4 text-center text-[#5a6a7a] text-xs">
              No episodes match filters
            </div>
          )}
        </div>
      </div>

      {/* Episode Detail */}
      <div className="flex-1 bg-[#0a0e14] rounded-lg overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-[#5a6a7a] text-sm">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-pulse" />
              Loading episode...
            </div>
          </div>
        ) : episodeDetail ? (
          <>
            {/* Header */}
            <div className="p-4 bg-[#080b10]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-[#e0e6ed]">
                  Episode #{episodeDetail.episodeNum}
                </h3>
                <span className={`text-sm font-mono ${getReturnColor(episodeDetail.totalReturn)}`}>
                  Return: {episodeDetail.totalReturn !== null ? (episodeDetail.totalReturn >= 0 ? "+" : "") + episodeDetail.totalReturn.toFixed(3) : "—"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className={getOutcomeColor(episodeDetail.outcome)}>
                  {episodeDetail.outcome?.replace(/_/g, " ") || "Unknown"}
                </span>
                <span className="text-[#3a4a5a]">·</span>
                <span className="text-[#8a9aaa]">{episodeDetail.turns ?? 0} turns</span>
                <span className="text-[#3a4a5a]">·</span>
                <span className="text-[#8a9aaa]">{episodeDetail.personaName || "Unknown persona"}</span>
              </div>
              {/* Persona Details */}
              {episodeDetail.persona && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {episodeDetail.persona.temperament && (
                    <span className="px-2 py-0.5 bg-[#0d1218] rounded text-[10px] text-[#8a9aaa]">
                      {episodeDetail.persona.temperament}
                    </span>
                  )}
                  {episodeDetail.persona.willingnessToPay && (
                    <span className="px-2 py-0.5 bg-[#0d1218] rounded text-[10px] text-[#8a9aaa]">
                      {episodeDetail.persona.willingnessToPay} willingness
                    </span>
                  )}
                  {episodeDetail.persona.financialSituation && (
                    <span className="px-2 py-0.5 bg-[#0d1218] rounded text-[10px] text-[#8a9aaa]">
                      {episodeDetail.persona.financialSituation}
                    </span>
                  )}
                  {episodeDetail.persona.patience !== undefined && (
                    <span className="px-2 py-0.5 bg-[#0d1218] rounded text-[10px] text-[#8a9aaa]">
                      Patience: {episodeDetail.persona.patience}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* State Timeline */}
            {episodeDetail.transcript.length > 0 && (
              <div className="p-4 bg-[#080b10] border-t border-[#1e3a4f]/30 overflow-x-auto">
                <div className="flex items-center gap-1 min-w-max">
                  {episodeDetail.transcript.map((t, i) => (
                    <div key={i} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <div className="px-2 py-1 bg-[#00d4ff]/10 border border-[#00d4ff]/20 rounded text-[10px] text-[#00d4ff]">
                          {t.fsmState}
                        </div>
                        <div className="text-[9px] text-[#5a6a7a] mt-1">{t.action}</div>
                      </div>
                      {i < episodeDetail.transcript.length - 1 && (
                        <div className="w-4 h-px bg-[#1e3a4f] mx-1" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Replay */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {episodeDetail.transcript.map((t, i) => (
                <div key={i} className="space-y-2">
                  {/* Turn header */}
                  <div className="flex items-center gap-2 text-[10px] text-[#5a6a7a]">
                    <span>Turn {t.turnNum}</span>
                    <span>·</span>
                    <span className="text-[#00d4ff]">{t.action}</span>
                    <span>·</span>
                    <span className={getReturnColor(t.reward)}>
                      {t.reward !== null ? (t.reward >= 0 ? "+" : "") + t.reward.toFixed(2) : "—"} reward
                    </span>
                  </div>

                  {/* Agent message */}
                  {t.agentText && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#00d4ff]/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] text-[#00d4ff]">A</span>
                      </div>
                      <div className="flex-1 bg-[#0d1218] rounded-lg p-3">
                        <p className="text-xs text-[#c0c8d0]">{t.agentText}</p>
                      </div>
                    </div>
                  )}

                  {/* Borrower message */}
                  {t.borrowerText && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#1e3a4f]/40 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] text-[#8a9aaa]">B</span>
                      </div>
                      <div className="flex-1 bg-[#0d1218]/50 rounded-lg p-3">
                        <p className="text-xs text-[#8a9aaa]">{t.borrowerText}</p>
                        {t.detectedSignals && t.detectedSignals.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {t.detectedSignals.map((s, j) => (
                              <span
                                key={j}
                                className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 text-[9px] rounded"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Reward breakdown */}
                  {t.rewardBreakdown && (
                    <div className="ml-10 text-[9px] text-[#3a4a5a] flex gap-3">
                      {t.rewardBreakdown.shaping !== undefined && (
                        <span>Shaping: {t.rewardBreakdown.shaping.toFixed(2)}</span>
                      )}
                      {t.rewardBreakdown.terminal !== undefined && (
                        <span>Terminal: {t.rewardBreakdown.terminal.toFixed(2)}</span>
                      )}
                      {t.rewardBreakdown.turnPenalty !== undefined && (
                        <span>Turn penalty: {t.rewardBreakdown.turnPenalty.toFixed(2)}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {episodeDetail.transcript.length === 0 && (
                <div className="text-center text-[#5a6a7a] text-xs py-8">
                  No transcript available for this episode
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#5a6a7a] text-sm">
            Select an episode to view details
          </div>
        )}
      </div>
    </div>
  );
}
