"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useCallStore } from "@/stores/callStore";
import { useConfigStore } from "@/stores/configStore";
import { useAudioCapture } from "./useAudioCapture";
import { useAudioPlayback } from "./useAudioPlayback";

export function useVoiceSocket() {
  const socketRef = useRef<Socket | null>(null);
  const {
    status,
    sessionId,
    currentCase,
    setStatus,
    setSessionId,
    addMessage,
    setCurrentState,
    setTurnTrace,
    setUserSpeaking,
    setAgentSpeaking,
    setBlockedReason,
    reset,
  } = useCallStore();
  const { config } = useConfigStore();

  // Audio playback for TTS
  const { queueAudio, clearQueue: clearAudioQueue } = useAudioPlayback({
    sampleRate: 24000,
    enabled: status === "active",
  });

  // Handle audio data from microphone
  const sessionIdRef = useRef<string | null>(null);

  // Keep sessionId ref in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const handleAudioData = useCallback(
    (base64Audio: string) => {
      if (socketRef.current && status === "active" && sessionIdRef.current) {
        socketRef.current.emit("audio:chunk", {
          sessionId: sessionIdRef.current,
          audio: base64Audio,
        });
      }
    },
    [status]
  );

  // Audio capture from microphone
  const {
    isCapturing,
    devices: audioDevices,
    currentDeviceId,
    switchDevice,
    refreshDevices,
  } = useAudioCapture({
    onAudioData: handleAudioData,
    sampleRate: 24000,
    enabled: status === "active",
  });

  // Initialize socket connection
  useEffect(() => {
    const socket = io({
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    // Store socket globally for components to access
    (window as any).__agentSocket = socket;

    // Connection events
    socket.on("connect", () => {
      console.log("[Socket] Connected:", socket.id);

      // Rejoin session if we have one (handles HMR reconnects)
      if (sessionIdRef.current) {
        console.log("[Socket] Rejoining session:", sessionIdRef.current);
        socket.emit("session:rejoin", { sessionId: sessionIdRef.current });
      }
    });

    socket.on("session:rejoined", (data: { sessionId: string; status: string; state: string; messageCount: number }) => {
      console.log("[Socket] Session rejoined:", data);
    });

    socket.on("session:rejoin_failed", (data: { reason: string }) => {
      console.log("[Socket] Session rejoin failed:", data.reason);
    });

    socket.on("disconnect", () => {
      console.log("[Socket] Disconnected");
    });

    socket.on("connect_error", (error) => {
      console.error("[Socket] Connection error:", error);
    });

    // Call flow events
    socket.on("call:ringing", (data: { sessionId: string }) => {
      console.log("[Socket] Call ringing:", data.sessionId);
      setSessionId(data.sessionId);
      setStatus("ringing");
    });

    socket.on("call:connecting", (data: { sessionId: string }) => {
      console.log("[Socket] Call connecting:", data.sessionId);
      setStatus("connecting");
    });

    socket.on("call:connected", (data: { sessionId: string; state: string }) => {
      console.log("[Socket] Call connected:", data.sessionId);
      setStatus("active");
      if (data.state) {
        setCurrentState(data.state as any);
      }
    });

    socket.on("call:ended", (data?: any) => {
      console.log("[Socket] Call ended received", data);
      setStatus("ended");
      clearAudioQueue();
    });

    socket.on("call:declined", () => {
      console.log("[Socket] Call declined");
      setStatus("declined");
      // Return to idle after a moment
      setTimeout(() => {
        reset();
      }, 2000);
    });

    socket.on("call:error", (data: { error: string }) => {
      console.error("[Socket] Call error:", data.error);
      setStatus("ended");
    });

    socket.on("call:blocked", (data: { reason: string; riskLevel: string }) => {
      console.error("[Socket] Call blocked:", data.reason, "Risk:", data.riskLevel);
      setBlockedReason(data.reason, data.riskLevel);
    });

    // Voice activity events
    socket.on("voice:userSpeaking", (data: { speaking: boolean }) => {
      console.log("[Socket] User speaking:", data.speaking);
      setUserSpeaking(data.speaking);
      // Note: Barge-in audio clearing is handled by OpenAI Realtime API's interrupt_response
      // We don't need to clear the queue here - the API stops sending audio deltas
    });

    socket.on("voice:agentSpeaking", (data: { speaking: boolean }) => {
      console.log("[Socket] Agent speaking:", data.speaking);
      setAgentSpeaking(data.speaking);
    });

    // Audio streaming from TTS
    socket.on("audio:delta", (data: { audio: string }) => {
      console.log("[Socket] Received audio delta, length:", data.audio?.length);
      queueAudio(data.audio);
    });

    // Transcript events
    socket.on(
      "transcript:user",
      (data: { text: string; isFinal: boolean }) => {
        if (data.isFinal && data.text) {
          addMessage({ role: "user", text: data.text });
        }
      }
    );

    socket.on(
      "transcript:agent",
      (data: { text: string; isFinal: boolean }) => {
        if (data.isFinal && data.text) {
          addMessage({ role: "agent", text: data.text });
        }
      }
    );

    // FSM state updates
    socket.on("state:changed", (data: { state: string; reason?: string }) => {
      console.log("[Socket] State changed:", data.state, data.reason);
      setCurrentState(data.state as any);
    });

    // Turn trace for debugging
    socket.on("trace:update", (data: { trace: any; state: string }) => {
      console.log("[Socket] Trace update:", data.state);
      setTurnTrace(data.trace);
    });

    return () => {
      socket.disconnect();
      (window as any).__agentSocket = null;
    };
  }, [
    setStatus,
    setSessionId,
    addMessage,
    setCurrentState,
    setTurnTrace,
    setUserSpeaking,
    setAgentSpeaking,
    setBlockedReason,
    reset,
    queueAudio,
    clearAudioQueue,
  ]);

  // Initiate a call
  const initiateCall = useCallback(() => {
    if (!socketRef.current || !currentCase) {
      console.error("[Socket] Cannot initiate call: no socket or case");
      return;
    }

    // Clear any previous blocked reason
    setBlockedReason(null);

    console.log("[Socket] Initiating call for case:", currentCase.id);
    socketRef.current.emit("call:initiate", {
      caseId: currentCase.id,
      caseData: currentCase,
      policyConfig: config,
    });
  }, [currentCase, config, setBlockedReason]);

  // Answer incoming call
  const answerCall = useCallback(() => {
    if (!socketRef.current) return;
    console.log("[Socket] Answering call");
    socketRef.current.emit("call:answer");
  }, []);

  // Decline incoming call
  const declineCall = useCallback(() => {
    if (!socketRef.current) return;
    console.log("[Socket] Declining call");
    socketRef.current.emit("call:decline");
  }, []);

  // End active call
  const endCall = useCallback(() => {
    console.log("[Socket] endCall called, socket exists:", !!socketRef.current);
    if (!socketRef.current) {
      console.error("[Socket] Cannot end call - no socket");
      return;
    }
    console.log("[Socket] Emitting call:end");
    socketRef.current.emit("call:end");
    clearAudioQueue();
  }, [clearAudioQueue]);

  return {
    isConnected: !!socketRef.current?.connected,
    isCapturing,
    initiateCall,
    answerCall,
    declineCall,
    endCall,
    // Audio device controls
    audioDevices,
    currentDeviceId,
    switchDevice,
    refreshDevices,
  };
}
