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
  // Track ALL active sources (Web Audio can have multiple scheduled)
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Track current speaker (from backend events)
  const currentSpeakerRef = useRef<"agent" | "borrower" | null>(null);

  // Track which queue we're currently draining (commit to one until empty)
  const playingQueueRef = useRef<"agent" | "borrower" | null>(null);

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

  // Set current speaker (called when speech starts)
  // Note: We DON'T clear queues here - that cuts off the previous speaker
  // Just track who's speaking for prioritization
  const setCurrentSpeaker = useCallback((speaker: "agent" | "borrower") => {
    if (currentSpeakerRef.current !== speaker) {
      console.log(`[Audio] Speaker: ${currentSpeakerRef.current} → ${speaker}`);
      currentSpeakerRef.current = speaker;
    }
  }, []);

  // Queue agent audio
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
        console.error("[Audio] Error queueing agent audio:", error);
      }
    },
    [enabled, initAudioContext]
  );

  // Queue borrower audio
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
        console.error("[Audio] Error queueing borrower audio:", error);
      }
    },
    [enabled, initAudioContext]
  );

  // Process queued audio - plays ONLY current speaker's audio (turn-taking)
  const processQueue = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (!audioContext) {
      isProcessingRef.current = false;
      setIsPlaying(false);
      return;
    }

    // Commit to one queue until empty (prevents interleaving/overlap)
    let audioData: Float32Array | null = null;
    let gainNode: GainNode | null = null;

    // If we're already playing from a queue and it still has data, continue with it
    if (playingQueueRef.current === "agent" && agentQueueRef.current.length > 0) {
      audioData = agentQueueRef.current.shift()!;
      gainNode = agentGainRef.current;
    } else if (playingQueueRef.current === "borrower" && borrowerQueueRef.current.length > 0) {
      audioData = borrowerQueueRef.current.shift()!;
      gainNode = borrowerGainRef.current;
    } else {
      // Current queue is empty, switch to whichever has data
      if (agentQueueRef.current.length > 0) {
        playingQueueRef.current = "agent";
        audioData = agentQueueRef.current.shift()!;
        gainNode = agentGainRef.current;
        console.log(`[Audio] Now playing: agent queue`);
      } else if (borrowerQueueRef.current.length > 0) {
        playingQueueRef.current = "borrower";
        audioData = borrowerQueueRef.current.shift()!;
        gainNode = borrowerGainRef.current;
        console.log(`[Audio] Now playing: borrower queue`);
      } else {
        playingQueueRef.current = null;
      }
    }

    if (!audioData || audioData.length === 0) {
      isProcessingRef.current = false;
      setIsPlaying(false);
      return;
    }

    isProcessingRef.current = true;
    setIsPlaying(true);

    // Create mono audio buffer
    const audioBuffer = audioContext.createBuffer(
      1, // mono
      audioData.length,
      sampleRate
    );

    // Fill the channel
    const channel = audioBuffer.getChannelData(0);
    channel.set(audioData);

    // Create buffer source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // Route through the appropriate gain node
    if (gainNode) {
      source.connect(gainNode);
    } else {
      source.connect(audioContext.destination);
    }

    // Track this source (for cleanup when speaker changes)
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

  // Clear specific queue
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
    currentSpeakerRef.current = null;
    playingQueueRef.current = null;
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
    setCurrentSpeaker,
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
