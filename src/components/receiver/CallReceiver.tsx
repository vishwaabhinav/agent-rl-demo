"use client";

import { useCallStore } from "@/stores/callStore";
import { IdleScreen } from "./IdleScreen";
import { IncomingCall } from "./IncomingCall";
import { ActiveCall } from "./ActiveCall";
import { CallEnded } from "./CallEnded";
import { MicSelector } from "./MicSelector";

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface CallReceiverProps {
  audioDevices: AudioDevice[];
  currentDeviceId: string | undefined;
  onDeviceChange: (deviceId: string) => void;
  onRefreshDevices: () => void;
  isCapturing: boolean;
}

export function CallReceiver({
  audioDevices,
  currentDeviceId,
  onDeviceChange,
  onRefreshDevices,
  isCapturing,
}: CallReceiverProps) {
  const status = useCallStore((state) => state.status);

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#0a0a12] to-[#12121a] relative overflow-hidden">
      {/* Subtle grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
        }}
      />

      {/* Phone frame decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black/40 rounded-b-2xl flex items-center justify-center">
        <div className="w-16 h-1 bg-gray-700 rounded-full" />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col relative z-10 pt-8">
        {status === "idle" && <IdleScreen />}
        {status === "ringing" && <IncomingCall />}
        {(status === "connecting" || status === "active") && <ActiveCall />}
        {status === "ended" && <CallEnded />}
      </div>

      {/* Mic selector - shown during idle and active */}
      {(status === "idle" || status === "active") && (
        <div className="px-4 pb-2 relative z-10">
          <MicSelector
            devices={audioDevices}
            currentDeviceId={currentDeviceId}
            onDeviceChange={onDeviceChange}
            onRefresh={onRefreshDevices}
            isCapturing={isCapturing}
          />
        </div>
      )}

      {/* Bottom safe area */}
      <div className="h-6 bg-gradient-to-t from-black/20 to-transparent" />
    </div>
  );
}
