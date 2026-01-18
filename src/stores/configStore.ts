import { create } from "zustand";
import type { PolicyConfig } from "@/lib/types";

// Jurisdiction presets
export const JURISDICTION_PRESETS: Record<string, PolicyConfig> = {
  "US-CA": {
    jurisdiction: "US-CA",
    callWindowStart: "08:00",
    callWindowEnd: "21:00",
    maxAttemptsPerDay: 3,
    maxAttemptsTotal: 15,
    prohibitedPhrases: [
      "jail",
      "arrest",
      "garnish your wages",
      "sue you",
      "legal action guaranteed",
      "police",
    ],
    requireRecordingConsent: true,
  },
  "US-NY": {
    jurisdiction: "US-NY",
    callWindowStart: "08:00",
    callWindowEnd: "21:00",
    maxAttemptsPerDay: 3,
    maxAttemptsTotal: 15,
    prohibitedPhrases: [
      "jail",
      "arrest",
      "garnish your wages",
      "sue you",
      "legal action guaranteed",
      "police",
    ],
    requireRecordingConsent: false,
  },
  "US-TX": {
    jurisdiction: "US-TX",
    callWindowStart: "08:00",
    callWindowEnd: "21:00",
    maxAttemptsPerDay: 5,
    maxAttemptsTotal: 20,
    prohibitedPhrases: ["jail", "arrest", "sue you", "police"],
    requireRecordingConsent: false,
  },
  UAE: {
    jurisdiction: "UAE",
    callWindowStart: "09:00",
    callWindowEnd: "18:00",
    maxAttemptsPerDay: 2,
    maxAttemptsTotal: 10,
    prohibitedPhrases: [
      "jail",
      "prison",
      "deport",
      "travel ban",
      "police",
      "criminal",
    ],
    requireRecordingConsent: true,
  },
};

interface ConfigStore {
  config: PolicyConfig;
  setConfig: (updates: Partial<PolicyConfig>) => void;
  setJurisdiction: (jurisdiction: string) => void;
  reset: () => void;
}

const defaultConfig = JURISDICTION_PRESETS["US-CA"];

export const useConfigStore = create<ConfigStore>((set) => ({
  config: defaultConfig,

  setConfig: (updates) =>
    set((state) => ({
      config: { ...state.config, ...updates },
    })),

  setJurisdiction: (jurisdiction) => {
    const preset = JURISDICTION_PRESETS[jurisdiction];
    if (preset) {
      set({ config: preset });
    }
  },

  reset: () => set({ config: defaultConfig }),
}));
