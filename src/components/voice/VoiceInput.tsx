"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

// Type definitions for Web Speech API
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface VoiceInputProps {
  onTranscript: (text: string, isFinal: boolean) => void;
  onFinalTranscript: (text: string) => void;
  disabled?: boolean;
  language?: string;
  isListening?: boolean;
  onListeningChange?: (listening: boolean) => void;
}

export function VoiceInput({
  onTranscript,
  onFinalTranscript,
  disabled = false,
  language = "en-US",
  isListening: externalIsListening,
  onListeningChange,
}: VoiceInputProps) {
  const [internalIsListening, setInternalIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef("");
  const isListeningRef = useRef(false);

  // Use external or internal listening state
  const isListening = externalIsListening ?? internalIsListening;
  const setIsListening = (value: boolean) => {
    setInternalIsListening(value);
    onListeningChange?.(value);
    isListeningRef.current = value;
  };

  useEffect(() => {
    // Check for browser support
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
      finalTranscriptRef.current = "";
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Update interim transcript for display
      if (interimTranscript) {
        onTranscript(finalTranscriptRef.current + interimTranscript, false);
      }

      // Handle final transcript
      if (finalTranscript) {
        finalTranscriptRef.current += finalTranscript;
        onTranscript(finalTranscriptRef.current, true);
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "no-speech") {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // If we were listening, send the final transcript
      if (isListeningRef.current && finalTranscriptRef.current.trim()) {
        onFinalTranscript(finalTranscriptRef.current.trim());
      }
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, [language]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !disabled) {
      finalTranscriptRef.current = "";
      onTranscript("", false);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Recognition already started:", e);
      }
    }
  }, [disabled, onTranscript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  if (!isSupported) {
    return (
      <div className="flex flex-col items-center gap-3 p-4">
        <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center border border-border">
          <MicOff className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <span className="text-xs text-muted-foreground text-center">
          Voice not supported.<br />Use Chrome or Edge.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Microphone button with pulse rings */}
      <div className="relative">
        {/* Pulse rings when listening */}
        {isListening && (
          <>
            <div className="absolute inset-0 rounded-full bg-destructive/20 voice-pulse-ring" />
            <div
              className="absolute inset-0 rounded-full bg-destructive/20 voice-pulse-ring"
              style={{ animationDelay: "0.5s" }}
            />
            <div
              className="absolute inset-0 rounded-full bg-destructive/20 voice-pulse-ring"
              style={{ animationDelay: "1s" }}
            />
          </>
        )}

        {/* Main button */}
        <button
          onClick={toggleListening}
          disabled={disabled}
          className={cn(
            "relative w-20 h-20 rounded-full transition-all duration-300",
            "flex items-center justify-center",
            "border-2",
            disabled && "opacity-40 cursor-not-allowed",
            isListening
              ? "bg-destructive/20 border-destructive scale-110"
              : "bg-primary/10 border-primary/50 hover:border-primary hover:bg-primary/20"
          )}
        >
          {/* Inner glow ring */}
          <div
            className={cn(
              "absolute inset-2 rounded-full transition-all duration-300",
              isListening
                ? "bg-gradient-to-br from-destructive/30 to-destructive/10"
                : "bg-gradient-to-br from-primary/20 to-transparent"
            )}
          />

          {/* Icon */}
          <div className={cn("relative z-10", isListening ? "mic-glow-red" : "mic-glow")}>
            {isListening ? (
              <MicOff className="w-8 h-8 text-destructive" />
            ) : (
              <Mic className="w-8 h-8 text-primary" />
            )}
          </div>
        </button>

        {/* Audio level bars */}
        {isListening && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-end gap-0.5 h-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-1 bg-destructive rounded-full animate-audio-bar"
                style={{
                  animationDelay: `${i * 0.1}s`,
                  height: "12px",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Status label */}
      <div className="text-center">
        <span
          className={cn(
            "text-xs font-medium tracking-wide transition-colors",
            disabled
              ? "text-muted-foreground/50"
              : isListening
              ? "text-destructive"
              : "text-muted-foreground"
          )}
        >
          {disabled ? (
            "Start call first"
          ) : isListening ? (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive blink" />
              Recording...
            </span>
          ) : (
            "Tap to speak"
          )}
        </span>
      </div>
    </div>
  );
}
