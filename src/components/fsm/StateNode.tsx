"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { FSMState } from "@/lib/types";

// Data structure for state node
export interface StateNodeData extends Record<string, unknown> {
  label: string;
  state: FSMState;
  isCurrent: boolean;
  isVisited: boolean;
  isTerminal: boolean;
  isBranch: boolean;
}

// Node type following @xyflow/react pattern
export type StateNodeType = Node<StateNodeData, "stateNode">;

export const StateNode = memo(function StateNode({
  data,
}: NodeProps<StateNodeType>) {
  const { label, isCurrent, isVisited, isTerminal, isBranch } = data;

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-transparent !border-0 !w-2 !h-2"
      />
      <div
        className={cn(
          "px-3 py-1.5 rounded border text-[11px] font-medium tracking-wide transition-all duration-300 min-w-[90px] text-center",
          // Base styles
          "bg-card border-border text-muted-foreground",
          // Visited state
          isVisited && !isCurrent && "border-success/40 text-success/70 bg-success/5",
          // Current state - glowing
          isCurrent && "border-primary bg-primary/10 text-primary glow-cyan pulse-active",
          // Terminal state
          isTerminal && !isCurrent && "border-muted-foreground/30 bg-muted/30",
          isTerminal && isCurrent && "border-warning bg-warning/10 text-warning glow-warning",
          // Branch states
          isBranch && !isCurrent && !isVisited && "border-destructive/30 text-destructive/50",
          isBranch && isVisited && !isCurrent && "border-destructive/50 text-destructive/70 bg-destructive/5",
          isBranch && isCurrent && "border-destructive bg-destructive/10 text-destructive glow-destructive"
        )}
      >
        {/* Status indicator dot */}
        {isCurrent && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary blink" />
        )}
        {label}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-transparent !border-0 !w-2 !h-2"
      />
    </>
  );
});
