"use client";

import { useCallStore } from "@/stores/callStore";
import { PhoneOff, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

export function ActiveCall() {
  const {
    currentCase,
    messages,
    isUserSpeaking,
    isAgentSpeaking,
    status,
  } = useCallStore();

  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

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

        {/* Speaking indicator */}
        <div className="flex items-center justify-center gap-2 mt-2">
          {isAgentSpeaking && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-500">
              <Volume2 className="w-3 h-3 animate-pulse" />
              Agent speaking...
            </span>
          )}
          {isUserSpeaking && (
            <span className="inline-flex items-center gap-1.5 text-xs text-green-500">
              <Mic className="w-3 h-3 animate-pulse" />
              You are speaking...
            </span>
          )}
          {!isAgentSpeaking && !isUserSpeaking && status === "active" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-1.5 h-1.5 bg-gray-600 rounded-full" />
              Listening...
            </span>
          )}
        </div>
      </div>

      {/* Transcript area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4 max-w-md mx-auto">
          {status === "connecting" && (
            <div className="text-center py-8">
              <div className="inline-flex items-center gap-2 text-gray-500 text-sm">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                Connecting...
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                  message.role === "user"
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-br-md"
                    : "bg-gray-800/80 text-gray-200 rounded-bl-md border border-gray-700/50"
                )}
              >
                <p className="leading-relaxed">{message.text}</p>
                <p
                  className={cn(
                    "text-[10px] mt-1",
                    message.role === "user" ? "text-blue-200/60" : "text-gray-500"
                  )}
                >
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}

          {/* Typing indicator for agent */}
          {isAgentSpeaking && (
            <div className="flex justify-start">
              <div className="bg-gray-800/80 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-700/50">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
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
