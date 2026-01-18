"use client";

import { useCallStore } from "@/stores/callStore";
import { Transcript } from "@/components/conversation/Transcript";
import { TracePanel } from "@/components/trace/TracePanel";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Activity, Radio, Volume2, Mic } from "lucide-react";

export function MiddlePane() {
  const {
    status,
    currentState,
    currentCase,
    isUserSpeaking,
    isAgentSpeaking,
  } = useCallStore();

  const isCallActive = status === "active" || status === "connecting";

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Session Monitor</h2>
          </div>
          {currentCase && (
            <Badge variant="outline" className="text-[10px]">
              {currentCase.creditorName}
            </Badge>
          )}
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-3">
          {isUserSpeaking && (
            <div className="flex items-center gap-1.5 text-xs">
              <Mic className="w-3 h-3 text-green-500 animate-pulse" />
              <span className="text-green-500 font-medium">USER</span>
            </div>
          )}
          {isAgentSpeaking && (
            <div className="flex items-center gap-1.5 text-xs">
              <Volume2 className="w-3 h-3 text-primary animate-pulse" />
              <span className="text-primary font-medium">AGENT</span>
            </div>
          )}
          {isCallActive && !isAgentSpeaking && !isUserSpeaking && (
            <div className="flex items-center gap-1.5 text-xs">
              <Radio className="w-3 h-3 text-success animate-pulse" />
              <span className="text-success font-medium">LIVE</span>
            </div>
          )}
          {status === "ringing" && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-amber-500 font-medium">RINGING</span>
            </div>
          )}
          {status !== "idle" && (
            <Badge
              variant="secondary"
              className="text-[10px] font-mono bg-accent text-accent-foreground"
            >
              {currentState.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </div>

      {/* Main content area - split into transcript and trace */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Transcript - 60% */}
        <div className="flex-[3] border-b border-border overflow-hidden">
          <Transcript />
        </div>

        {/* Trace Panel Header */}
        <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Debug Trace
          </span>
        </div>

        {/* Trace Panel - 40% */}
        <div className="flex-[2] overflow-hidden">
          <TracePanel />
        </div>
      </div>
    </div>
  );
}
