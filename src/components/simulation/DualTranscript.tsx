"use client";

import { useRef, useEffect } from "react";

interface Message {
  id: string;
  side: "agent" | "borrower";
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

interface DualTranscriptProps {
  messages: Message[];
  agentPending?: string;
  borrowerPending?: string;
}

export function DualTranscript({ messages, agentPending, borrowerPending }: DualTranscriptProps) {
  const agentRef = useRef<HTMLDivElement>(null);
  const borrowerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    agentRef.current?.scrollTo({ top: agentRef.current.scrollHeight, behavior: "smooth" });
    borrowerRef.current?.scrollTo({ top: borrowerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, agentPending, borrowerPending]);

  const agentMessages = messages.filter((m) => m.side === "agent");
  const borrowerMessages = messages.filter((m) => m.side === "borrower");

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      {/* Agent Side */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col">
        <div className="px-3 py-2 border-b border-zinc-800">
          <span className="text-xs font-medium text-blue-400">Agent (Left Channel)</span>
        </div>
        <div ref={agentRef} className="flex-1 overflow-y-auto p-3 space-y-2">
          {agentMessages.map((msg) => (
            <div key={msg.id} className="text-sm text-zinc-300">
              {msg.text}
            </div>
          ))}
          {agentPending && (
            <div className="text-sm text-zinc-500 italic">{agentPending}...</div>
          )}
        </div>
      </div>

      {/* Borrower Side */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col">
        <div className="px-3 py-2 border-b border-zinc-800">
          <span className="text-xs font-medium text-amber-400">Borrower (Right Channel)</span>
        </div>
        <div ref={borrowerRef} className="flex-1 overflow-y-auto p-3 space-y-2">
          {borrowerMessages.map((msg) => (
            <div key={msg.id} className="text-sm text-zinc-300">
              {msg.text}
            </div>
          ))}
          {borrowerPending && (
            <div className="text-sm text-zinc-500 italic">{borrowerPending}...</div>
          )}
        </div>
      </div>
    </div>
  );
}
