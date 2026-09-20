export type AiConfig = {
  apiKey: string;
  baseUrl: string;
};

const AI_CONFIG_STORAGE_KEY = "github-star-manager-ai-config-v1";

export const EMPTY_AI_CONFIG: AiConfig = {
  apiKey: "",
  baseUrl: "",
};

function parseConfig(value: string | null): AiConfig {
  if (!value) return EMPTY_AI_CONFIG;

  try {
    const parsed = JSON.parse(value) as Partial<AiConfig>;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
    };
  } catch {
    return EMPTY_AI_CONFIG;
  }
}

export function loadAiConfig() {
  try {
    return parseConfig(localStorage.getItem(AI_CONFIG_STORAGE_KEY));
  } catch {
    return EMPTY_AI_CONFIG;
  }
}

export function saveAiConfig(config: AiConfig) {
  try {
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify({
      apiKey: config.apiKey.trim(),
      baseUrl: config.baseUrl.trim(),
    }));
  } catch {
    // Storage failure should not prevent temporary in-memory configuration.
  }
}

export function clearAiConfig() {
  try {
    localStorage.removeItem(AI_CONFIG_STORAGE_KEY);
  } catch {
    // Ignore storage failures; the fields can still be cleared in memory.
  }
}
