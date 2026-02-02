"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface AudioChunk {
  timestamp: number;
  side: "agent" | "borrower";
  data: Float32Array;
}

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
  // Single unified queue with timestamps - plays in arrival order
  const audioQueueRef = useRef<AudioChunk[]>([]);
  const isProcessingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  // Track ALL active sources (Web Audio can have multiple scheduled)
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Track current speaker (for UI/logging only)
  const currentSpeakerRef = useRef<"agent" | "borrower" | null>(null);

  // Volume controls (0-1)
  const agentGainRef = useRef<GainNode | null>(null);
  const borrowerGainRef = useRef<GainNode | null>(null);
  const [agentVolume, setAgentVolume] = useState(1);
  const [borrowerVolume, setBorrowerVolume] = useState(1);

  // Initialize audio context
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

  // Set current speaker (for UI tracking only)
  const setCurrentSpeaker = useCallback((speaker: "agent" | "borrower") => {
    if (currentSpeakerRef.current !== speaker) {
      console.log(`[Audio] Speaker: ${currentSpeakerRef.current} → ${speaker}`);
      currentSpeakerRef.current = speaker;
    }
  }, []);

  // Queue audio chunk with timestamp
  const queueAudio = useCallback(
    (side: "agent" | "borrower", base64Audio: string) => {
      if (!enabled) return;

      try {
        const audioContext = initAudioContext();
        if (audioContext.state === "suspended") {
          audioContext.resume();
        }

        const int16Data = base64ToInt16(base64Audio);
        const float32Data = int16ToFloat32(int16Data);

        // Add to unified queue with timestamp
        const chunk: AudioChunk = {
          timestamp: Date.now(),
          side,
          data: float32Data,
        };
        audioQueueRef.current.push(chunk);

        if (!isProcessingRef.current) {
          processQueue();
        }
      } catch (error) {
        console.error(`[Audio] Error queueing ${side} audio:`, error);
      }
    },
    [enabled, initAudioContext]
  );

  // Queue agent audio
  const queueAgentAudio = useCallback(
    (base64Audio: string) => queueAudio("agent", base64Audio),
    [queueAudio]
  );

  // Queue borrower audio
  const queueBorrowerAudio = useCallback(
    (base64Audio: string) => queueAudio("borrower", base64Audio),
    [queueAudio]
  );

  // Process queued audio - plays chunks in timestamp order (FIFO)
  const processQueue = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (!audioContext) {
      isProcessingRef.current = false;
      setIsPlaying(false);
      return;
    }

    // Get next chunk from unified queue (already in arrival order)
    const chunk = audioQueueRef.current.shift();

    if (!chunk || chunk.data.length === 0) {
      isProcessingRef.current = false;
      setIsPlaying(false);
      return;
    }

    isProcessingRef.current = true;
    setIsPlaying(true);

    // Log speaker changes
    if (currentSpeakerRef.current !== chunk.side) {
      console.log(`[Audio] Now playing: ${chunk.side} (timestamp: ${chunk.timestamp})`);
      currentSpeakerRef.current = chunk.side;
    }

    // Create mono audio buffer
    const audioBuffer = audioContext.createBuffer(
      1, // mono
      chunk.data.length,
      sampleRate
    );

    // Fill the channel
    const channel = audioBuffer.getChannelData(0);
    channel.set(chunk.data);

    // Create buffer source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // Route through the appropriate gain node based on side
    const gainNode = chunk.side === "agent" ? agentGainRef.current : borrowerGainRef.current;
    if (gainNode) {
      source.connect(gainNode);
    } else {
      source.connect(audioContext.destination);
    }

    // Track this source
    activeSourcesRef.current.add(source);

    // Schedule playback
    const currentTime = audioContext.currentTime;
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);

    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;

    // Process next chunk when this one ends
    source.onended = () => {
      activeSourcesRef.current.delete(source);
      processQueue();
    };
  }, [sampleRate]);

  // Clear all audio queues and stop current playback
  const clearQueue = useCallback(() => {
    audioQueueRef.current = [];
    nextPlayTimeRef.current = 0;
    isProcessingRef.current = false;
    currentSpeakerRef.current = null;
    setIsPlaying(false);

    // Stop all active sources
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Source may already be stopped
      }
    }
    activeSourcesRef.current.clear();

    if (audioContextRef.current) {
      nextPlayTimeRef.current = audioContextRef.current.currentTime;
    }
  }, []);

  // Legacy clear functions (now just clear the unified queue)
  const clearAgentQueue = useCallback(() => {
    audioQueueRef.current = audioQueueRef.current.filter((c) => c.side !== "agent");
  }, []);

  const clearBorrowerQueue = useCallback(() => {
    audioQueueRef.current = audioQueueRef.current.filter((c) => c.side !== "borrower");
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

  // Check if any audio is queued or playing
  const hasQueuedAudio = useCallback(() => {
    return audioQueueRef.current.length > 0 || activeSourcesRef.current.size > 0;
  }, []);

  // Wait for all audio to finish playing
  const waitForAudioComplete = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const checkComplete = () => {
        if (!hasQueuedAudio() && !isProcessingRef.current) {
          resolve();
        } else {
          setTimeout(checkComplete, 100);
        }
      };
      checkComplete();
    });
  }, [hasQueuedAudio]);

  return {
    isPlaying,
    queueAgentAudio,
    queueBorrowerAudio,
    setCurrentSpeaker,
    clearQueue,
    clearAgentQueue,
    clearBorrowerQueue,
    hasQueuedAudio,
    waitForAudioComplete,
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
