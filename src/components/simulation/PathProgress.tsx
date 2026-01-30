"use client";

import type { FSMState } from "@/lib/types";

interface PathProgressProps {
  path: FSMState[];
  currentIndex: number;
  agentState: FSMState;
}

export function PathProgress({ path, currentIndex, agentState }: PathProgressProps) {
  if (!path || path.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">FSM Path Progress</h3>
        <div className="text-sm text-zinc-500">No path selected</div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-zinc-300 mb-3">FSM Path Progress</h3>

      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {path.map((state, i) => {
          const isComplete = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isAgentHere = state === agentState;

          return (
            <div key={i} className="flex items-center">
              <div
                className={`
                  px-2 py-1 rounded text-xs font-medium whitespace-nowrap
                  ${isComplete ? "bg-emerald-500/20 text-emerald-400" : ""}
                  ${isCurrent ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500" : ""}
                  ${!isComplete && !isCurrent ? "bg-zinc-800 text-zinc-500" : ""}
                  ${isAgentHere && !isCurrent ? "ring-1 ring-amber-500" : ""}
                `}
              >
                {state.replace(/_/g, " ")}
              </div>
              {i < path.length - 1 && (
                <div className={`w-4 h-0.5 ${isComplete ? "bg-emerald-500" : "bg-zinc-700"}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 text-xs text-zinc-500">
        Progress: {currentIndex + 1} / {path.length} states
      </div>
    </div>
  );
}
