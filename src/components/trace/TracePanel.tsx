"use client";

import { useCallStore } from "@/stores/callStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Shield,
  Brain,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  ChevronRight,
} from "lucide-react";
import type { TurnTrace } from "@/lib/types";

export function TracePanel() {
  const { currentTurnTrace, traceHistory, status } = useCallStore();

  if (status === "idle") {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <Shield className="w-8 h-8 mx-auto opacity-30" />
          <p className="text-xs">Trace data will appear here</p>
        </div>
      </div>
    );
  }

  const displayTrace = currentTurnTrace || (traceHistory.length > 0 ? traceHistory[traceHistory.length - 1] : null);

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        {/* Header with turn count */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground uppercase tracking-wider font-semibold">
            Trace Log
          </span>
          <Badge variant="outline" className="text-[9px]">
            Turn {traceHistory.length}
          </Badge>
        </div>

        {displayTrace ? (
          <>
            {/* Policy Decision */}
            <PolicySection trace={displayTrace} />

            {/* LLM Output */}
            <LLMSection trace={displayTrace} />

            {/* Validation */}
            <ValidationSection trace={displayTrace} />

            {/* Metrics */}
            <MetricsSection trace={displayTrace} />
          </>
        ) : (
          <div className="text-center text-xs text-muted-foreground py-8">
            Waiting for first turn...
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function PolicySection({ trace }: { trace: TurnTrace }) {
  const { policyDecision } = trace;
  const isAllowed = policyDecision.allowed;

  return (
    <section className="rounded border border-border bg-card/50 overflow-hidden">
      <div
        className={cn(
          "px-3 py-1.5 flex items-center justify-between border-b",
          isAllowed ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"
        )}
      >
        <span className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Shield className="w-3 h-3" />
          Policy
        </span>
        <Badge
          variant={isAllowed ? "default" : "destructive"}
          className={cn("text-[9px]", isAllowed && "bg-success text-success-foreground")}
        >
          {isAllowed ? "ALLOWED" : "BLOCKED"}
        </Badge>
      </div>
      <div className="px-3 py-2 space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Risk Level</span>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px]",
              policyDecision.riskLevel === "HIGH" && "border-destructive text-destructive",
              policyDecision.riskLevel === "MEDIUM" && "border-warning text-warning",
              policyDecision.riskLevel === "LOW" && "border-success text-success"
            )}
          >
            {policyDecision.riskLevel}
          </Badge>
        </div>
        {policyDecision.forcedTransition && (
          <div className="flex items-center gap-1 text-warning">
            <ChevronRight className="w-3 h-3" />
            <span>Forced: {policyDecision.forcedTransition}</span>
          </div>
        )}
        {policyDecision.blockedReasons.length > 0 && (
          <div className="space-y-0.5 pt-1">
            {policyDecision.blockedReasons.map((reason, i) => (
              <div key={i} className="flex items-start gap-1 text-destructive">
                <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        )}
        {policyDecision.requiredTemplates.length > 0 && (
          <div className="flex gap-1 flex-wrap pt-1">
            {policyDecision.requiredTemplates.map((t) => (
              <Badge key={t} variant="secondary" className="text-[8px]">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function LLMSection({ trace }: { trace: TurnTrace }) {
  const { llmOutput } = trace;

  return (
    <section className="rounded border border-border bg-card/50 overflow-hidden">
      <div className="px-3 py-1.5 flex items-center justify-between border-b border-border bg-primary/5">
        <span className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Brain className="w-3 h-3" />
          LLM Response
        </span>
        <Badge variant="outline" className="text-[9px] border-primary/50 text-primary">
          {llmOutput.chosenIntent}
        </Badge>
      </div>
      <div className="px-3 py-2 space-y-2 text-xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Confidence</span>
          <div className="flex items-center gap-1">
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${llmOutput.confidence * 100}%` }}
              />
            </div>
            <span className="text-[10px] w-8 text-right">
              {Math.round(llmOutput.confidence * 100)}%
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Tokens</span>
          <span className="font-mono">{llmOutput.tokensUsed}</span>
        </div>
        {llmOutput.toolCalls.length > 0 && (
          <div className="pt-1 border-t border-border">
            <span className="text-muted-foreground text-[10px]">Tool Calls:</span>
            {llmOutput.toolCalls.map((call, i) => (
              <div key={i} className="mt-1 p-1.5 bg-muted/50 rounded text-[10px] font-mono">
                <span className="text-primary">{call.tool}</span>
                <span className="text-muted-foreground">
                  ({JSON.stringify(call.args)})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ValidationSection({ trace }: { trace: TurnTrace }) {
  const { validationResult } = trace;
  const passed = validationResult.passed;

  return (
    <section className="rounded border border-border bg-card/50 overflow-hidden">
      <div
        className={cn(
          "px-3 py-1.5 flex items-center justify-between border-b",
          passed ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"
        )}
      >
        <span className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5">
          {passed ? (
            <CheckCircle className="w-3 h-3 text-success" />
          ) : (
            <AlertTriangle className="w-3 h-3 text-warning" />
          )}
          Validation
        </span>
        <Badge
          variant={passed ? "default" : "secondary"}
          className={cn("text-[9px]", passed && "bg-success text-success-foreground")}
        >
          {passed ? "PASSED" : "FAILED"}
        </Badge>
      </div>
      <div className="px-3 py-2 space-y-1 text-xs">
        {passed ? (
          <div className="flex items-center gap-1 text-success">
            <CheckCircle className="w-3 h-3" />
            <span>All validators passed</span>
          </div>
        ) : (
          <>
            {validationResult.failures.map((f, i) => (
              <div key={i} className="flex items-start gap-1 text-warning">
                <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-semibold">{f.validator}:</span>{" "}
                  <span className="text-muted-foreground">{f.detail}</span>
                </div>
              </div>
            ))}
            {validationResult.repairsAttempted > 0 && (
              <div className="text-muted-foreground pt-1">
                Repairs attempted: {validationResult.repairsAttempted}
              </div>
            )}
            {validationResult.fallbackUsed && (
              <Badge variant="destructive" className="text-[9px]">
                Fallback Used
              </Badge>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function MetricsSection({ trace }: { trace: TurnTrace }) {
  return (
    <section className="rounded border border-border bg-card/50 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Latency
        </span>
        <span className="font-mono text-primary">{trace.latencyMs}ms</span>
      </div>
      <div className="flex items-center justify-between text-xs mt-2">
        <span className="text-muted-foreground flex items-center gap-1">
          <Zap className="w-3 h-3" />
          Transition
        </span>
        <span className="font-mono">
          <span className="text-muted-foreground">{trace.fsmStateBefore}</span>
          <span className="text-primary mx-1">→</span>
          <span className="text-success">{trace.fsmStateAfter}</span>
        </span>
      </div>
    </section>
  );
}
