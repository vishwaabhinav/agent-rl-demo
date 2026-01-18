"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCallStore } from "@/stores/callStore";
import type { CaseData, FSMState, Message, PolicyConfig, TurnTrace } from "@/lib/types";
import { runDemoConversation, stopDemoConversation } from "@/lib/demo/playback";
import { useSocket, type SocketCallbacks } from "@/lib/socket/useSocket";

// Check if we're in demo mode (no socket server available)
const isDemoMode = () => {
  if (typeof window === "undefined") return false;
  // Check if DEMO_MODE env var is set, or detect if socket connection fails
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
};

export interface UseCallSessionReturn {
  isConnected: boolean;
  isProcessing: boolean;
  startCall: () => void;
  endCall: () => void;
  sendMessage: (text: string) => void;
}

export function useCallSession(): UseCallSessionReturn {
  const {
    currentCase,
    status,
    sessionId,
    setStatus,
    setSessionId,
    addMessage,
    setCurrentState,
    setTurnTrace,
    setAgentSpeaking,
    setUserSpeaking,
    isProcessing,
    setIsProcessing,
  } = useCallStore();
  const { config } = require("@/stores/configStore").useConfigStore();

  const [isConnected, setIsConnected] = useState(false);
  const [useDemoMode, setUseDemoMode] = useState(isDemoMode());
  const connectionAttemptedRef = useRef(false);

  // Socket callbacks
  const handleSessionStarted = useCallback(
    (data: { sessionId: string; message: Message; trace: TurnTrace; state: FSMState }) => {
      setSessionId(data.sessionId);
      setStatus("active");
      addMessage(data.message);
      setTurnTrace(data.trace);
      setCurrentState(data.state);
      setAgentSpeaking(true);
      setTimeout(() => setAgentSpeaking(false), 1500);
      setIsProcessing(false);
    },
    [setSessionId, setStatus, addMessage, setTurnTrace, setCurrentState, setAgentSpeaking, setIsProcessing]
  );

  const handleMessageResponse = useCallback(
    (data: { message: Message; trace: TurnTrace; state: FSMState }) => {
      addMessage(data.message);
      setTurnTrace(data.trace);
      setCurrentState(data.state);
      setAgentSpeaking(true);
      setTimeout(() => setAgentSpeaking(false), 1500);
      setIsProcessing(false);
    },
    [addMessage, setTurnTrace, setCurrentState, setAgentSpeaking, setIsProcessing]
  );

  const handleSessionEnded = useCallback(() => {
    setStatus("ended");
    setAgentSpeaking(false);
    setIsProcessing(false);
  }, [setStatus, setAgentSpeaking, setIsProcessing]);

  const handleError = useCallback(
    (data: { error: string }) => {
      console.error("Socket error:", data.error);
      setIsProcessing(false);
      // If we get an error and haven't connected, switch to demo mode
      if (!connectionAttemptedRef.current) {
        setUseDemoMode(true);
        setIsConnected(true); // Demo mode is always "connected"
      }
    },
    [setIsProcessing]
  );

  const handleConnect = useCallback(() => {
    connectionAttemptedRef.current = true;
    setIsConnected(true);
    setUseDemoMode(false);
  }, []);

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
  }, []);

  // Only use socket in non-demo mode
  const socketCallbacks: SocketCallbacks | undefined = useDemoMode
    ? undefined
    : {
        onSessionStarted: handleSessionStarted,
        onMessageResponse: handleMessageResponse,
        onSessionEnded: handleSessionEnded,
        onError: handleError,
        onConnect: handleConnect,
        onDisconnect: handleDisconnect,
      };

  const socket = useSocket(socketCallbacks);

  // In demo mode, set connected immediately
  useEffect(() => {
    if (useDemoMode) {
      setIsConnected(true);
    }
  }, [useDemoMode]);

  // Connection timeout - if no connection after 3 seconds, switch to demo mode
  useEffect(() => {
    if (!useDemoMode && !isConnected) {
      const timeout = setTimeout(() => {
        if (!isConnected) {
          console.log("Socket connection timeout, switching to demo mode");
          setUseDemoMode(true);
          setIsConnected(true);
        }
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [useDemoMode, isConnected]);

  const startCall = useCallback(() => {
    if (!currentCase) return;

    if (useDemoMode) {
      // Demo mode: use local playback
      const demoSessionId = `demo-${Date.now()}`;
      setSessionId(demoSessionId);
      setStatus("connecting");
      setCurrentState("OPENING");

      setTimeout(() => {
        setStatus("active");
        runDemoConversation(currentCase, {
          addMessage: (msg) => addMessage(msg),
          setCurrentState,
          setTurnTrace,
          setAgentSpeaking,
          setUserSpeaking,
        });
      }, 500);
    } else {
      // Real mode: use socket
      setStatus("connecting");
      setIsProcessing(true);
      socket.startSession(currentCase, config);
    }
  }, [
    currentCase,
    useDemoMode,
    socket,
    config,
    setSessionId,
    setStatus,
    setCurrentState,
    addMessage,
    setTurnTrace,
    setAgentSpeaking,
    setUserSpeaking,
    setIsProcessing,
  ]);

  const endCall = useCallback(() => {
    if (useDemoMode) {
      stopDemoConversation();
    } else if (sessionId) {
      socket.endSession(sessionId);
    }

    setStatus("ending");
    setTimeout(() => {
      setStatus("ended");
      setAgentSpeaking(false);
    }, 300);
  }, [useDemoMode, sessionId, socket, setStatus, setAgentSpeaking]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!sessionId || status !== "active") return;

      if (useDemoMode) {
        // In demo mode, just add the message - no processing
        addMessage({ role: "user", text });
        // Simulate agent response after a delay
        setIsProcessing(true);
        setTimeout(() => {
          addMessage({
            role: "agent",
            text: "I understand. Let me help you with that. (Demo mode - real responses require the backend server)",
          });
          setIsProcessing(false);
        }, 1000);
      } else {
        // Real mode: add message and send via socket
        addMessage({ role: "user", text });
        setIsProcessing(true);
        socket.sendMessage(sessionId, text);
      }
    },
    [useDemoMode, sessionId, status, socket, addMessage, setIsProcessing]
  );

  return {
    isConnected,
    isProcessing,
    startCall,
    endCall,
    sendMessage,
  };
}
