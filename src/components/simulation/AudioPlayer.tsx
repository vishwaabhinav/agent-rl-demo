"use client";

import { useRef, useEffect, useState } from "react";

interface AudioPlayerProps {
  agentAudioQueue: string[];
  borrowerAudioQueue: string[];
  isPlaying: boolean;
}

export function AudioPlayer({ agentAudioQueue, borrowerAudioQueue, isPlaying }: AudioPlayerProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [agentVolume, setAgentVolume] = useState(1);
  const [borrowerVolume, setBorrowerVolume] = useState(1);

  useEffect(() => {
    if (!audioContextRef.current && typeof window !== "undefined") {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Audio processing would go here - convert base64 to stereo output
  // Left channel = agent, Right channel = borrower

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
          <label className="block text-xs text-blue-400 mb-1">Agent (L)</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={agentVolume}
            onChange={(e) => setAgentVolume(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-amber-400 mb-1">Borrower (R)</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={borrowerVolume}
            onChange={(e) => setBorrowerVolume(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
        </div>
      </div>

      {/* Audio Visualization Placeholder */}
      <div className="mt-3 h-8 bg-zinc-800 rounded flex items-center justify-center">
        <div className="flex items-center gap-1">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className={`w-1 bg-zinc-600 rounded-full transition-all ${
                isPlaying ? "animate-pulse" : ""
              }`}
              style={{ height: `${Math.random() * 20 + 4}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
