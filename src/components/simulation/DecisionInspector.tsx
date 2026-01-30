"use client";

interface Decision {
  turn: number;
  selectedAction: string;
  policyDecisionMs: number;
  alternatives?: { action: string; score: number }[];
}

interface DecisionInspectorProps {
  currentDecision?: Decision;
  decisionHistory: Decision[];
  isDeciding?: boolean;
}

export function DecisionInspector({
  currentDecision,
  decisionHistory,
  isDeciding,
}: DecisionInspectorProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-zinc-300 mb-3">Decision Inspector</h3>

      {/* Current Decision */}
      <div className="bg-zinc-800/50 rounded p-3 mb-3">
        {isDeciding ? (
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Policy selecting...
          </div>
        ) : currentDecision ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Turn {currentDecision.turn}</span>
              <span className="text-xs text-zinc-500">[{currentDecision.policyDecisionMs}ms]</span>
            </div>
            <div className="text-sm text-emerald-400">
              Injected: {currentDecision.selectedAction}
            </div>
            {currentDecision.alternatives && currentDecision.alternatives.length > 0 && (
              <div className="text-xs text-zinc-500">
                Alternatives:{" "}
                {currentDecision.alternatives.map((a) => `${a.action} (${a.score.toFixed(2)})`).join(", ")}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-zinc-500">No decisions yet</div>
        )}
      </div>

      {/* Decision History */}
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {decisionHistory.slice(-5).reverse().map((d, i) => (
          <div key={i} className="text-xs text-zinc-500 flex justify-between">
            <span>T{d.turn}: {d.selectedAction}</span>
            <span>{d.policyDecisionMs}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}
