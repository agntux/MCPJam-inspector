import { ProviderTokens } from "@/hooks/use-ai-provider-keys";
import {
  SUPPORTED_MODELS,
  type ModelDefinition,
  type ModelProvider,
  isMCPJamProvidedModel,
  Model,
} from "@/shared/types";
import type { CustomProvider } from "@mcpjam/sdk";

export function parseModelAliases(
  aliasString: string,
  provider: ModelProvider,
): ModelDefinition[] {
  return aliasString
    .split(",")
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0)
    .map((alias) => ({ id: alias, name: alias, provider }));
}

export function buildAvailableModels(params: {
  hasToken: (provider: keyof ProviderTokens) => boolean;
  getOpenRouterSelectedModels: () => string[];
  isOllamaRunning: boolean;
  ollamaModels: ModelDefinition[];
  getAzureBaseUrl: () => string;
  customProviders: CustomProvider[];
  serverProviders?: string[]; // AgntUX: providers with server-side API keys
}): ModelDefinition[] {
  const {
    hasToken,
    getAzureBaseUrl,
    getOpenRouterSelectedModels,
    isOllamaRunning,
    ollamaModels,
    customProviders,
    serverProviders = [], // AgntUX
  } = params;

  const providerHasKey: Record<string, boolean> = {
    anthropic: hasToken("anthropic") || serverProviders.includes("anthropic"), // AgntUX: server-side key fallback
    openai: hasToken("openai") || serverProviders.includes("openai"), // AgntUX
    deepseek: hasToken("deepseek") || serverProviders.includes("deepseek"), // AgntUX
    google: hasToken("google") || serverProviders.includes("google"), // AgntUX
    mistral: hasToken("mistral") || serverProviders.includes("mistral"), // AgntUX
    xai: hasToken("xai") || serverProviders.includes("xai"), // AgntUX
    azure: Boolean(getAzureBaseUrl()),
    ollama: isOllamaRunning,
    openrouter: Boolean(
      hasToken("openrouter") && getOpenRouterSelectedModels().length > 0,
    ),
    meta: false,
  } as const;

  // AgntUX: Hide MCPJam free-tier models when Convex is not configured (self-hosted mode)
  const hasConvex = Boolean(import.meta.env.VITE_CONVEX_URL);
  const cloud = SUPPORTED_MODELS.filter((m) => {
    if (isMCPJamProvidedModel(m.id)) return hasConvex;
    return providerHasKey[m.provider];
  });

  const openRouterModels: ModelDefinition[] = providerHasKey.openrouter
    ? getOpenRouterSelectedModels().map((id) => ({
        id,
        name: id,
        provider: "openrouter" as const,
      }))
    : [];

  const customModels: ModelDefinition[] = customProviders.flatMap((cp) =>
    cp.modelIds.map((modelId) => ({
      id: `custom:${cp.name}:${modelId}`,
      name: modelId,
      provider: "custom" as const,
      customProviderName: cp.name,
    })),
  );

  let models: ModelDefinition[] = cloud;
  if (isOllamaRunning && ollamaModels.length > 0)
    models = models.concat(ollamaModels);
  if (openRouterModels.length > 0) models = models.concat(openRouterModels);
  if (customModels.length > 0) models = models.concat(customModels);
  return models;
}

export const getDefaultModel = (
  availableModels: ModelDefinition[],
): ModelDefinition => {
  const modelIdsByPriority: Array<Model | string> = [
    "anthropic/claude-haiku-4.5",
    "openai/gpt-5-mini",
    "meta-llama/llama-4-scout",
    Model.CLAUDE_SONNET_4_5, // anthropic (preferred — claude-3-7-sonnet-latest is deprecated)
    Model.CLAUDE_SONNET_4_0, // anthropic
    Model.CLAUDE_HAIKU_4_5, // anthropic (cheapest current model)
    Model.CLAUDE_3_7_SONNET_LATEST, // anthropic (legacy fallback)
    Model.GPT_4_1, // openai
    Model.GEMINI_2_5_PRO, // google
    Model.DEEPSEEK_CHAT, // deepseek
    Model.MISTRAL_LARGE_LATEST, // mistral
  ];

  for (const id of modelIdsByPriority) {
    const found = availableModels.find((m) => m.id === id);
    if (found) return found;
  }
  // AgntUX: Safe fallback when no models available yet (server providers still loading)
  return availableModels[0] ?? { id: Model.CLAUDE_SONNET_4_5, name: "Claude Sonnet 4.5", provider: "anthropic" as const };
};
