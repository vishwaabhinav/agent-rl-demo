"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { CaseData, FSMState, Message, PolicyConfig, TurnTrace } from "@/lib/types";

export interface SocketCallbacks {
  onSessionStarted?: (data: {
    sessionId: string;
    message: Message;
    trace: TurnTrace;
    state: FSMState;
  }) => void;
  onMessageReceived?: (data: { message: Message }) => void;
  onMessageResponse?: (data: {
    message: Message;
    trace: TurnTrace;
    state: FSMState;
  }) => void;
  onSessionEnded?: (data: {
    sessionId: string;
    finalState: FSMState;
    turnCount: number;
  }) => void;
  onError?: (data: { error: string }) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useSocket(callbacks?: SocketCallbacks) {
  const socketRef = useRef<Socket | null>(null);
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref up to date
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Initialize socket connection
  useEffect(() => {
    const socket = io({
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Socket] Connected:", socket.id);
      callbacksRef.current?.onConnect?.();
    });

    socket.on("disconnect", () => {
      console.log("[Socket] Disconnected");
      callbacksRef.current?.onDisconnect?.();
    });

    socket.on("session:started", (data) => {
      console.log("[Socket] Session started:", data.sessionId);
      callbacksRef.current?.onSessionStarted?.(data);
    });

    socket.on("message:received", (data) => {
      callbacksRef.current?.onMessageReceived?.(data);
    });

    socket.on("message:response", (data) => {
      console.log("[Socket] Message response:", data.state);
      callbacksRef.current?.onMessageResponse?.(data);
    });

    socket.on("session:ended", (data) => {
      console.log("[Socket] Session ended:", data.sessionId);
      callbacksRef.current?.onSessionEnded?.(data);
    });

    socket.on("session:error", (data) => {
      console.error("[Socket] Session error:", data.error);
      callbacksRef.current?.onError?.(data);
    });

    socket.on("message:error", (data) => {
      console.error("[Socket] Message error:", data.error);
      callbacksRef.current?.onError?.(data);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const startSession = useCallback((caseData: CaseData, policyConfig: PolicyConfig) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("session:start", { caseData, policyConfig });
    } else {
      console.error("[Socket] Not connected, cannot start session");
      callbacksRef.current?.onError?.({ error: "Not connected to server" });
    }
  }, []);

  const sendMessage = useCallback((sessionId: string, text: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("message:send", { sessionId, text });
    } else {
      console.error("[Socket] Not connected, cannot send message");
      callbacksRef.current?.onError?.({ error: "Not connected to server" });
    }
  }, []);

  const endSession = useCallback((sessionId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("session:end", { sessionId });
    }
  }, []);

  const isConnected = useCallback(() => {
    return socketRef.current?.connected ?? false;
  }, []);

  return {
    startSession,
    sendMessage,
    endSession,
    isConnected,
    socket: socketRef.current,
  };
}

// Export types for use elsewhere
export type { Socket };
