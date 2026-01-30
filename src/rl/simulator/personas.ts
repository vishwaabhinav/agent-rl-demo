/**
 * Borrower Personas
 *
 * Predefined persona configurations and random sampling for the borrower simulator.
 */

import type {
  PersonaConfig,
  WillingnessToPay,
  FinancialSituation,
  Temperament,
  DebtKnowledge,
} from "../types";

/**
 * Preset personas for testing and controlled experiments.
 */
export const PRESET_PERSONAS: Record<string, PersonaConfig> = {
  cooperative_stable: {
    name: "Cooperative & Stable",
    willingnessToPay: "HIGH",
    financialSituation: "STABLE",
    temperament: "COOPERATIVE",
    debtKnowledge: "AWARE",
    patience: 8,
  },

  cooperative_struggling: {
    name: "Cooperative but Struggling",
    willingnessToPay: "MEDIUM",
    financialSituation: "STRUGGLING",
    temperament: "COOPERATIVE",
    debtKnowledge: "AWARE",
    patience: 7,
  },

  neutral_confused: {
    name: "Neutral & Confused",
    willingnessToPay: "MEDIUM",
    financialSituation: "STRUGGLING",
    temperament: "NEUTRAL",
    debtKnowledge: "CONFUSED",
    patience: 5,
  },

  hostile_struggling: {
    name: "Hostile & Struggling",
    willingnessToPay: "LOW",
    financialSituation: "STRUGGLING",
    temperament: "HOSTILE",
    debtKnowledge: "AWARE",
    patience: 3,
  },

  hostile_disputing: {
    name: "Hostile & Disputing",
    willingnessToPay: "LOW",
    financialSituation: "STABLE",
    temperament: "HOSTILE",
    debtKnowledge: "DISPUTING",
    patience: 2,
  },

  hardship_cooperative: {
    name: "Hardship but Cooperative",
    willingnessToPay: "LOW",
    financialSituation: "HARDSHIP",
    temperament: "COOPERATIVE",
    debtKnowledge: "AWARE",
    patience: 6,
  },

  neutral_disputing: {
    name: "Neutral & Disputing",
    willingnessToPay: "LOW",
    financialSituation: "STABLE",
    temperament: "NEUTRAL",
    debtKnowledge: "DISPUTING",
    patience: 4,
  },

  impatient_aware: {
    name: "Impatient but Aware",
    willingnessToPay: "MEDIUM",
    financialSituation: "STABLE",
    temperament: "NEUTRAL",
    debtKnowledge: "AWARE",
    patience: 2,
  },
};

/**
 * Get all preset persona names.
 */
export function getPresetPersonaNames(): string[] {
  return Object.keys(PRESET_PERSONAS);
}

/**
 * Get a preset persona by name.
 */
export function getPresetPersona(name: string): PersonaConfig | undefined {
  return PRESET_PERSONAS[name];
}

/**
 * Random selection helper.
 */
function randomChoice<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Random integer in range [min, max].
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random persona configuration.
 */
export function randomPersona(): PersonaConfig {
  const willingnessOptions: WillingnessToPay[] = ["LOW", "MEDIUM", "HIGH"];
  const situationOptions: FinancialSituation[] = ["STABLE", "STRUGGLING", "HARDSHIP"];
  const temperamentOptions: Temperament[] = ["COOPERATIVE", "NEUTRAL", "HOSTILE"];
  const knowledgeOptions: DebtKnowledge[] = ["AWARE", "CONFUSED", "DISPUTING"];

  const willingness = randomChoice(willingnessOptions);
  const situation = randomChoice(situationOptions);
  const temperament = randomChoice(temperamentOptions);
  const knowledge = randomChoice(knowledgeOptions);

  // Patience correlates with temperament
  let basePatienceMin = 3;
  let basePatienceMax = 7;

  if (temperament === "COOPERATIVE") {
    basePatienceMin = 5;
    basePatienceMax = 9;
  } else if (temperament === "HOSTILE") {
    basePatienceMin = 1;
    basePatienceMax = 4;
  }

  const patience = randomInt(basePatienceMin, basePatienceMax);

  return {
    name: `Random_${willingness}_${temperament}`,
    willingnessToPay: willingness,
    financialSituation: situation,
    temperament,
    debtKnowledge: knowledge,
    patience,
  };
}

/**
 * Sample a persona from presets with optional weighting.
 */
export function samplePresetPersona(weights?: Record<string, number>): PersonaConfig {
  const names = getPresetPersonaNames();

  if (!weights) {
    // Uniform sampling
    return PRESET_PERSONAS[randomChoice(names)];
  }

  // Weighted sampling
  const totalWeight = names.reduce((sum, name) => sum + (weights[name] || 1), 0);
  let random = Math.random() * totalWeight;

  for (const name of names) {
    random -= weights[name] || 1;
    if (random <= 0) {
      return PRESET_PERSONAS[name];
    }
  }

  // Fallback
  return PRESET_PERSONAS[names[0]];
}

/**
 * Sample persona - either from presets or random.
 * @param usePresets - If true, sample from presets. If false, generate random.
 * @param presetWeights - Optional weights for preset sampling.
 */
export function samplePersona(
  usePresets: boolean = true,
  presetWeights?: Record<string, number>
): PersonaConfig {
  if (usePresets) {
    return samplePresetPersona(presetWeights);
  }
  return randomPersona();
}

/**
 * Describe a persona in natural language (for prompts).
 */
export function describePersona(persona: PersonaConfig): string {
  const parts: string[] = [];

  // Financial situation
  switch (persona.financialSituation) {
    case "STABLE":
      parts.push("You have stable finances and could pay if you wanted to.");
      break;
    case "STRUGGLING":
      parts.push("You are struggling financially and money is tight.");
      break;
    case "HARDSHIP":
      parts.push("You are in severe financial hardship and genuinely cannot afford much.");
      break;
  }

  // Willingness
  switch (persona.willingnessToPay) {
    case "HIGH":
      parts.push("You are willing to resolve this debt and open to payment plans.");
      break;
    case "MEDIUM":
      parts.push("You might pay if the terms are right, but you're not eager.");
      break;
    case "LOW":
      parts.push("You have no intention of paying and will resist offers.");
      break;
  }

  // Temperament
  switch (persona.temperament) {
    case "COOPERATIVE":
      parts.push("You are generally polite and cooperative in conversation.");
      break;
    case "NEUTRAL":
      parts.push("You are neutral - neither friendly nor hostile, just matter-of-fact.");
      break;
    case "HOSTILE":
      parts.push("You are hostile and easily annoyed. You may become aggressive.");
      break;
  }

  // Knowledge
  switch (persona.debtKnowledge) {
    case "AWARE":
      parts.push("You know about this debt and acknowledge it exists.");
      break;
    case "CONFUSED":
      parts.push("You are confused about this debt - you're not sure what it's for.");
      break;
    case "DISPUTING":
      parts.push("You dispute this debt and believe you don't owe it.");
      break;
  }

  // Patience
  parts.push(`Your patience level is ${persona.patience}/10. After ${persona.patience} frustrating exchanges, you will hang up.`);

  return parts.join(" ");
}
