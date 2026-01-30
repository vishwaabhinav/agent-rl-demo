"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface UseAudioCaptureOptions {
  onAudioData?: (base64Audio: string) => void;
  sampleRate?: number;
  enabled?: boolean;
  deviceId?: string;
}

export function useAudioCapture({
  onAudioData,
  sampleRate = 24000,
  enabled = false,
  deviceId,
}: UseAudioCaptureOptions = {}) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | undefined>(deviceId);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Enumerate available audio input devices
  const refreshDevices = useCallback(async () => {
    try {
      // First request permission to get labeled devices
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
        }));
      setDevices(audioInputs);
      return audioInputs;
    } catch (err) {
      console.error("[AudioCapture] Failed to enumerate devices:", err);
      return [];
    }
  }, []);

  // Refresh devices on mount
  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const startCapture = useCallback(async (overrideDeviceId?: string) => {
    if (isCapturing) return;

    const targetDeviceId = overrideDeviceId || currentDeviceId;

    try {
      setError(null);

      // Request microphone access with specific device if provided
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: sampleRate },
          ...(targetDeviceId && { deviceId: { exact: targetDeviceId } }),
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Update current device ID from the actual track
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const settings = audioTrack.getSettings();
        if (settings.deviceId) {
          setCurrentDeviceId(settings.deviceId);
        }
      }

      // Create audio context
      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      // Load the audio worklet processor
      await audioContext.audioWorklet.addModule("/audio-processor.js");

      // Create source from microphone
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Create worklet node for processing
      const workletNode = new AudioWorkletNode(audioContext, "audio-processor", {
        processorOptions: {
          bufferSize: 2048,
        },
      });
      workletNodeRef.current = workletNode;

      // Handle audio data from worklet
      workletNode.port.onmessage = (event) => {
        if (event.data.type === "audio" && onAudioData) {
          // Convert Float32Array to Int16 PCM
          const float32Data = event.data.audio;
          const int16Data = float32ToInt16(float32Data);

          // Convert to base64
          const base64 = arrayBufferToBase64(int16Data.buffer as ArrayBuffer);
          onAudioData(base64);
        }
      };

      // Connect the audio graph
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsCapturing(true);
      console.log("[AudioCapture] Started capturing");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start audio capture";
      setError(message);
      console.error("[AudioCapture] Error:", err);
    }
  }, [isCapturing, onAudioData, sampleRate]);

  const stopCapture = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsCapturing(false);
    console.log("[AudioCapture] Stopped capturing");
  }, []);

  // Auto-start/stop based on enabled prop
  useEffect(() => {
    if (enabled && !isCapturing) {
      startCapture();
    } else if (!enabled && isCapturing) {
      stopCapture();
    }
  }, [enabled, isCapturing, startCapture, stopCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, [stopCapture]);

  // Switch to a different device
  const switchDevice = useCallback(async (newDeviceId: string) => {
    const wasCapturing = isCapturing;
    if (wasCapturing) {
      stopCapture();
    }
    setCurrentDeviceId(newDeviceId);
    if (wasCapturing) {
      // Small delay to let cleanup complete
      await new Promise(resolve => setTimeout(resolve, 100));
      await startCapture(newDeviceId);
    }
  }, [isCapturing, stopCapture, startCapture]);

  return {
    isCapturing,
    error,
    startCapture,
    stopCapture,
    devices,
    currentDeviceId,
    switchDevice,
    refreshDevices,
  };
}

// Convert Float32 audio samples to Int16 PCM
function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp the value to [-1, 1] and scale to Int16 range
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

// Convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
