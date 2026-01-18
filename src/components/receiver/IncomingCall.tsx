"use client";

import { useCallStore } from "@/stores/callStore";
import { Phone, PhoneOff, User } from "lucide-react";
import { useEffect, useState } from "react";

export function IncomingCall() {
  const { currentCase } = useCallStore();
  const [ringCount, setRingCount] = useState(0);

  // Ring animation counter
  useEffect(() => {
    const interval = setInterval(() => {
      setRingCount((c) => c + 1);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleAnswer = () => {
    // Emit socket event to answer
    const socket = (window as any).__agentSocket;
    if (socket) {
      socket.emit("call:answer");
    }
  };

  const handleDecline = () => {
    // Emit socket event to decline
    const socket = (window as any).__agentSocket;
    if (socket) {
      socket.emit("call:decline");
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-between py-12 px-6">
      {/* Caller info */}
      <div className="text-center space-y-6">
        {/* Pulsing ring animation */}
        <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
          {/* Outer rings - use wrapper divs for centering since ping animation overwrites transform */}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div
                className="w-28 h-28 rounded-full border-2 border-amber-500/30"
                style={{
                  animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
                  animationDelay: `${i * 0.4}s`,
                }}
              />
            </div>
          ))}

          {/* Avatar */}
          <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center border border-amber-500/30 incoming-call-shake">
            <User className="w-12 h-12 text-amber-500/70" />
          </div>
        </div>

        {/* Caller details */}
        <div className="space-y-2">
          <p className="text-xs text-amber-500/70 font-medium tracking-widest uppercase">
            Incoming Call
          </p>
          <h2 className="text-2xl font-light text-white">
            {currentCase?.creditorName || "Unknown Caller"}
          </h2>
          <p className="text-gray-500 text-sm font-mono">
            {currentCase?.debtorPhone || "+1-XXX-XXX-XXXX"}
          </p>
        </div>

        {/* Ring indicator */}
        <div className="flex items-center justify-center gap-2 text-gray-500 text-xs">
          <span className="inline-block w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          <span>Ringing...</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-16">
        {/* Decline */}
        <button
          onClick={handleDecline}
          className="group flex flex-col items-center gap-3"
        >
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center transition-all group-hover:bg-red-500/20 group-hover:scale-105 group-active:scale-95">
            <PhoneOff className="w-7 h-7 text-red-500" />
          </div>
          <span className="text-xs text-gray-500 group-hover:text-red-400 transition-colors">
            Decline
          </span>
        </button>

        {/* Answer */}
        <button
          onClick={handleAnswer}
          className="group flex flex-col items-center gap-3"
        >
          <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center transition-all group-hover:bg-green-500/30 group-hover:scale-105 group-active:scale-95 answer-button-glow">
            <Phone className="w-7 h-7 text-green-500" />
          </div>
          <span className="text-xs text-gray-500 group-hover:text-green-400 transition-colors">
            Answer
          </span>
        </button>
      </div>
    </div>
  );
}
