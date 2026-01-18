"use client";

import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallStore } from "@/stores/callStore";
import { StateNode, type StateNodeType } from "./StateNode";
import type { FSMState } from "@/lib/types";

// Node positions for the FSM layout
const NODE_POSITIONS: Record<FSMState, { x: number; y: number }> = {
  OPENING: { x: 180, y: 0 },
  DISCLOSURE: { x: 180, y: 70 },
  IDENTITY_VERIFICATION: { x: 180, y: 140 },
  CONSENT_RECORDING: { x: 180, y: 210 },
  DEBT_CONTEXT: { x: 180, y: 280 },
  NEGOTIATION: { x: 180, y: 350 },
  PAYMENT_SETUP: { x: 180, y: 420 },
  WRAPUP: { x: 180, y: 490 },
  END_CALL: { x: 180, y: 560 },
  // Branch states on the right
  WRONG_PARTY_FLOW: { x: 380, y: 140 },
  DISPUTE_FLOW: { x: 380, y: 280 },
  CALLBACK_SCHEDULED: { x: 380, y: 350 },
  DO_NOT_CALL: { x: 380, y: 420 },
  ESCALATE_HUMAN: { x: 380, y: 490 },
};

const STATE_LABELS: Record<FSMState, string> = {
  OPENING: "Opening",
  DISCLOSURE: "Disclosure",
  IDENTITY_VERIFICATION: "ID Verify",
  CONSENT_RECORDING: "Consent",
  DEBT_CONTEXT: "Debt Context",
  NEGOTIATION: "Negotiation",
  PAYMENT_SETUP: "Payment",
  WRAPUP: "Wrap Up",
  END_CALL: "End Call",
  WRONG_PARTY_FLOW: "Wrong Party",
  DISPUTE_FLOW: "Dispute",
  CALLBACK_SCHEDULED: "Callback",
  DO_NOT_CALL: "DNC",
  ESCALATE_HUMAN: "Escalate",
};

// Properly typed nodeTypes for @xyflow/react
const nodeTypes = {
  stateNode: StateNode,
} as const;

export function FSMDiagram() {
  const { currentState, stateHistory } = useCallStore();

  const nodes: StateNodeType[] = useMemo(() => {
    return (Object.keys(NODE_POSITIONS) as FSMState[]).map((state) => ({
      id: state,
      type: "stateNode" as const,
      position: NODE_POSITIONS[state],
      data: {
        label: STATE_LABELS[state],
        state,
        isCurrent: state === currentState,
        isVisited: stateHistory.includes(state),
        isTerminal: state === "END_CALL",
        isBranch: ["DISPUTE_FLOW", "WRONG_PARTY_FLOW", "DO_NOT_CALL", "ESCALATE_HUMAN", "CALLBACK_SCHEDULED"].includes(state),
      },
      draggable: false,
    }));
  }, [currentState, stateHistory]);

  const edges: Edge[] = useMemo(() => {
    const baseEdgeStyle = {
      stroke: "#1e3a4f",
      strokeWidth: 1.5,
    };
    const activeEdgeStyle = {
      stroke: "#00d4ff",
      strokeWidth: 2,
      filter: "drop-shadow(0 0 4px rgba(0, 212, 255, 0.5))",
    };
    const branchEdgeStyle = {
      stroke: "#ff4757",
      strokeWidth: 1.5,
      strokeDasharray: "5,5",
    };

    const isEdgeActive = (source: FSMState, target: FSMState) => {
      const sourceIdx = stateHistory.indexOf(source);
      const targetIdx = stateHistory.indexOf(target);
      return sourceIdx !== -1 && targetIdx !== -1 && targetIdx === sourceIdx + 1;
    };

    const mainFlow: Edge[] = [
      { id: "e1", source: "OPENING", target: "DISCLOSURE" },
      { id: "e2", source: "DISCLOSURE", target: "IDENTITY_VERIFICATION" },
      { id: "e3", source: "IDENTITY_VERIFICATION", target: "CONSENT_RECORDING" },
      { id: "e4", source: "CONSENT_RECORDING", target: "DEBT_CONTEXT" },
      { id: "e5", source: "DEBT_CONTEXT", target: "NEGOTIATION" },
      { id: "e6", source: "NEGOTIATION", target: "PAYMENT_SETUP" },
      { id: "e7", source: "PAYMENT_SETUP", target: "WRAPUP" },
      { id: "e8", source: "WRAPUP", target: "END_CALL" },
    ].map((e) => ({
      ...e,
      type: "smoothstep",
      style: isEdgeActive(e.source as FSMState, e.target as FSMState) ? activeEdgeStyle : baseEdgeStyle,
      animated: isEdgeActive(e.source as FSMState, e.target as FSMState),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isEdgeActive(e.source as FSMState, e.target as FSMState) ? "#00d4ff" : "#1e3a4f",
        width: 15,
        height: 15,
      },
    }));

    const branchEntries: Edge[] = [
      { id: "e9", source: "IDENTITY_VERIFICATION", target: "WRONG_PARTY_FLOW" },
      { id: "e10", source: "DEBT_CONTEXT", target: "DISPUTE_FLOW" },
      { id: "e11", source: "NEGOTIATION", target: "CALLBACK_SCHEDULED" },
      { id: "e12", source: "NEGOTIATION", target: "DO_NOT_CALL" },
      { id: "e13", source: "NEGOTIATION", target: "ESCALATE_HUMAN" },
    ].map((e) => ({
      ...e,
      type: "smoothstep",
      style: isEdgeActive(e.source as FSMState, e.target as FSMState)
        ? { ...activeEdgeStyle, stroke: "#ff4757" }
        : branchEdgeStyle,
      animated: isEdgeActive(e.source as FSMState, e.target as FSMState),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isEdgeActive(e.source as FSMState, e.target as FSMState) ? "#ff4757" : "#ff4757",
        width: 12,
        height: 12,
      },
    }));

    const branchExits: Edge[] = [
      { id: "e14", source: "WRONG_PARTY_FLOW", target: "END_CALL" },
      { id: "e15", source: "DISPUTE_FLOW", target: "END_CALL" },
      { id: "e16", source: "CALLBACK_SCHEDULED", target: "END_CALL" },
      { id: "e17", source: "DO_NOT_CALL", target: "END_CALL" },
      { id: "e18", source: "ESCALATE_HUMAN", target: "END_CALL" },
    ].map((e) => ({
      ...e,
      type: "smoothstep",
      style: isEdgeActive(e.source as FSMState, e.target as FSMState)
        ? { ...activeEdgeStyle, stroke: "#ff4757" }
        : { ...branchEdgeStyle, stroke: "#6b7a8f" },
      animated: isEdgeActive(e.source as FSMState, e.target as FSMState),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#6b7a8f",
        width: 12,
        height: 12,
      },
    }));

    return [...mainFlow, ...branchEntries, ...branchExits];
  }, [stateHistory]);

  const onNodeClick = useCallback(() => {
    // Placeholder for potential interaction
  }, []);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="#1e3a4f"
        />
        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          position="bottom-right"
        />
      </ReactFlow>
    </div>
  );
}
