"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { FSMState } from "@/lib/types";

export interface TranscriptMessage {
  id: string;
  side: "agent" | "borrower";
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

export interface Decision {
  turn: number;
  selectedAction: string;
  policyDecisionMs: number;
  availableActions?: string[];
}

export interface SimulationState {
  simulationId: string | null;
  status: "idle" | "starting" | "active" | "completed" | "error";
  personaId: string | null;
  personaPath: FSMState[];
  policyType: string;
  agentState: FSMState;
  borrowerPathIndex: number;
  messages: TranscriptMessage[];
  decisions: Decision[];
  agentPending: string;
  borrowerPending: string;
  error: string | null;
  result: {
    completed: boolean;
    pathCompleted: boolean;
    finalState: FSMState;
    outcome: string;
    totalTurns: number;
    totalDurationMs: number;
  } | null;
}

export interface AudioCallbacks {
  onAgentAudio?: (base64Audio: string) => void;
  onBorrowerAudio?: (base64Audio: string) => void;
}

export function useSimulationSocket(audioCallbacks?: AudioCallbacks) {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<SimulationState>({
    simulationId: null,
    status: "idle",
    personaId: null,
    personaPath: [],
    policyType: "none",
    agentState: "OPENING",
    borrowerPathIndex: 0,
    messages: [],
    decisions: [],
    agentPending: "",
    borrowerPending: "",
    error: null,
    result: null,
  });

  // Initialize socket connection
  useEffect(() => {
    const socket = io({
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[SimSocket] Connected:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("[SimSocket] Disconnected");
    });

    // Simulation lifecycle events
    socket.on("simulation:starting", (data: {
      simulationId: string;
      persona: { id: string; name: string; path: FSMState[] };
      policyType: string;
    }) => {
      console.log("[SimSocket] Simulation starting:", data.simulationId);
      setState((prev) => ({
        ...prev,
        simulationId: data.simulationId,
        status: "starting",
        personaId: data.persona.id,
        personaPath: data.persona.path,
        policyType: data.policyType,
        agentState: "OPENING",
        borrowerPathIndex: 0,
        messages: [],
        decisions: [],
        error: null,
        result: null,
      }));
    });

    socket.on("simulation:started", (data: { simulationId: string }) => {
      console.log("[SimSocket] Simulation started:", data.simulationId);
      setState((prev) => ({
        ...prev,
        status: "active",
      }));
    });

    socket.on("simulation:transcript", (data: {
      side: "agent" | "borrower";
      text: string;
      isFinal: boolean;
      timestamp: string;
    }) => {
      if (data.isFinal) {
        const message: TranscriptMessage = {
          id: `msg-${Date.now()}-${data.side}`,
          side: data.side,
          text: data.text,
          timestamp: new Date(data.timestamp),
          isFinal: true,
        };
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, message],
          agentPending: data.side === "agent" ? "" : prev.agentPending,
          borrowerPending: data.side === "borrower" ? "" : prev.borrowerPending,
        }));
      } else {
        // Streaming/pending text
        setState((prev) => ({
          ...prev,
          agentPending: data.side === "agent" ? data.text : prev.agentPending,
          borrowerPending: data.side === "borrower" ? data.text : prev.borrowerPending,
        }));
      }
    });

    socket.on("simulation:audio", (data: { side: "agent" | "borrower"; audio: string }) => {
      if (data.side === "agent") {
        audioCallbacks?.onAgentAudio?.(data.audio);
      } else {
        audioCallbacks?.onBorrowerAudio?.(data.audio);
      }
    });

    socket.on("simulation:stateChange", (data: {
      agentState: FSMState;
      borrowerPathIndex: number;
    }) => {
      console.log("[SimSocket] State change:", data);
      setState((prev) => ({
        ...prev,
        agentState: data.agentState,
        borrowerPathIndex: data.borrowerPathIndex,
      }));
    });

    socket.on("simulation:decision", (data: {
      turn: number;
      selectedAction: string;
      policyDecisionMs: number;
      availableActions?: string[];
    }) => {
      console.log("[SimSocket] Decision:", data);
      const decision: Decision = {
        turn: data.turn,
        selectedAction: data.selectedAction,
        policyDecisionMs: data.policyDecisionMs,
        availableActions: data.availableActions,
      };
      setState((prev) => ({
        ...prev,
        decisions: [...prev.decisions, decision],
      }));
    });

    socket.on("simulation:complete", (data: {
      simulationId: string;
      completed: boolean;
      pathCompleted: boolean;
      finalState: FSMState;
      outcome: string;
      totalTurns: number;
      totalDurationMs: number;
    }) => {
      console.log("[SimSocket] Simulation complete:", data);
      setState((prev) => ({
        ...prev,
        status: "completed",
        result: {
          completed: data.completed,
          pathCompleted: data.pathCompleted,
          finalState: data.finalState,
          outcome: data.outcome,
          totalTurns: data.totalTurns,
          totalDurationMs: data.totalDurationMs,
        },
      }));
    });

    socket.on("simulation:stopped", (data: { simulationId: string }) => {
      console.log("[SimSocket] Simulation stopped:", data.simulationId);
      setState((prev) => ({
        ...prev,
        status: "idle",
      }));
    });

    socket.on("simulation:error", (data: { error: string }) => {
      console.error("[SimSocket] Error:", data.error);
      setState((prev) => ({
        ...prev,
        status: "error",
        error: data.error,
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, [audioCallbacks]);

  // Start simulation
  const startSimulation = useCallback((config: { personaId: string; policyType: string }) => {
    if (!socketRef.current) {
      console.error("[SimSocket] Cannot start - no socket");
      return;
    }
    console.log("[SimSocket] Starting simulation:", config);
    socketRef.current.emit("simulation:start", config);
  }, []);

  // Stop simulation
  const stopSimulation = useCallback(() => {
    if (!socketRef.current || !state.simulationId) {
      console.error("[SimSocket] Cannot stop - no socket or simulation");
      return;
    }
    console.log("[SimSocket] Stopping simulation:", state.simulationId);
    socketRef.current.emit("simulation:stop", { simulationId: state.simulationId });
  }, [state.simulationId]);

  // Reset state
  const resetSimulation = useCallback(() => {
    setState({
      simulationId: null,
      status: "idle",
      personaId: null,
      personaPath: [],
      policyType: "none",
      agentState: "OPENING",
      borrowerPathIndex: 0,
      messages: [],
      decisions: [],
      agentPending: "",
      borrowerPending: "",
      error: null,
      result: null,
    });
  }, []);

  return {
    ...state,
    isConnected: !!socketRef.current?.connected,
    startSimulation,
    stopSimulation,
    resetSimulation,
  };
}
