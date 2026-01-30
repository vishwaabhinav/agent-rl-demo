import OpenAI from "openai";
import type { CaseData, Intent, LLMInput, LLMOutput } from "../types";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";

// Initialize OpenAI client
let openaiClient: OpenAI | null = null;

export function initializeOpenAI(apiKey: string): void {
  openaiClient = new OpenAI({ apiKey });
}

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// Response schema for structured output
interface LLMResponse {
  intent: string;
  response: string;
  confidence: number;
}

// Parse the LLM response from JSON
function parseLLMResponse(content: string, allowedIntents: Intent[]): LLMResponse {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]) as LLMResponse;

    // Validate the response has required fields
    if (!parsed.intent || !parsed.response) {
      throw new Error("Missing required fields in response");
    }

    // Normalize intent to uppercase
    parsed.intent = parsed.intent.toUpperCase().replace(/-/g, "_");

    // Validate intent is in allowed list, or use fallback
    if (!allowedIntents.includes(parsed.intent as Intent)) {
      console.warn(`Intent ${parsed.intent} not in allowed list, using first allowed intent`);
      parsed.intent = allowedIntents[0];
    }

    // Ensure confidence is a valid number
    parsed.confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.8;

    return parsed;
  } catch (error) {
    console.error("Failed to parse LLM response:", error, "Raw content:", content);
    // Return a safe fallback
    return {
      intent: allowedIntents[0],
      response: "I apologize, could you please repeat that?",
      confidence: 0.5,
    };
  }
}

// Generate a response from the LLM
export async function generateResponse(
  input: LLMInput,
  caseData: CaseData
): Promise<LLMOutput> {
  const client = getOpenAIClient();
  const startTime = Date.now();

  const systemPrompt = buildSystemPrompt(input, caseData);
  const userPrompt = buildUserPrompt(input.userUtterance);

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content || "";
    const tokensUsed = completion.usage?.total_tokens || 0;

    const parsed = parseLLMResponse(content, input.allowedIntents);

    return {
      chosenIntent: parsed.intent as Intent,
      assistantText: parsed.response,
      toolCalls: [],
      confidence: parsed.confidence,
      tokensUsed,
    };
  } catch (error) {
    console.error("OpenAI API error:", error);

    // Return a safe fallback response
    return {
      chosenIntent: input.allowedIntents[0] || "PROCEED",
      assistantText: "I apologize for the technical difficulty. Could you please give me a moment?",
      toolCalls: [],
      confidence: 0.3,
      tokensUsed: 0,
    };
  }
}

// Generate an opening message for the call
export async function generateOpeningMessage(
  caseData: CaseData,
  language: string = "en"
): Promise<LLMOutput> {
  const input: LLMInput = {
    caseId: caseData.id,
    language,
    state: "OPENING",
    userUtterance: "",
    slots: {},
    allowedIntents: ["PROCEED", "ASK_CLARIFY"],
    prohibitedTopics: ["jail", "arrest", "sue"],
    toolPermissions: [],
    requiredTemplates: [],
  };

  return generateResponse(input, caseData);
}

// Check if OpenAI is configured
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
