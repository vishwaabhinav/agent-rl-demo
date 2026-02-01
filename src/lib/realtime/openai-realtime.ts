import WebSocket from "ws";
import { EventEmitter } from "events";

export interface RealtimeConfig {
  apiKey: string;
  model?: string;
  voice?: string;
  instructions?: string;
  turnDetection?: "server_vad" | "semantic_vad" | null;
  vadThreshold?: number;
  silenceDurationMs?: number;
  prefixPaddingMs?: number;
}

export interface RealtimeEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  speechStarted: () => void;
  speechEnded: () => void;
  transcriptDelta: (text: string, isFinal: boolean) => void;
  audioDelta: (audioBase64: string) => void;
  responseStarted: () => void;
  responseDone: (text: string) => void;
  inputAudioTranscript: (text: string) => void;
}

export class OpenAIRealtimeClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: RealtimeConfig;
  private isConnected = false;
  private conversationId: string | null = null;

  constructor(config: RealtimeConfig) {
    super();
    this.config = {
      model: "gpt-4o-realtime-preview",
      voice: "nova",
      turnDetection: "semantic_vad",
      silenceDurationMs: 500,
      prefixPaddingMs: 300,
      vadThreshold: 0.5,
      ...config,
    };
  }

  async connect(): Promise<void> {
    const url = `wss://api.openai.com/v1/realtime?model=${this.config.model}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      this.ws.on("open", () => {
        console.log("[Realtime] Connected to OpenAI");
        this.isConnected = true;
        this.configureSession();
        this.emit("connected");
        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleServerEvent(event);
        } catch (error) {
          console.error("[Realtime] Failed to parse message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("[Realtime] WebSocket error:", error);
        this.emit("error", error);
        reject(error);
      });

      this.ws.on("close", () => {
        console.log("[Realtime] Disconnected from OpenAI");
        this.isConnected = false;
        this.emit("disconnected");
      });
    });
  }

  private configureSession(): void {
    if (!this.ws) return;

    const sessionConfig = {
      type: "session.update",
      session: {
        type: "realtime",
        model: this.config.model,
        modalities: ["text", "audio"],
        instructions: this.config.instructions || "You are a helpful assistant.",
        voice: this.config.voice,
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: this.config.turnDetection
          ? {
              type: this.config.turnDetection,
              threshold: this.config.vadThreshold,
              silence_duration_ms: this.config.silenceDurationMs,
              prefix_padding_ms: this.config.prefixPaddingMs,
              create_response: true,
            }
          : null,
      },
    };

    this.send(sessionConfig);
  }

  private handleServerEvent(event: any): void {
    const { type } = event;

    switch (type) {
      case "session.created":
        console.log("[Realtime] Session created:", event.session?.id);
        break;

      case "session.updated":
        console.log("[Realtime] Session updated");
        break;

      case "input_audio_buffer.speech_started":
        console.log("[Realtime] User speech started");
        this.emit("speechStarted");
        break;

      case "input_audio_buffer.speech_stopped":
        console.log("[Realtime] User speech stopped");
        this.emit("speechEnded");
        break;

      case "input_audio_buffer.committed":
        console.log("[Realtime] Audio buffer committed");
        break;

      case "conversation.item.input_audio_transcription.completed":
        const userTranscript = event.transcript || "";
        console.log("[Realtime] User said:", userTranscript);
        this.emit("inputAudioTranscript", userTranscript);
        break;

      case "response.created":
        console.log("[Realtime] Response started");
        this.emit("responseStarted");
        break;

      case "response.output_audio.delta":
      case "response.audio.delta":
        const audioBase64 = event.delta;
        if (audioBase64) {
          this.emit("audioDelta", audioBase64);
        }
        break;

      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        const textDelta = event.delta || "";
        this.emit("transcriptDelta", textDelta, false);
        break;

      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        const finalText = event.transcript || "";
        console.log("[Realtime] Agent said:", finalText);
        this.emit("transcriptDelta", finalText, true);
        break;

      case "response.done":
        console.log("[Realtime] Response completed");
        const responseText =
          event.response?.output?.[0]?.content?.[0]?.transcript || "";
        this.emit("responseDone", responseText);
        break;

      case "error":
        console.error("[Realtime] Error:", event.error);
        this.emit("error", new Error(event.error?.message || "Unknown error"));
        break;

      default:
        // Log unknown events for debugging
        if (type && !type.startsWith("rate_limits")) {
          // console.log("[Realtime] Event:", type);
        }
    }
  }

  send(event: any): void {
    if (!this.ws || !this.isConnected) {
      console.warn("[Realtime] Not connected, cannot send event");
      return;
    }

    this.ws.send(JSON.stringify(event));
  }

  // Send audio chunk from user's microphone
  sendAudio(audioBase64: string): void {
    this.send({
      type: "input_audio_buffer.append",
      audio: audioBase64,
    });
  }

  // Manually commit audio buffer (if not using VAD)
  commitAudio(): void {
    this.send({
      type: "input_audio_buffer.commit",
    });
  }

  // Clear audio buffer (e.g., when user cancels)
  clearAudio(): void {
    this.send({
      type: "input_audio_buffer.clear",
    });
  }

  // Send a text message (for testing or hybrid mode)
  sendText(text: string): void {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text,
          },
        ],
      },
    });

    // Trigger response
    this.send({
      type: "response.create",
    });
  }

  // Interrupt the current response (barge-in)
  interrupt(): void {
    this.send({
      type: "response.cancel",
    });
  }

  // Update session instructions mid-conversation
  updateInstructions(instructions: string): void {
    this.send({
      type: "session.update",
      session: {
        instructions,
      },
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}

// Factory function
export function createRealtimeClient(config: RealtimeConfig): OpenAIRealtimeClient {
  return new OpenAIRealtimeClient(config);
}
