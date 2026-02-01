"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface UseStereoAudioPlaybackOptions {
  sampleRate?: number;
  enabled?: boolean;
}

export function useStereoAudioPlayback({
  sampleRate = 24000,
  enabled = true,
}: UseStereoAudioPlaybackOptions = {}) {
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const agentQueueRef = useRef<Float32Array[]>([]);
  const borrowerQueueRef = useRef<Float32Array[]>([]);
  const isProcessingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Volume controls (0-1)
  const agentGainRef = useRef<GainNode | null>(null);
  const borrowerGainRef = useRef<GainNode | null>(null);
  const [agentVolume, setAgentVolume] = useState(1);
  const [borrowerVolume, setBorrowerVolume] = useState(1);

  // Initialize audio context with stereo panning setup
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate });

      // Create gain nodes for volume control
      agentGainRef.current = audioContextRef.current.createGain();
      borrowerGainRef.current = audioContextRef.current.createGain();

      agentGainRef.current.connect(audioContextRef.current.destination);
      borrowerGainRef.current.connect(audioContextRef.current.destination);
    }
    return audioContextRef.current;
  }, [sampleRate]);

  // Update gain values when volume changes
  useEffect(() => {
    if (agentGainRef.current) {
      agentGainRef.current.gain.value = agentVolume;
    }
  }, [agentVolume]);

  useEffect(() => {
    if (borrowerGainRef.current) {
      borrowerGainRef.current.gain.value = borrowerVolume;
    }
  }, [borrowerVolume]);

  // Queue agent audio (left channel)
  const queueAgentAudio = useCallback(
    (base64Audio: string) => {
      if (!enabled) return;

      try {
        const audioContext = initAudioContext();
        if (audioContext.state === "suspended") {
          audioContext.resume();
        }

        const int16Data = base64ToInt16(base64Audio);
        const float32Data = int16ToFloat32(int16Data);
        agentQueueRef.current.push(float32Data);

        if (!isProcessingRef.current) {
          processQueue();
        }
      } catch (error) {
        console.error("[StereoAudio] Error queueing agent audio:", error);
      }
    },
    [enabled, initAudioContext]
  );

  // Queue borrower audio (right channel)
  const queueBorrowerAudio = useCallback(
    (base64Audio: string) => {
      if (!enabled) return;

      try {
        const audioContext = initAudioContext();
        if (audioContext.state === "suspended") {
          audioContext.resume();
        }

        const int16Data = base64ToInt16(base64Audio);
        const float32Data = int16ToFloat32(int16Data);
        borrowerQueueRef.current.push(float32Data);

        if (!isProcessingRef.current) {
          processQueue();
        }
      } catch (error) {
        console.error("[StereoAudio] Error queueing borrower audio:", error);
      }
    },
    [enabled, initAudioContext]
  );

  // Process queued audio - plays stereo (agent L, borrower R)
  const processQueue = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (!audioContext) {
      isProcessingRef.current = false;
      setIsPlaying(false);
      return;
    }

    // Check if we have any audio to play
    const hasAgent = agentQueueRef.current.length > 0;
    const hasBorrower = borrowerQueueRef.current.length > 0;

    if (!hasAgent && !hasBorrower) {
      isProcessingRef.current = false;
      setIsPlaying(false);
      return;
    }

    isProcessingRef.current = true;
    setIsPlaying(true);

    // Get next chunks (or empty if none)
    const agentData = hasAgent ? agentQueueRef.current.shift()! : null;
    const borrowerData = hasBorrower ? borrowerQueueRef.current.shift()! : null;

    // Determine max length for stereo buffer
    const maxLength = Math.max(
      agentData?.length || 0,
      borrowerData?.length || 0
    );

    if (maxLength === 0) {
      processQueue();
      return;
    }

    // Create stereo audio buffer
    const audioBuffer = audioContext.createBuffer(
      2, // stereo
      maxLength,
      sampleRate
    );

    // Fill left channel (agent)
    const leftChannel = audioBuffer.getChannelData(0);
    if (agentData) {
      leftChannel.set(agentData);
    }

    // Fill right channel (borrower)
    const rightChannel = audioBuffer.getChannelData(1);
    if (borrowerData) {
      rightChannel.set(borrowerData);
    }

    // Create buffer source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // Create channel splitter to route to separate gains
    const splitter = audioContext.createChannelSplitter(2);
    const merger = audioContext.createChannelMerger(2);

    source.connect(splitter);

    // Route left channel through agent gain
    splitter.connect(agentGainRef.current!, 0);
    agentGainRef.current!.connect(merger, 0, 0);

    // Route right channel through borrower gain
    splitter.connect(borrowerGainRef.current!, 1);
    borrowerGainRef.current!.connect(merger, 0, 1);

    merger.connect(audioContext.destination);

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

  // Clear specific queue (for turn-taking - clear other party when one starts speaking)
  const clearAgentQueue = useCallback(() => {
    agentQueueRef.current = [];
  }, []);

  const clearBorrowerQueue = useCallback(() => {
    borrowerQueueRef.current = [];
  }, []);

  // Clear all audio queues and stop current playback
  const clearQueue = useCallback(() => {
    agentQueueRef.current = [];
    borrowerQueueRef.current = [];
    nextPlayTimeRef.current = 0;
    isProcessingRef.current = false;
    setIsPlaying(false);

    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
      } catch {
        // Source may already be stopped
      }
      activeSourceRef.current = null;
    }

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
      agentGainRef.current = null;
      borrowerGainRef.current = null;
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
    queueAgentAudio,
    queueBorrowerAudio,
    clearQueue,
    clearAgentQueue,
    clearBorrowerQueue,
    stop,
    // Volume controls
    agentVolume,
    setAgentVolume,
    borrowerVolume,
    setBorrowerVolume,
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
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32Array;
}
