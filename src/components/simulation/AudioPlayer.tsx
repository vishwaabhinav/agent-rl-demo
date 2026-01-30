"use client";

import { useMemo } from "react";

interface AudioPlayerProps {
  isPlaying: boolean;
  agentVolume: number;
  borrowerVolume: number;
  onAgentVolumeChange: (volume: number) => void;
  onBorrowerVolumeChange: (volume: number) => void;
}

export function AudioPlayer({
  isPlaying,
  agentVolume,
  borrowerVolume,
  onAgentVolumeChange,
  onBorrowerVolumeChange,
}: AudioPlayerProps) {
  // Generate stable bar heights (memoized to avoid re-render flicker)
  const barHeights = useMemo(() => {
    return Array.from({ length: 20 }, () => Math.random() * 20 + 4);
  }, []);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-zinc-300">Audio Output</h3>
        <div className="flex items-center gap-2">
          {isPlaying ? (
            <div className="flex items-center gap-1 text-xs text-emerald-400">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </div>
          ) : (
            <div className="text-xs text-zinc-500">Idle</div>
          )}
        </div>
      </div>

      {/* Volume Controls */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-blue-400">Agent (L)</label>
            <span className="text-xs text-zinc-500">{Math.round(agentVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={agentVolume}
            onChange={(e) => onAgentVolumeChange(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-amber-400">Borrower (R)</label>
            <span className="text-xs text-zinc-500">{Math.round(borrowerVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={borrowerVolume}
            onChange={(e) => onBorrowerVolumeChange(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
        </div>
      </div>

      {/* Audio Visualization */}
      <div className="mt-3 h-10 bg-zinc-800 rounded flex items-end justify-center gap-0.5 px-2">
        {barHeights.map((height, i) => (
          <div
            key={i}
            className={`w-1.5 rounded-t transition-all duration-150 ${
              isPlaying
                ? i < 10
                  ? "bg-blue-500"
                  : "bg-amber-500"
                : "bg-zinc-600"
            }`}
            style={{
              height: isPlaying ? `${height + Math.sin(Date.now() / 200 + i) * 5}px` : "4px",
              opacity: isPlaying ? 0.8 + Math.sin(Date.now() / 300 + i) * 0.2 : 0.5,
            }}
          />
        ))}
      </div>

      {/* Channel Labels */}
      <div className="mt-1 flex justify-between text-xs text-zinc-600">
        <span>L</span>
        <span>R</span>
      </div>
    </div>
  );
}
