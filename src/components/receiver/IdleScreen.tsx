"use client";

import { Phone } from "lucide-react";

export function IdleScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="text-center space-y-6">
        {/* Phone icon with subtle pulse */}
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-gray-800/50 flex items-center justify-center mx-auto">
            <Phone className="w-8 h-8 text-gray-500" />
          </div>
          <div className="absolute inset-0 w-20 h-20 rounded-full bg-gray-700/20 mx-auto animate-ping" style={{ animationDuration: '3s' }} />
        </div>

        <div className="space-y-2">
          <p className="text-gray-400 text-sm font-medium tracking-wide">
            RECEIVER MODE
          </p>
          <p className="text-gray-600 text-xs">
            Waiting for incoming call...
          </p>
        </div>

        {/* Decorative signal bars */}
        <div className="flex items-end justify-center gap-1 pt-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="w-1 bg-gray-700/50 rounded-full"
              style={{ height: `${i * 4}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
