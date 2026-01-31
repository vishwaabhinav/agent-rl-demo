/**
 * Voice I/O Adapter
 *
 * Uses OpenAI Realtime API for voice-based conversations.
 * Wraps the existing realtime session management.
 */

import type { AgentIO } from "../types";
import type { RealtimeSessionHandle, RealtimeSessionConfig } from "../../voice/types";
import { createRealtimeSession } from "../../voice/realtime";

export interface VoiceIOConfig {
  instructions: string;
  voice?: string;
}

export class VoiceIO implements AgentIO {
  private config: VoiceIOConfig;
  private session: RealtimeSessionHandle | null;
  private connected: boolean;
  private pendingTranscript: string | null;
  private resolveMessage: ((text: string) => void) | null;

  // Callbacks for external consumers
  onAudioDelta?: (base64Audio: string) => void;
  onAgentTranscript?: (text: string, isFinal: boolean) => void;

  constructor(config: VoiceIOConfig) {
    this.config = config;
    this.session = null;
    this.connected = false;
    this.pendingTranscript = null;
    this.resolveMessage = null;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sessionConfig: RealtimeSessionConfig = {
        instructions: this.config.instructions,
        voice: this.config.voice || "coral",
        turnDetection: {
          type: "semantic_vad",
          eagerness: "medium",
          createResponse: false,
          interruptResponse: false,
        },
      };

      this.session = createRealtimeSession(sessionConfig, {
        onReady: () => {
          this.connected = true;
          resolve();
        },
        onAgentTranscript: (text, isFinal) => {
          this.onAgentTranscript?.(text, isFinal);
          if (isFinal) {
            this.pendingTranscript = text;
          }
        },
        onAudioDelta: (audio) => {
          this.onAudioDelta?.(audio);
        },
        onUserTranscript: (text, isFinal) => {
          if (isFinal && this.resolveMessage) {
            this.resolveMessage(text);
            this.resolveMessage = null;
          }
        },
        onError: (err) => {
          if (!this.connected) {
            reject(err);
          }
        },
      });
    });
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.session || !this.connected) {
      throw new Error("VoiceIO not connected");
    }
    // Inject as system message and trigger response
    this.session.injectSystemMessage(`[Say: ${text}]`);
    this.session.triggerResponse();
  }

  async receiveMessage(): Promise<string> {
    if (!this.connected) {
      throw new Error("VoiceIO not connected");
    }

    return new Promise((resolve) => {
      this.resolveMessage = resolve;
    });
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.session !== null;
  }

  // Send raw audio to the session
  sendAudio(base64Audio: string): void {
    this.session?.sendAudio(base64Audio);
  }

  // Commit audio buffer and request response
  commitAudioAndRespond(): void {
    this.session?.commitAudioAndRespond();
  }

  // Trigger agent to speak
  triggerResponse(): void {
    this.session?.triggerResponse();
  }

  // Inject a system message
  injectSystemMessage(text: string): void {
    this.session?.injectSystemMessage(text);
  }
}
