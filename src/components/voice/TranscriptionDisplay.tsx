"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Radio, Volume2 } from "lucide-react";

interface TranscriptionDisplayProps {
  transcript: string;
  isListening: boolean;
  isFinal: boolean;
  className?: string;
}

export function TranscriptionDisplay({
  transcript,
  isListening,
  isFinal,
  className,
}: TranscriptionDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayedText, setDisplayedText] = useState("");
  const [cursorVisible, setCursorVisible] = useState(true);

  // Typing animation effect
  useEffect(() => {
    if (transcript !== displayedText) {
      if (transcript.length > displayedText.length) {
        // Typing forward
        const timeout = setTimeout(() => {
          setDisplayedText(transcript.slice(0, displayedText.length + 1));
        }, 15);
        return () => clearTimeout(timeout);
      } else {
        // New transcript (shorter or different), reset
        setDisplayedText(transcript);
      }
    }
  }, [transcript, displayedText]);

  // Blinking cursor
  useEffect(() => {
    if (!isListening && isFinal) {
      setCursorVisible(false);
      return;
    }
    const interval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 530);
    return () => clearInterval(interval);
  }, [isListening, isFinal]);

  // Auto-scroll
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayedText]);

  const hasContent = displayedText.trim().length > 0;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg",
        "bg-gradient-to-br from-card/80 via-card to-card/90",
        "border border-border/50",
        isListening && "border-primary/50 glow-cyan",
        className
      )}
    >
      {/* HUD Corner Brackets */}
      <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-primary/60" />
      <div className="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2 border-primary/60" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-l-2 border-b-2 border-primary/60" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-primary/60" />

      {/* Scan line overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent",
            isListening && "animate-scan"
          )}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/20">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full transition-all duration-300",
              isListening ? "bg-destructive blink" : hasContent ? "bg-success" : "bg-muted-foreground/30"
            )}
          />
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground">
            Voice Input
          </span>
        </div>

        {/* Audio level indicator */}
        {isListening && (
          <div className="flex items-center gap-1">
            <AudioWaveform isActive={isListening} />
          </div>
        )}
      </div>

      {/* Transcription content */}
      <div
        ref={containerRef}
        className="p-4 min-h-[80px] max-h-[120px] overflow-y-auto"
      >
        {hasContent ? (
          <p className="text-sm leading-relaxed text-foreground/90 font-mono">
            <span className={cn(!isFinal && "text-primary/80")}>
              {displayedText}
            </span>
            {(isListening || !isFinal) && (
              <span
                className={cn(
                  "inline-block w-2 h-4 ml-0.5 -mb-0.5 bg-primary transition-opacity",
                  cursorVisible ? "opacity-100" : "opacity-0"
                )}
              />
            )}
          </p>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/50">
            {isListening ? (
              <div className="flex items-center gap-2 text-primary/60">
                <Radio className="w-4 h-4 blink" />
                <span className="text-xs tracking-wide">Listening...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                <span className="text-xs tracking-wide">Click mic to speak</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/30 bg-muted/10">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
          {isListening ? "Recording" : isFinal && hasContent ? "Ready to send" : "Standby"}
        </span>
        {hasContent && (
          <span className="text-[9px] text-muted-foreground/50 font-mono">
            {displayedText.split(/\s+/).filter(Boolean).length} words
          </span>
        )}
      </div>
    </div>
  );
}

// Audio waveform visualization component
function AudioWaveform({ isActive }: { isActive: boolean }) {
  const bars = 5;

  return (
    <div className="flex items-center gap-0.5 h-4">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-0.5 bg-primary rounded-full transition-all",
            isActive ? "animate-waveform" : "h-1"
          )}
          style={{
            animationDelay: `${i * 0.1}s`,
            height: isActive ? undefined : "4px",
          }}
        />
      ))}
    </div>
  );
}
