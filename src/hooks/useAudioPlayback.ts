"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface UseAudioPlaybackOptions {
  sampleRate?: number;
  enabled?: boolean;
}

export function useAudioPlayback({
  sampleRate = 24000,
  enabled = true,
}: UseAudioPlaybackOptions = {}) {
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isProcessingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Initialize audio context
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate });
    }
    return audioContextRef.current;
  }, [sampleRate]);

  // Queue audio for playback
  const queueAudio = useCallback(
    (base64Audio: string) => {
      if (!enabled) return;

      try {
        // Initialize context on first audio (must be after user gesture)
        const audioContext = initAudioContext();

        // Resume if suspended
        if (audioContext.state === "suspended") {
          audioContext.resume();
        }

        // Decode base64 to Int16 PCM
        const int16Data = base64ToInt16(base64Audio);

        // Convert Int16 to Float32
        const float32Data = int16ToFloat32(int16Data);

        // Add to queue
        audioQueueRef.current.push(float32Data);

        // Process queue if not already processing
        if (!isProcessingRef.current) {
          processQueue();
        }
      } catch (error) {
        console.error("[AudioPlayback] Error queueing audio:", error);
      }
    },
    [enabled, initAudioContext]
  );

  // Process queued audio
  const processQueue = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (!audioContext || audioQueueRef.current.length === 0) {
      isProcessingRef.current = false;
      setIsPlaying(false);
      return;
    }

    isProcessingRef.current = true;
    setIsPlaying(true);

    const audioData = audioQueueRef.current.shift()!;

    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(
      1, // mono
      audioData.length,
      sampleRate
    );
    audioBuffer.copyToChannel(new Float32Array(audioData), 0);

    // Create buffer source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    // Track active source for interruption
    activeSourceRef.current = source;

    // Schedule playback
    const currentTime = audioContext.currentTime;
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);

    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;

    // Process next chunk when this one ends
    source.onended = () => {
      if (activeSourceRef.current === source) {
        activeSourceRef.current = null;
      }
      processQueue();
    };
  }, [sampleRate]);

  // Clear audio queue and stop current playback
  const clearQueue = useCallback(() => {
    audioQueueRef.current = [];
    nextPlayTimeRef.current = 0;
    isProcessingRef.current = false;
    setIsPlaying(false);

    // Stop currently playing audio immediately
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
      } catch {
        // Source may already be stopped
      }
      activeSourceRef.current = null;
    }

    // Reset the audio context time reference
    if (audioContextRef.current) {
      nextPlayTimeRef.current = audioContextRef.current.currentTime;
    }
  }, []);

  // Stop all playback
  const stop = useCallback(() => {
    clearQueue();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, [clearQueue]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isPlaying,
    queueAudio,
    clearQueue,
    stop,
  };
}

// Convert base64 string to Int16Array
function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

// Convert Int16 PCM to Float32 samples
function int16ToFloat32(int16Array: Int16Array): Float32Array {
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    // Scale Int16 to [-1, 1] range
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32Array;
}
