"use client";

import { useCallStore } from "@/stores/callStore";
import { Transcript } from "@/components/conversation/Transcript";
import { TracePanel } from "@/components/trace/TracePanel";
import { TranscriptionDisplay } from "@/components/voice/TranscriptionDisplay";
import { useAgentVoice } from "@/hooks/useAgentVoice";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Activity, Radio, Volume2 } from "lucide-react";

export function RightPane() {
  const {
    status,
    currentState,
    currentCase,
    currentTranscript,
    isTranscriptFinal,
    isUserSpeaking,
    isAgentSpeaking,
  } = useCallStore();

  // Enable agent voice output - automatically speaks agent messages
  useAgentVoice({ enabled: true, rate: 1, pitch: 1, volume: 1 });

  const isCallActive = status === "active";

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Live Session</h2>
          </div>
          {currentCase && (
            <Badge variant="outline" className="text-[10px]">
              {currentCase.creditorName}
            </Badge>
          )}
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-3">
          {isAgentSpeaking && (
            <div className="flex items-center gap-1.5 text-xs">
              <Volume2 className="w-3 h-3 text-primary blink" />
              <span className="text-primary font-medium">SPEAKING</span>
            </div>
          )}
          {status === "active" && !isAgentSpeaking && (
            <div className="flex items-center gap-1.5 text-xs">
              <Radio className="w-3 h-3 text-success blink" />
              <span className="text-success font-medium">LIVE</span>
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

      {/* Main content area - split into transcription, transcript and trace */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Transcription Display - Top Right area during active call */}
        {isCallActive && (
          <div className="px-4 pt-4 pb-2">
            <TranscriptionDisplay
              transcript={currentTranscript}
              isListening={isUserSpeaking}
              isFinal={isTranscriptFinal}
            />
          </div>
        )}

        {/* Transcript - 60% */}
        <div className={`${isCallActive ? "flex-[2]" : "flex-[3]"} border-b border-border overflow-hidden`}>
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
