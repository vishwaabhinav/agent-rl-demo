/**
 * Voice module types - shared between call handling and simulation
 */

import type WebSocket from "ws";
import type { CaseData, FSMState, Message, PolicyConfig, TurnTrace } from "../types";
import type { Learner } from "../../rl/types";

export type CallStatus = "idle" | "ringing" | "connecting" | "active" | "ended" | "declined";

/**
 * Base voice session - shared fields between call and simulation sessions
 */
export interface BaseVoiceSession {
  id: string;
  messages: Message[];
  currentState: FSMState;
  stateHistory: FSMState[];
  turnIndex: number;
  agentTranscript: string;
  userTranscript: string;
}

/**
 * Voice session for real calls (server-side with ws library)
 */
export interface VoiceSession extends BaseVoiceSession {
  caseData: CaseData;
  policyConfig: PolicyConfig;
  traces: TurnTrace[];
  status: CallStatus;
  realtimeWs: WebSocket | null;
  callStartTime: number | null;
  /** Optional RL learner for policy-guided responses */
  learner: Learner | null;
  /** Floor controller for turn-taking management */
  floor?: FloorController;
}

/**
 * Realtime session configuration
 */
export interface RealtimeSessionConfig {
  /** System instructions for the model */
  instructions: string;
  /** Voice to use (alloy, echo, fable, onyx, nova, shimmer, coral) */
  voice: string;
  /** Audio format (default: pcm16) */
  audioFormat?: "pcm16" | "g711_ulaw" | "g711_alaw";
  /** Turn detection configuration */
  turnDetection?: {
    type: "semantic_vad" | "server_vad";
    eagerness?: "low" | "medium" | "high";
    createResponse?: boolean;
    interruptResponse?: boolean;
  };
}

/**
 * Callbacks for Realtime session events
 */
export interface RealtimeSessionCallbacks {
  onReady?: () => void;
  onUserSpeechStart?: () => void;
  onUserSpeechEnd?: () => void;
  onUserTranscript?: (text: string, isFinal: boolean) => void;
  onAgentSpeechStart?: () => void;
  onAgentSpeechEnd?: () => void;
  onAgentTranscript?: (text: string, isFinal: boolean) => void;
  onAudioDelta?: (base64Audio: string) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

/**
 * Realtime session control interface
 */
export interface RealtimeSessionHandle {
  /** Send audio input to the session */
  sendAudio: (base64Audio: string) => void;
  /** Send text input to the session */
  sendText: (text: string) => void;
  /** Inject a system message (for decision injection) */
  injectSystemMessage: (text: string) => void;
  /** Trigger a response from the model */
  triggerResponse: () => void;
  /** Commit audio buffer and trigger response (for piped audio) */
  commitAudioAndRespond: () => void;
  /** Close the session */
  close: () => void;
  /** Check if session is open */
  isOpen: () => boolean;
}

/**
 * State classification result from LLM
 */
export interface StateClassificationResult {
  nextState: FSMState;
  confidence: number;
  reasoning: string;
}

/**
 * Turn-taking state for floor control
 */
export enum TurnState {
  IDLE = "idle",
  LISTENING = "listening",
  SPEAKING = "speaking",
}

/**
 * Floor controller configuration
 */
export interface FloorControllerConfig {
  mode: "simulation" | "production";
  allowBargeIn: boolean;
  floorTransferDelayMs: number;
}

/**
 * Floor controller for turn-taking management
 * Prevents overlapping voices by tracking who holds the floor
 */
export interface FloorController {
  readonly currentSpeaker: "agent" | "borrower" | null;
  readonly state: TurnState;
  readonly isTransitioning: boolean;

  canSpeak(party: "agent" | "borrower"): boolean;
  startSpeaking(party: "agent" | "borrower"): boolean;
  stopSpeaking(party: "agent" | "borrower"): void;
  transferFloor(): void;
}
