"use client";

import { useCallStore } from "@/stores/callStore";
import { PhoneOff, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

export function ActiveCall() {
  const {
    currentCase,
    isUserSpeaking,
    isAgentSpeaking,
    status,
  } = useCallStore();

  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const startTimeRef = useRef<number>(Date.now());

  // Call timer
  useEffect(() => {
    if (status !== "active") return;
    startTimeRef.current = Date.now();

    const interval = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleEndCall = () => {
    console.log("[ActiveCall] End call clicked");
    const socket = (window as any).__agentSocket;
    if (socket) {
      console.log("[ActiveCall] Emitting call:end");
      socket.emit("call:end");
    } else {
      console.error("[ActiveCall] No socket available");
    }
  };

  const handleToggleMute = () => {
    setIsMuted(!isMuted);
    // TODO: Actually mute the microphone
  };

  const handleToggleSpeaker = () => {
    setIsSpeakerOn(!isSpeakerOn);
    // TODO: Actually control speaker volume
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header with timer and caller info */}
      <div className="text-center py-4 border-b border-gray-800/50">
        <p className="text-3xl font-light text-white font-mono tracking-wider">
          {formatDuration(callDuration)}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          {currentCase?.creditorName || "Active Call"}
        </p>

      </div>

      {/* Main area - minimal, no transcript */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        {status === "connecting" && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-gray-500 text-sm">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              Connecting...
            </div>
          </div>
        )}

        {status === "active" && (
          <div className="text-center">
            {/* Audio waveform visualization placeholder */}
            <div className="flex items-center justify-center gap-1 h-16">
              {isAgentSpeaking ? (
                // Agent speaking visualization
                [...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-amber-500 rounded-full animate-pulse"
                    style={{
                      height: `${20 + Math.random() * 30}px`,
                      animationDelay: `${i * 100}ms`,
                      animationDuration: '0.5s',
                    }}
                  />
                ))
              ) : isUserSpeaking ? (
                // User speaking visualization
                [...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-green-500 rounded-full animate-pulse"
                    style={{
                      height: `${20 + Math.random() * 30}px`,
                      animationDelay: `${i * 100}ms`,
                      animationDuration: '0.5s',
                    }}
                  />
                ))
              ) : (
                // Idle/listening state
                [...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 h-2 bg-gray-600 rounded-full"
                  />
                ))
              )}
            </div>
            <p className="text-gray-500 text-sm mt-4">
              {isAgentSpeaking ? "Agent is speaking..." : isUserSpeaking ? "Listening to you..." : "Waiting..."}
            </p>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="border-t border-gray-800/50 bg-black/30 backdrop-blur-sm px-6 py-6">
        <div className="flex items-center justify-center gap-8">
          {/* Mute button */}
          <button
            onClick={handleToggleMute}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              isMuted
                ? "bg-red-500/20 border border-red-500/30 text-red-400"
                : "bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:text-white"
            )}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* End call button */}
          <button
            onClick={handleEndCall}
            className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center transition-all hover:bg-red-600 hover:scale-105 active:scale-95 shadow-lg shadow-red-500/30"
          >
            <PhoneOff className="w-7 h-7 text-white" />
          </button>

          {/* Speaker button */}
          <button
            onClick={handleToggleSpeaker}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              !isSpeakerOn
                ? "bg-red-500/20 border border-red-500/30 text-red-400"
                : "bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:text-white"
            )}
          >
            {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
