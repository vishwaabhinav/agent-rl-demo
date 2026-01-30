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
} from "./types";

const REALTIME_API_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime";

/**
 * Create a new OpenAI Realtime session
 */
export function createRealtimeSession(
  config: RealtimeSessionConfig,
  callbacks: RealtimeSessionCallbacks
): RealtimeSessionHandle {
  const ws = new WebSocket(REALTIME_API_URL, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  let isReady = false;
  let agentTranscript = "";

  ws.on("open", () => {
    console.log("[Realtime] WebSocket connected");

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
          turn_detection: config.turnDetection || {
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
      // Ignore rate_limits and other routine events
      if (!type?.startsWith("rate_limits")) {
        // console.log(`[Realtime] Event: ${type}`);
      }
  }
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
  }
): { agent: RealtimeSessionHandle; borrower: RealtimeSessionHandle } {
  let agentSession: RealtimeSessionHandle;
  let borrowerSession: RealtimeSessionHandle;

  // Create agent session
  agentSession = createRealtimeSession(agentConfig, {
    onReady: () => console.log("[Simulation] Agent session ready"),
    onAgentTranscript: (text, isFinal) => {
      callbacks.onAgentTranscript?.(text, isFinal);
    },
    onAudioDelta: (audio) => {
      // Pipe agent audio to borrower input
      callbacks.onAgentAudio?.(audio);
      borrowerSession?.sendAudio(audio);
    },
    onError: (err) => callbacks.onError?.(err, "agent"),
    onClose: () => callbacks.onClose?.("agent"),
  });

  // Create borrower session
  borrowerSession = createRealtimeSession(borrowerConfig, {
    onReady: () => console.log("[Simulation] Borrower session ready"),
    onAgentTranscript: (text, isFinal) => {
      // Note: borrower's "agent" output is the borrower speaking
      callbacks.onBorrowerTranscript?.(text, isFinal);
    },
    onAudioDelta: (audio) => {
      // Pipe borrower audio to agent input
      callbacks.onBorrowerAudio?.(audio);
      agentSession?.sendAudio(audio);
    },
    onError: (err) => callbacks.onError?.(err, "borrower"),
    onClose: () => callbacks.onClose?.("borrower"),
  });

  return { agent: agentSession, borrower: borrowerSession };
}
