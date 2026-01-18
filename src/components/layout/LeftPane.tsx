"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ControlPanel } from "@/components/control/ControlPanel";
import { FSMDiagram } from "@/components/fsm/FSMDiagram";
import { Settings, GitBranch } from "lucide-react";

interface LeftPaneProps {
  onInitiateCall?: () => void;
  onEndCall?: () => void;
}

export function LeftPane({ onInitiateCall, onEndCall }: LeftPaneProps) {
  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-sidebar-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary pulse-active" />
          <h1 className="text-sm font-bold tracking-wide text-foreground">
            RECOVERY AGENT
          </h1>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 tracking-wider">
          COLLECTION HARNESS v0.1
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="control" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full rounded-none border-b border-sidebar-border bg-transparent h-auto p-0 flex-shrink-0">
          <TabsTrigger
            value="control"
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary py-2.5 text-xs uppercase tracking-wider font-semibold"
          >
            <Settings className="w-3.5 h-3.5 mr-1.5" />
            Control
          </TabsTrigger>
          <TabsTrigger
            value="fsm"
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary py-2.5 text-xs uppercase tracking-wider font-semibold"
          >
            <GitBranch className="w-3.5 h-3.5 mr-1.5" />
            State Machine
          </TabsTrigger>
        </TabsList>

        <TabsContent value="control" className="flex-1 mt-0 min-h-0 overflow-auto">
          <ControlPanel onInitiateCall={onInitiateCall} onEndCall={onEndCall} />
        </TabsContent>

        <TabsContent value="fsm" className="flex-1 mt-0 min-h-0 overflow-hidden">
          <FSMDiagram />
        </TabsContent>
      </Tabs>
    </div>
  );
}
