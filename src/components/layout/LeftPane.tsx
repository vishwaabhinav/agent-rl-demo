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
    <div className="h-full flex flex-col bg-[#0a0e14]">
      {/* Tabs */}
      <Tabs defaultValue="control" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full rounded-none bg-[#080b10] h-8 p-0 flex-shrink-0 flex">
          <TabsTrigger
            value="control"
            className="h-8 px-3 rounded-none data-[state=active]:bg-[#0d1219] data-[state=active]:text-[#00d4ff] text-[10px] uppercase tracking-wider font-medium text-[#5a6a7a] transition-colors"
          >
            <Settings className="w-3 h-3 mr-1.5" />
            Control
          </TabsTrigger>
          <TabsTrigger
            value="fsm"
            className="h-8 px-3 rounded-none data-[state=active]:bg-[#0d1219] data-[state=active]:text-[#00d4ff] text-[10px] uppercase tracking-wider font-medium text-[#5a6a7a] transition-colors"
          >
            <GitBranch className="w-3 h-3 mr-1.5" />
            FSM
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
