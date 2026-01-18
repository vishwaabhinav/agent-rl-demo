"use client";

import { useEffect, useRef, useCallback } from "react";
import { useCallStore } from "@/stores/callStore";
import { ttsService } from "@/lib/speech/tts";

interface UseAgentVoiceOptions {
  enabled?: boolean;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export function useAgentVoice(options: UseAgentVoiceOptions = {}) {
  const { enabled = true, rate = 1, pitch = 1, volume = 1 } = options;

  const messages = useCallStore((state) => state.messages);
  const status = useCallStore((state) => state.status);
  const setAgentSpeaking = useCallStore((state) => state.setAgentSpeaking);

  const lastSpokenMessageId = useRef<string | null>(null);
  const isSpeakingRef = useRef(false);

  const speakMessage = useCallback(async (text: string, messageId: string) => {
    if (!enabled || !text.trim()) return;

    // Double-check we haven't already spoken this message (race condition guard)
    if (lastSpokenMessageId.current === messageId) {
      console.log("[TTS] Already spoken:", messageId);
      return;
    }

    // Set the ID immediately to prevent duplicate calls
    lastSpokenMessageId.current = messageId;

    try {
      isSpeakingRef.current = true;
      setAgentSpeaking(true);

      console.log("[TTS] Speaking:", text.substring(0, 50) + "...");

      await ttsService.speak(text, {
        rate,
        pitch,
        volume,
        lang: "en-US",
      });
    } catch (error) {
      console.error("[TTS] Error:", error);
    } finally {
      isSpeakingRef.current = false;
      setAgentSpeaking(false);
    }
  }, [enabled, rate, pitch, volume, setAgentSpeaking]);

  // Watch for new agent messages and speak them
  useEffect(() => {
    if (!enabled || status !== "active") return;

    // Find the latest agent message
    const agentMessages = messages.filter((m) => m.role === "agent");
    const latestAgentMessage = agentMessages[agentMessages.length - 1];

    if (
      latestAgentMessage &&
      latestAgentMessage.id !== lastSpokenMessageId.current &&
      !isSpeakingRef.current
    ) {
      speakMessage(latestAgentMessage.text, latestAgentMessage.id);
    }
  }, [messages, status, enabled, speakMessage]);

  // Stop speaking when call ends
  useEffect(() => {
    if (status === "ended" || status === "idle") {
      ttsService.stop();
      setAgentSpeaking(false);
      lastSpokenMessageId.current = null;
    }
  }, [status, setAgentSpeaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ttsService.stop();
    };
  }, []);

  return {
    speak: speakMessage,
    stop: () => {
      ttsService.stop();
      setAgentSpeaking(false);
    },
    isSpeaking: () => ttsService.isSpeaking(),
    isSupported: ttsService.isSupported(),
  };
}
