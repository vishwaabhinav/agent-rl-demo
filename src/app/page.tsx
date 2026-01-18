"use client";

import { LeftPane } from "@/components/layout/LeftPane";
import { MiddlePane } from "@/components/layout/MiddlePane";
import { CallReceiver } from "@/components/receiver/CallReceiver";
import { useVoiceSocket } from "@/hooks/useVoiceSocket";

export default function Home() {
  // Initialize voice socket connection
  const {
    isConnected,
    initiateCall,
    endCall,
    audioDevices,
    currentDeviceId,
    switchDevice,
    refreshDevices,
    isCapturing,
  } = useVoiceSocket();

  return (
    <main className="h-screen flex overflow-hidden grid-bg">
      {/* Left Pane - Control Panel (380px) */}
      <div className="w-[380px] flex-shrink-0">
        <LeftPane onInitiateCall={initiateCall} onEndCall={endCall} />
      </div>

      {/* Middle Pane - Debug/Trace View (flex grow) */}
      <div className="flex-1 min-w-0">
        <MiddlePane />
      </div>

      {/* Right Pane - Call Receiver Phone UI (380px) */}
      <div className="w-[380px] flex-shrink-0 border-l border-gray-800/50">
        <CallReceiver
          audioDevices={audioDevices}
          currentDeviceId={currentDeviceId}
          onDeviceChange={switchDevice}
          onRefreshDevices={refreshDevices}
          isCapturing={isCapturing}
        />
      </div>
    </main>
  );
}
