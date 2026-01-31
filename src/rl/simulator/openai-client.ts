/**
 * OpenAI LLM Client for Training
 *
 * Implements LLMClient interface using OpenAI Chat API.
 * Reuses the shared OpenAI client from lib/llm/client.ts
 */

import { getOpenAIClient } from "../../lib/llm/client";
import type { LLMClient } from "./borrower";

/**
 * OpenAI Chat API client implementing LLMClient interface
 */
export class OpenAILLMClient implements LLMClient {
  private model: string;
  private temperature: number;

  constructor(options?: { model?: string; temperature?: number }) {
    this.model = options?.model ?? "gpt-4o-mini";
    this.temperature = options?.temperature ?? 0.8;
  }

  async complete(prompt: string, systemPrompt: string): Promise<string> {
    const client = getOpenAIClient();

    const completion = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: this.temperature,
      max_tokens: 150,
    });

    return completion.choices[0]?.message?.content?.trim() ?? "";
  }
}
