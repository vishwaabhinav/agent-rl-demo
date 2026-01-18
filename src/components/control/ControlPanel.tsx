"use client";

import { useCallStore, DEMO_CASES } from "@/stores/callStore";
import { useConfigStore, JURISDICTION_PRESETS } from "@/stores/configStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Phone,
  PhoneOff,
  User,
  MapPin,
  Clock,
  AlertTriangle,
  DollarSign,
  Calendar,
} from "lucide-react";

interface ControlPanelProps {
  onInitiateCall?: () => void;
  onEndCall?: () => void;
}

export function ControlPanel({ onInitiateCall, onEndCall }: ControlPanelProps) {
  const { currentCase, selectCase, status, reset, blockedReason, blockedRiskLevel } = useCallStore();
  const { config, setConfig, setJurisdiction } = useConfigStore();

  const isCallActive = status === "active" || status === "connecting" || status === "ringing";
  const canStartCall = currentCase && status === "idle";

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <div className="p-4 space-y-5 h-full overflow-auto">
      {/* Status is shown in header */}

      {/* Case Selector */}
      <section>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 block">
          Select Case
        </label>
        <Select
          value={currentCase?.id || ""}
          onValueChange={(id) => {
            const caseData = DEMO_CASES.find((c) => c.id === id);
            if (caseData) {
              selectCase(caseData);
              setJurisdiction(caseData.jurisdiction);
            }
          }}
          disabled={isCallActive}
        >
          <SelectTrigger className="bg-card border-border">
            <SelectValue placeholder="Choose a case..." />
          </SelectTrigger>
          <SelectContent>
            {DEMO_CASES.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.debtorName}</span>
                  <Badge variant="outline" className="text-[9px]">
                    {c.jurisdiction}
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {/* Case Details */}
      {currentCase && (
        <section className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <User className="w-4 h-4 text-primary" />
            {currentCase.debtorName}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="w-3 h-3" />
              {currentCase.debtorPhone}
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="w-3 h-3" />
              {currentCase.timezone.split("/")[1]}
            </div>
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3 h-3 text-warning" />
              <span className="text-warning font-semibold">
                {formatCurrency(currentCase.amountDue)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-destructive" />
              <span className="text-destructive">
                {currentCase.daysPastDue} days overdue
              </span>
            </div>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {currentCase.dnc && (
              <Badge variant="destructive" className="text-[9px]">
                DNC
              </Badge>
            )}
            {currentCase.disputed && (
              <Badge variant="destructive" className="text-[9px]">
                DISPUTED
              </Badge>
            )}
            <Badge variant="secondary" className="text-[9px]">
              Attempts: {currentCase.attemptCountToday}/{config.maxAttemptsPerDay}{" "}
              today
            </Badge>
          </div>
        </section>
      )}

      <Separator className="bg-border" />

      {/* Jurisdiction */}
      <section>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 block">
          Jurisdiction
        </label>
        <Select
          value={config.jurisdiction}
          onValueChange={setJurisdiction}
          disabled={isCallActive}
        >
          <SelectTrigger className="bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(JURISDICTION_PRESETS).map((j) => (
              <SelectItem key={j} value={j}>
                {j}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {/* Policy Parameters */}
      <section>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 block">
          Policy Parameters
        </label>
        <div className="space-y-3 rounded-lg border border-border bg-card/50 p-3">
          {/* Call Window */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Call Window
            </span>
            <div className="flex items-center gap-1">
              <Input
                type="time"
                value={config.callWindowStart}
                onChange={(e) => setConfig({ callWindowStart: e.target.value })}
                className="w-[100px] h-7 text-xs bg-input border-border px-2"
                disabled={isCallActive}
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="time"
                value={config.callWindowEnd}
                onChange={(e) => setConfig({ callWindowEnd: e.target.value })}
                className="w-[100px] h-7 text-xs bg-input border-border px-2"
                disabled={isCallActive}
              />
            </div>
          </div>

          {/* Max Attempts Per Day */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              Max/Day
            </span>
            <Input
              type="number"
              min={1}
              max={10}
              value={config.maxAttemptsPerDay}
              onChange={(e) =>
                setConfig({ maxAttemptsPerDay: parseInt(e.target.value) || 1 })
              }
              className="w-16 h-7 text-xs bg-input border-border text-center"
              disabled={isCallActive}
            />
          </div>

          {/* Max Attempts Total */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Max Total</span>
            <Input
              type="number"
              min={1}
              max={50}
              value={config.maxAttemptsTotal}
              onChange={(e) =>
                setConfig({ maxAttemptsTotal: parseInt(e.target.value) || 1 })
              }
              className="w-16 h-7 text-xs bg-input border-border text-center"
              disabled={isCallActive}
            />
          </div>

          {/* Recording Consent */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Recording Consent
            </span>
            <Badge
              variant={config.requireRecordingConsent ? "default" : "secondary"}
              className="text-[9px]"
            >
              {config.requireRecordingConsent ? "Required" : "Not Required"}
            </Badge>
          </div>
        </div>
      </section>

      <Separator className="bg-border" />

      {/* Voice status during active call - voice handled at socket level */}
      {status === "active" && (
        <div className="py-2 text-center">
          <p className="text-xs text-muted-foreground">
            Voice call in progress...
          </p>
        </div>
      )}

      {/* Blocked Reason Alert */}
      {blockedReason && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-1">
          <div className="flex items-center gap-2 text-destructive text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            Call Blocked
          </div>
          <p className="text-xs text-destructive/80">{blockedReason}</p>
          {blockedRiskLevel && (
            <Badge variant="destructive" className="text-[9px]">
              Risk: {blockedRiskLevel}
            </Badge>
          )}
        </div>
      )}

      {/* Call Controls */}
      <section className="pt-2">
        {!isCallActive && status !== "ended" ? (
          <Button
            onClick={() => {
              console.log("[ControlPanel] Initiate Call clicked", {
                onInitiateCall: !!onInitiateCall,
                canStartCall,
                currentCase: !!currentCase,
                status,
              });
              if (onInitiateCall) {
                onInitiateCall();
              }
            }}
            disabled={!canStartCall || !onInitiateCall}
            className="w-full bg-success hover:bg-success/90 text-success-foreground font-semibold"
            size="lg"
          >
            <Phone className="w-4 h-4 mr-2" />
            Initiate Call
          </Button>
        ) : status === "ended" || status === "declined" ? (
          <Button
            onClick={() => reset()}
            variant="outline"
            className="w-full"
            size="lg"
          >
            New Session
          </Button>
        ) : (
          <Button
            onClick={() => onEndCall?.()}
            variant="destructive"
            className="w-full font-semibold"
            size="lg"
          >
            <PhoneOff className="w-4 h-4 mr-2" />
            End Call
          </Button>
        )}
      </section>

      {/* Status Indicator */}
      {status !== "idle" && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              status === "active"
                ? "bg-success blink"
                : status === "ringing"
                ? "bg-amber-500 blink"
                : status === "connecting"
                ? "bg-warning blink"
                : status === "ending"
                ? "bg-destructive"
                : "bg-muted-foreground"
            }`}
          />
          <span className="text-muted-foreground capitalize">{status}</span>
        </div>
      )}
    </div>
  );
}
