/**
 * Text I/O Adapter
 *
 * Uses OpenAI Chat Completions API for text-based conversations.
 * Used for RL training and text-mode interactions.
 */

import type { AgentIO } from "../types";
import { getOpenAIClient } from "../../llm/client";

export interface TextIOConfig {
  model?: string;
  temperature?: number;
  systemPrompt: string;
}

export class TextIO implements AgentIO {
  private config: TextIOConfig;
  private conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  private connected: boolean;
  private pendingMessage: string | null;

  constructor(config: TextIOConfig) {
    this.config = {
      model: config.model ?? "gpt-4o-mini",
      temperature: config.temperature ?? 0.7,
      systemPrompt: config.systemPrompt,
    };
    this.conversationHistory = [];
    this.connected = false;
    this.pendingMessage = null;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.conversationHistory = [];
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.connected) {
      throw new Error("TextIO not connected");
    }
    // Add agent message to history
    this.conversationHistory.push({ role: "assistant", content: text });
  }

  async receiveMessage(): Promise<string> {
    if (!this.connected) {
      throw new Error("TextIO not connected");
    }
    if (this.pendingMessage) {
      const msg = this.pendingMessage;
      this.pendingMessage = null;
      this.conversationHistory.push({ role: "user", content: msg });
      return msg;
    }
    throw new Error("No pending message to receive");
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.conversationHistory = [];
  }

  isConnected(): boolean {
    return this.connected;
  }

  // For RL training: inject borrower response to be received
  injectBorrowerMessage(text: string): void {
    this.pendingMessage = text;
  }

  // Generate agent response using LLM (for autonomous mode)
  async generateResponse(userMessage: string, intentHint?: string): Promise<string> {
    const client = getOpenAIClient();

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: this.config.systemPrompt },
      ...this.conversationHistory,
      { role: "user", content: userMessage },
    ];

    if (intentHint) {
      messages.push({
        role: "system",
        content: `[Respond with intent: ${intentHint}]`
      });
    }

    const completion = await client.chat.completions.create({
      model: this.config.model!,
      messages,
      temperature: this.config.temperature,
      max_tokens: 150,
    });

    return completion.choices[0]?.message?.content?.trim() ?? "";
  }

  getHistory(): Array<{ role: "user" | "assistant"; content: string }> {
    return [...this.conversationHistory];
  }
}
