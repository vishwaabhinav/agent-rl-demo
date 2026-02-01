/**
 * OpenAI Realtime API session management
 *
 * Generic implementation that can be used for both:
 * - Browser-based calls (via Socket.IO)
 * - Server-side simulation (direct audio routing)
 */

import WebSocket from "ws";
import type {
  RealtimeSessionConfig,
  RealtimeSessionCallbacks,
  RealtimeSessionHandle,
  FloorController,
  FloorControllerConfig,
} from "./types";
import { TurnState } from "./types";

const REALTIME_API_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime";

/**
 * Create a new OpenAI Realtime session
 */
// Generate a short ID for logging
let sessionCounter = 0;

export function createRealtimeSession(
  config: RealtimeSessionConfig,
  callbacks: RealtimeSessionCallbacks
): RealtimeSessionHandle {
  const sessionId = `S${++sessionCounter}`;
  const log = (msg: string, ...args: any[]) => console.log(`[Realtime:${sessionId}]`, msg, ...args);
  const logError = (msg: string, ...args: any[]) => console.error(`[Realtime:${sessionId}]`, msg, ...args);

  const ws = new WebSocket(REALTIME_API_URL, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  let isReady = false;
  let agentTranscript = "";

  ws.on("open", () => {
    log("WebSocket connected");

    // Configure the session
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: config.instructions,
          voice: config.voice,
          input_audio_format: config.audioFormat || "pcm16",
          output_audio_format: config.audioFormat || "pcm16",
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "en",
          },
          turn_detection: config.turnDetection ? {
            type: config.turnDetection.type,
            eagerness: config.turnDetection.eagerness,
            create_response: config.turnDetection.createResponse,
            interrupt_response: config.turnDetection.interruptResponse,
          } : {
            type: "semantic_vad",
            eagerness: "medium",
            create_response: true,
            interrupt_response: true,
          },
        },
      })
    );
  });

  ws.on("message", (data: WebSocket.Data) => {
    try {
      const event = JSON.parse(data.toString());
      handleRealtimeEvent(event, callbacks, () => agentTranscript, (t) => { agentTranscript = t; }, () => { isReady = true; });
    } catch (error) {
      console.error("[Realtime] Parse error:", error);
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  });

  ws.on("error", (error) => {
    console.error("[Realtime] WebSocket error:", error);
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
  });

  ws.on("close", () => {
    console.log("[Realtime] WebSocket closed");
    callbacks.onClose?.();
  });

  // Return control handle
  return {
    sendAudio: (base64Audio: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64Audio,
          })
        );
      } else {
        console.warn("[Realtime] sendAudio: WebSocket not open, state:", ws.readyState);
      }
    },

    sendText: (text: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text }],
            },
          })
        );
      }
    },

    injectSystemMessage: (text: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text }],
            },
          })
        );
      }
    },

    triggerResponse: () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "response.create" }));
      }
    },

    commitAudioAndRespond: () => {
      console.log("[Realtime] commitAudioAndRespond called, ws.readyState:", ws.readyState, "OPEN:", WebSocket.OPEN);
      if (ws.readyState === WebSocket.OPEN) {
        // Commit the input audio buffer (like pressing "send")
        console.log("[Realtime] Sending input_audio_buffer.commit");
        ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        // Then trigger a response
        console.log("[Realtime] Sending response.create");
        ws.send(JSON.stringify({ type: "response.create" }));
      } else {
        console.error("[Realtime] Cannot commitAudioAndRespond - WebSocket not open");
      }
    },

    close: () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    },

    isOpen: () => ws.readyState === WebSocket.OPEN && isReady,
  };
}

/**
 * Handle events from the Realtime API
 */
function handleRealtimeEvent(
  event: any,
  callbacks: RealtimeSessionCallbacks,
  getAgentTranscript: () => string,
  setAgentTranscript: (t: string) => void,
  markReady: () => void
): void {
  const { type } = event;

  switch (type) {
    case "session.created":
      console.log("[Realtime] Session created");
      break;

    case "session.updated":
      console.log("[Realtime] Session configured and ready");
      markReady();
      callbacks.onReady?.();
      break;

    case "input_audio_buffer.speech_started":
      callbacks.onUserSpeechStart?.();
      break;

    case "input_audio_buffer.speech_stopped":
      callbacks.onUserSpeechEnd?.();
      break;

    case "conversation.item.input_audio_transcription.completed":
      const userText = event.transcript || "";
      if (userText.trim()) {
        callbacks.onUserTranscript?.(userText, true);
      }
      break;

    case "response.created":
      setAgentTranscript("");
      callbacks.onAgentSpeechStart?.();
      break;

    case "response.audio.delta":
    case "response.output_audio.delta":
      if (event.delta) {
        callbacks.onAudioDelta?.(event.delta);
      }
      break;

    case "response.audio_transcript.delta":
    case "response.output_audio_transcript.delta":
      const textDelta = event.delta || "";
      setAgentTranscript(getAgentTranscript() + textDelta);
      callbacks.onAgentTranscript?.(textDelta, false);
      break;

    case "response.audio_transcript.done":
    case "response.output_audio_transcript.done":
      const finalText = event.transcript || getAgentTranscript();
      if (finalText.trim()) {
        callbacks.onAgentTranscript?.(finalText, true);
      }
      break;

    case "response.done":
      callbacks.onAgentSpeechEnd?.();
      break;

    case "error":
      console.error("[Realtime] API Error:", event.error);
      callbacks.onError?.(new Error(event.error?.message || "Realtime API error"));
      break;

    default:
      // Log all events for debugging
      if (!type?.startsWith("rate_limits")) {
        // console.log(`[Realtime] Event: ${type}`);
      }
  }
}

/**
 * Create a floor controller for turn-taking
 */
export function createFloorController(config: FloorControllerConfig): FloorController {
  let currentSpeaker: "agent" | "borrower" | null = null;
  let state: TurnState = TurnState.IDLE;
  let isTransitioning = false;
  let transferTimeout: NodeJS.Timeout | null = null;

  const controller: FloorController = {
    get currentSpeaker() { return currentSpeaker; },
    get state() { return state; },
    get isTransitioning() { return isTransitioning; },

    canSpeak(party: "agent" | "borrower"): boolean {
      // If idle, anyone can start
      if (state === TurnState.IDLE) {
        console.log(`[Floor] canSpeak(${party}): YES (idle)`);
        return true;
      }

      // If this party holds the floor, they can continue
      if (currentSpeaker === party) {
        return true; // Don't log every audio delta
      }

      // In production mode, human (borrower) can barge in
      if (config.allowBargeIn && party === "borrower") {
        console.log(`[Floor] canSpeak(${party}): YES (barge-in)`);
        return true;
      }

      console.log(`[Floor] canSpeak(${party}): NO (speaker=${currentSpeaker}, state=${state})`);
      return false;
    },

    startSpeaking(party: "agent" | "borrower"): boolean {
      if (isTransitioning) return false;
      if (!controller.canSpeak(party)) return false;

      // Cancel pending floor transfer
      if (transferTimeout) {
        clearTimeout(transferTimeout);
        transferTimeout = null;
      }

      isTransitioning = true;

      if (currentSpeaker && currentSpeaker !== party) {
        console.log(`[Floor] Barge-in: ${party} interrupting ${currentSpeaker}`);
      }

      currentSpeaker = party;
      state = TurnState.SPEAKING;
      isTransitioning = false;
      console.log(`[Floor] ${party} started speaking`);
      return true;
    },

    stopSpeaking(party: "agent" | "borrower"): void {
      if (currentSpeaker !== party) return;
      state = TurnState.LISTENING;
      console.log(`[Floor] ${party} stopped speaking`);
    },

    transferFloor(): void {
      if (isTransitioning) return;

      const nextSpeaker = currentSpeaker === "agent" ? "borrower" : "agent";

      if (config.floorTransferDelayMs === 0) {
        // Synchronous transfer for simulation (avoids async timing issues)
        console.log(`[Floor] Transferring floor to ${nextSpeaker}`);
        currentSpeaker = nextSpeaker;
        state = TurnState.IDLE;
      } else {
        // Async transfer with delay for production
        isTransitioning = true;
        transferTimeout = setTimeout(() => {
          console.log(`[Floor] Transferring floor to ${nextSpeaker}`);
          currentSpeaker = nextSpeaker;
          state = TurnState.IDLE;
          isTransitioning = false;
          transferTimeout = null;
        }, config.floorTransferDelayMs);
      }
    },
  };

  return controller;
}

/**
 * Create a pair of connected Realtime sessions for simulation
 * Audio from one is piped to the other
 */
export function createConnectedRealtimeSessions(
  agentConfig: RealtimeSessionConfig,
  borrowerConfig: RealtimeSessionConfig,
  callbacks: {
    onAgentTranscript?: (text: string, isFinal: boolean) => void;
    onBorrowerTranscript?: (text: string, isFinal: boolean) => void;
    onAgentAudio?: (base64: string) => void;
    onBorrowerAudio?: (base64: string) => void;
    onError?: (error: Error, side: "agent" | "borrower") => void;
    onClose?: (side: "agent" | "borrower") => void;
  },
  floorConfig?: Partial<FloorControllerConfig>
): {
  agent: RealtimeSessionHandle;
  borrower: RealtimeSessionHandle;
  floor: FloorController;
} {
  // Create floor controller for turn-taking
  // Note: floorTransferDelayMs: 0 because OpenAI Realtime API generates audio immediately
  // and any delay causes "buffer too small" errors
  const floor = createFloorController({
    mode: "simulation",
    allowBargeIn: false,
    floorTransferDelayMs: 0,
    ...floorConfig,
  });

  // Track audio flow for overlap detection
  let agentAudioActive = false;
  let borrowerAudioActive = false;
  let lastAgentAudioTime = 0;
  let lastBorrowerAudioTime = 0;

  let agentSession: RealtimeSessionHandle;
  let borrowerSession: RealtimeSessionHandle;

  // Create agent session
  agentSession = createRealtimeSession(agentConfig, {
    onReady: () => console.log("[Simulation] Agent session ready"),
    onAgentSpeechStart: () => {
      agentAudioActive = true;
      console.log(`[Overlap] Agent speech START (borrower active: ${borrowerAudioActive})`);
      if (borrowerAudioActive) {
        console.warn("[Overlap] ⚠️ OVERLAP DETECTED: Agent starting while borrower active!");
      }
      floor.startSpeaking("agent");
    },
    onAgentTranscript: (text, isFinal) => {
      callbacks.onAgentTranscript?.(text, isFinal);
    },
    onAudioDelta: (audio) => {
      const now = Date.now();
      lastAgentAudioTime = now;

      // Check for recent borrower audio (within 100ms = potential overlap)
      if (now - lastBorrowerAudioTime < 100) {
        console.warn(`[Overlap] ⚠️ Agent audio within 100ms of borrower audio!`);
      }

      // Check floor control before sending audio
      if (!floor.canSpeak("agent")) {
        console.log(`[Overlap] Agent audio BLOCKED by floor control`);
        return;
      }
      // Pipe agent audio to borrower input
      callbacks.onAgentAudio?.(audio);
      borrowerSession?.sendAudio(audio);
    },
    onAgentSpeechEnd: () => {
      agentAudioActive = false;
      console.log(`[Overlap] Agent speech END`);
      floor.stopSpeaking("agent");
      floor.transferFloor();
    },
    onError: (err) => callbacks.onError?.(err, "agent"),
    onClose: () => callbacks.onClose?.("agent"),
  });

  // Create borrower session
  borrowerSession = createRealtimeSession(borrowerConfig, {
    onReady: () => console.log("[Simulation] Borrower session ready"),
    onAgentSpeechStart: () => {
      borrowerAudioActive = true;
      console.log(`[Overlap] Borrower speech START (agent active: ${agentAudioActive})`);
      if (agentAudioActive) {
        console.warn("[Overlap] ⚠️ OVERLAP DETECTED: Borrower starting while agent active!");
      }
      floor.startSpeaking("borrower");
    },
    onAgentTranscript: (text, isFinal) => {
      // Note: borrower's "agent" output is the borrower speaking
      callbacks.onBorrowerTranscript?.(text, isFinal);
    },
    onAudioDelta: (audio) => {
      const now = Date.now();
      lastBorrowerAudioTime = now;

      // Check for recent agent audio (within 100ms = potential overlap)
      if (now - lastAgentAudioTime < 100) {
        console.warn(`[Overlap] ⚠️ Borrower audio within 100ms of agent audio!`);
      }

      // Check floor control before sending audio
      if (!floor.canSpeak("borrower")) {
        console.log(`[Overlap] Borrower audio BLOCKED by floor control`);
        return;
      }
      // Pipe borrower audio to agent input
      callbacks.onBorrowerAudio?.(audio);
      agentSession?.sendAudio(audio);
    },
    onAgentSpeechEnd: () => {
      borrowerAudioActive = false;
      console.log(`[Overlap] Borrower speech END`);
      floor.stopSpeaking("borrower");
      floor.transferFloor();
    },
    onError: (err) => callbacks.onError?.(err, "borrower"),
    onClose: () => callbacks.onClose?.("borrower"),
  });

  return { agent: agentSession, borrower: borrowerSession, floor };
}
