"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, ChevronDown, Check, RefreshCw } from "lucide-react";

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface MicSelectorProps {
  devices: AudioDevice[];
  currentDeviceId: string | undefined;
  onDeviceChange: (deviceId: string) => void;
  onRefresh: () => void;
  isCapturing: boolean;
}

export function MicSelector({
  devices,
  currentDeviceId,
  onDeviceChange,
  onRefresh,
  isCapturing,
}: MicSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentDevice = devices.find((d) => d.deviceId === currentDeviceId);
  const displayLabel = currentDevice?.label || "Select Microphone";

  // Truncate long labels
  const truncate = (str: string, maxLen: number) => {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + "...";
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm transition-colors"
      >
        <Mic
          className={`w-4 h-4 ${isCapturing ? "text-green-400" : "text-gray-400"}`}
        />
        <span className="text-gray-300 max-w-[140px] truncate">
          {truncate(displayLabel, 20)}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 w-64 bg-[#1a1a24] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">
              Input Device
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Refresh devices"
            >
              <RefreshCw className="w-3 h-3 text-gray-500" />
            </button>
          </div>

          {/* Device list */}
          <div className="max-h-48 overflow-y-auto">
            {devices.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                No microphones found
              </div>
            ) : (
              devices.map((device) => (
                <button
                  key={device.deviceId}
                  onClick={() => {
                    onDeviceChange(device.deviceId);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 transition-colors ${
                    device.deviceId === currentDeviceId
                      ? "bg-cyan-500/10 text-cyan-400"
                      : "text-gray-300"
                  }`}
                >
                  <div className="w-4 h-4 flex items-center justify-center">
                    {device.deviceId === currentDeviceId && (
                      <Check className="w-3 h-3" />
                    )}
                  </div>
                  <span className="truncate">{device.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
