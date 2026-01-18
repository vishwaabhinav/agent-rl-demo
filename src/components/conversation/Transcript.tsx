"use client";

import { useEffect, useRef } from "react";
import { useCallStore } from "@/stores/callStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Bot, User, Mic, Volume2 } from "lucide-react";

export function Transcript() {
  const { messages, status, isUserSpeaking, isAgentSpeaking } = useCallStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (status === "idle") {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <Bot className="w-10 h-10 mx-auto opacity-30" />
          <p className="text-sm">Select a case and start a call</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {/* Connection message */}
        {status === "connecting" && (
          <div className="text-center text-xs text-muted-foreground py-2">
            <span className="inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-warning rounded-full blink" />
              Connecting...
            </span>
          </div>
        )}

        {/* Messages */}
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3 message-enter",
              message.role === "user" ? "flex-row-reverse" : "flex-row"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Avatar */}
            <div
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
                message.role === "agent"
                  ? "bg-primary/20 text-primary"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              {message.role === "agent" ? (
                <Bot className="w-4 h-4" />
              ) : (
                <User className="w-4 h-4" />
              )}
            </div>

            {/* Message bubble */}
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                message.role === "agent"
                  ? "bg-card border border-border text-card-foreground"
                  : "bg-primary/10 border border-primary/20 text-foreground"
              )}
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              <span className="text-[10px] text-muted-foreground mt-1 block">
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          </div>
        ))}

        {/* Speaking indicators */}
        {isAgentSpeaking && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center">
              <Volume2 className="w-4 h-4 blink" />
            </div>
            <div className="bg-card border border-border rounded-lg px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {isUserSpeaking && (
          <div className="flex gap-3 flex-row-reverse">
            <div className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center">
              <Mic className="w-4 h-4 blink" />
            </div>
            <div className="bg-success/10 border border-success/20 rounded-lg px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-success rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-success rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-success rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {/* End of call */}
        {status === "ended" && (
          <div className="text-center text-xs text-muted-foreground py-4 border-t border-border mt-4">
            <span className="inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full" />
              Call ended
            </span>
          </div>
        )}

        <div ref={scrollRef} />
      </div>
    </ScrollArea>
  );
}
