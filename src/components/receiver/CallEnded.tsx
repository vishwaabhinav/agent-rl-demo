"use client";

import { useCallStore } from "@/stores/callStore";
import { PhoneOff, Clock, MessageSquare, RotateCcw } from "lucide-react";

export function CallEnded() {
  const { messages, currentCase, reset } = useCallStore();

  // Calculate call stats
  const agentMessages = messages.filter((m) => m.role === "agent").length;
  const userMessages = messages.filter((m) => m.role === "user").length;

  const handleNewCall = () => {
    reset();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="text-center space-y-8 max-w-sm">
        {/* End icon */}
        <div className="relative mx-auto">
          <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <PhoneOff className="w-8 h-8 text-red-400" />
          </div>
        </div>

        {/* Call ended text */}
        <div className="space-y-2">
          <h2 className="text-xl font-medium text-white">Call Ended</h2>
          <p className="text-gray-500 text-sm">
            {currentCase?.creditorName || "Unknown Caller"}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/30">
            <div className="flex items-center justify-center gap-2 text-gray-400 mb-2">
              <MessageSquare className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wide">Messages</span>
            </div>
            <p className="text-2xl font-light text-white">
              {agentMessages + userMessages}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {agentMessages} agent / {userMessages} you
            </p>
          </div>

          <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/30">
            <div className="flex items-center justify-center gap-2 text-gray-400 mb-2">
              <Clock className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wide">Duration</span>
            </div>
            <p className="text-2xl font-light text-white">
              {messages.length > 1
                ? formatDuration(
                    Math.floor(
                      (new Date(messages[messages.length - 1].timestamp).getTime() -
                        new Date(messages[0].timestamp).getTime()) /
                        1000
                    )
                  )
                : "0:00"}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              total time
            </p>
          </div>
        </div>

        {/* New call button */}
        <button
          onClick={handleNewCall}
          className="w-full py-3 px-4 rounded-lg bg-gray-800/50 border border-gray-700/50 text-gray-300 hover:text-white hover:bg-gray-700/50 transition-all flex items-center justify-center gap-2 group"
        >
          <RotateCcw className="w-4 h-4 group-hover:rotate-[-30deg] transition-transform" />
          <span>Start New Session</span>
        </button>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
