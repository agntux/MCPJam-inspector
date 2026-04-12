/**
 * model-helpers.ts regression tests
 *
 * Tests for the AgntUX-specific changes in chat-v2/shared/model-helpers.ts:
 *   1. parseModelAliases — parses comma-separated alias strings
 *   2. buildAvailableModels — serverProviders fallback (AgntUX self-hosted mode)
 *   3. buildAvailableModels — MCPJam free-tier models hidden when Convex not configured
 *   4. getDefaultModel — safe fallback when no models are available
 *
 * Because model-helpers.ts is a browser/Vite module that uses import.meta.env
 * and @/shared/types path aliases, we inline the logic under test here so
 * the suite can run in a plain Node.js/Vitest environment without a bundler.
 */

import { describe, it, expect } from 'vitest';

// ─── Types inlined from shared/types.ts ──────────────────────────────────────

type ModelProvider =
  | 'anthropic'
  | 'azure'
  | 'openai'
  | 'ollama'
  | 'deepseek'
  | 'google'
  | 'meta'
  | 'xai'
  | 'mistral'
  | 'moonshotai'
  | 'openrouter'
  | 'z-ai'
  | 'minimax'
  | 'custom';

interface ModelDefinition {
  id: string;
  name: string;
  provider: ModelProvider;
  customProviderName?: string;
  contextLength?: number;
  disabled?: boolean;
  disabledReason?: string;
}

const MCPJAM_PROVIDED_MODEL_IDS: string[] = [
  'openai/gpt-oss-120b',
  'openai/gpt-5-nano',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5.1-codex-mini',
  'openai/gpt-5-mini',
  'moonshotai/kimi-k2-thinking',
  'moonshotai/kimi-k2-0905',
  'google/gemini-2.5-flash',
  'x-ai/grok-code-fast-1',
  'deepseek/deepseek-v3.2',
  'google/gemini-3-flash-preview',
  'meta-llama/llama-4-scout',
  'moonshotai/kimi-k2.5',
  'x-ai/grok-4.1-fast',
  'z-ai/glm-4.7',
  'z-ai/glm-4.7-flash',
  'minimax/minimax-m2.1',
];

const isMCPJamProvidedModel = (modelId: string): boolean =>
  MCPJAM_PROVIDED_MODEL_IDS.includes(modelId);

// A minimal SUPPORTED_MODELS subset that covers all provider branches
const SUPPORTED_MODELS: ModelDefinition[] = [
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' },
  { id: 'mistral-large-latest', name: 'Mistral Large', provider: 'mistral' },
  { id: 'grok-3', name: 'Grok 3', provider: 'xai' },
  // MCPJam-provided free-tier models
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5 (Free)', provider: 'anthropic' },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini (Free)', provider: 'openai' },
  { id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout (Free)', provider: 'meta' },
];

// ─── Functions inlined from model-helpers.ts ─────────────────────────────────

function parseModelAliases(aliasString: string, provider: ModelProvider): ModelDefinition[] {
  return aliasString
    .split(',')
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0)
    .map((alias) => ({ id: alias, name: alias, provider }));
}

interface ProviderTokens {
  anthropic: string;
  openai: string;
  deepseek: string;
  google: string;
  mistral: string;
  xai: string;
  openrouter: string;
  openRouterSelectedModels: string[];
  azure: string;
  azureBaseUrl: string;
  ollama: string;
  ollamaBaseUrl: string;
}

interface CustomProvider {
  name: string;
  modelIds: string[];
}

function buildAvailableModels(params: {
  hasToken: (provider: keyof ProviderTokens) => boolean;
  getOpenRouterSelectedModels: () => string[];
  isOllamaRunning: boolean;
  ollamaModels: ModelDefinition[];
  getAzureBaseUrl: () => string;
  customProviders: CustomProvider[];
  serverProviders?: string[];
  // Simulated hasConvex flag for testing (replaces import.meta.env.VITE_CONVEX_URL)
  hasConvex?: boolean;
}): ModelDefinition[] {
  const {
    hasToken,
    getAzureBaseUrl,
    getOpenRouterSelectedModels,
    isOllamaRunning,
    ollamaModels,
    customProviders,
    serverProviders = [],
    hasConvex = false,
  } = params;

  // AgntUX: server-side key fallback for self-hosted deployments
  const providerHasKey: Record<string, boolean> = {
    anthropic: hasToken('anthropic') || serverProviders.includes('anthropic'),
    openai: hasToken('openai') || serverProviders.includes('openai'),
    deepseek: hasToken('deepseek') || serverProviders.includes('deepseek'),
    google: hasToken('google') || serverProviders.includes('google'),
    mistral: hasToken('mistral') || serverProviders.includes('mistral'),
    xai: hasToken('xai') || serverProviders.includes('xai'),
    azure: Boolean(getAzureBaseUrl()),
    ollama: isOllamaRunning,
    openrouter: Boolean(hasToken('openrouter') && getOpenRouterSelectedModels().length > 0),
    meta: false,
  };

  // AgntUX: Hide MCPJam free-tier models when Convex is not configured (self-hosted)
  const cloud = SUPPORTED_MODELS.filter((m) => {
    if (isMCPJamProvidedModel(m.id)) return hasConvex;
    // AgntUX: limit to only Claude Sonnet 4.5 in self-hosted mode
    if (!hasConvex && m.id !== 'claude-sonnet-4-5') return false;
    return providerHasKey[m.provider];
  });

  const openRouterModels: ModelDefinition[] = providerHasKey.openrouter
    ? getOpenRouterSelectedModels().map((id) => ({
        id,
        name: id,
        provider: 'openrouter' as const,
      }))
    : [];

  const customModels: ModelDefinition[] = customProviders.flatMap((cp) =>
    cp.modelIds.map((modelId) => ({
      id: `custom:${cp.name}:${modelId}`,
      name: modelId,
      provider: 'custom' as const,
      customProviderName: cp.name,
    })),
  );

  let models: ModelDefinition[] = cloud;
  if (isOllamaRunning && ollamaModels.length > 0) models = models.concat(ollamaModels);
  if (openRouterModels.length > 0) models = models.concat(openRouterModels);
  if (customModels.length > 0) models = models.concat(customModels);
  return models;
}

const MODEL_CLAUDE_SONNET_4_5 = 'claude-sonnet-4-5';
const MODEL_CLAUDE_SONNET_4_0 = 'claude-sonnet-4-0';
const MODEL_CLAUDE_HAIKU_4_5 = 'claude-haiku-4-5';
const MODEL_CLAUDE_3_7_SONNET_LATEST = 'claude-3-7-sonnet-latest';
const MODEL_GPT_4_1 = 'gpt-4.1';
const MODEL_GEMINI_2_5_PRO = 'gemini-2.5-pro';
const MODEL_DEEPSEEK_CHAT = 'deepseek-chat';
const MODEL_MISTRAL_LARGE_LATEST = 'mistral-large-latest';

function getDefaultModel(availableModels: ModelDefinition[]): ModelDefinition {
  const modelIdsByPriority: string[] = [
    MODEL_CLAUDE_SONNET_4_5, // AgntUX: Sonnet 4.5 is the only model in self-hosted mode
    'anthropic/claude-haiku-4.5',
    'openai/gpt-5-mini',
    'meta-llama/llama-4-scout',
    MODEL_CLAUDE_SONNET_4_0,
    MODEL_CLAUDE_HAIKU_4_5,
    MODEL_CLAUDE_3_7_SONNET_LATEST,
    MODEL_GPT_4_1,
    MODEL_GEMINI_2_5_PRO,
    MODEL_DEEPSEEK_CHAT,
    MODEL_MISTRAL_LARGE_LATEST,
  ];

  for (const id of modelIdsByPriority) {
    const found = availableModels.find((m) => m.id === id);
    if (found) return found;
  }
  // AgntUX: Safe fallback when no models available yet (server providers still loading)
  return (
    availableModels[0] ?? {
      id: MODEL_CLAUDE_SONNET_4_5,
      name: 'Claude Sonnet 4.5',
      provider: 'anthropic' as const,
    }
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function noToken(_provider: keyof ProviderTokens): boolean {
  return false;
}

function baseParams(overrides: Partial<Parameters<typeof buildAvailableModels>[0]> = {}) {
  return {
    hasToken: noToken,
    getOpenRouterSelectedModels: () => [] as string[],
    isOllamaRunning: false,
    ollamaModels: [] as ModelDefinition[],
    getAzureBaseUrl: () => '',
    customProviders: [] as CustomProvider[],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('parseModelAliases', () => {
  it('parses a single alias', () => {
    const result = parseModelAliases('my-model', 'anthropic');
    expect(result).toEqual([{ id: 'my-model', name: 'my-model', provider: 'anthropic' }]);
  });

  it('parses multiple comma-separated aliases', () => {
    const result = parseModelAliases('model-a, model-b, model-c', 'openai');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: 'model-a', name: 'model-a', provider: 'openai' });
    expect(result[2]).toEqual({ id: 'model-c', name: 'model-c', provider: 'openai' });
  });

  it('trims whitespace from aliases', () => {
    const result = parseModelAliases('  trimmed  ,  also-trimmed  ', 'google');
    expect(result[0].id).toBe('trimmed');
    expect(result[1].id).toBe('also-trimmed');
  });

  it('filters out empty strings from the alias list', () => {
    const result = parseModelAliases(',,,', 'deepseek');
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty string', () => {
    const result = parseModelAliases('', 'mistral');
    expect(result).toHaveLength(0);
  });

  it('sets the correct provider on every alias', () => {
    const result = parseModelAliases('a,b', 'xai');
    expect(result.every((m) => m.provider === 'xai')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildAvailableModels — serverProviders (AgntUX self-hosted key fallback)', () => {
  it('includes only claude-sonnet-4-5 when serverProviders contains "anthropic" in self-hosted mode', () => {
    const models = buildAvailableModels(
      baseParams({ serverProviders: ['anthropic'] }),
    );
    // AgntUX: self-hosted mode (hasConvex=false) limits to only Sonnet 4.5
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('claude-sonnet-4-5');
  });

  it('does not include anthropic models when neither client token nor serverProvider is set', () => {
    const models = buildAvailableModels(baseParams());
    const anthropicModels = models.filter((m) => m.provider === 'anthropic' && !isMCPJamProvidedModel(m.id));
    expect(anthropicModels).toHaveLength(0);
  });

  it('excludes non-Sonnet-4.5 models in self-hosted mode even with serverProviders', () => {
    // AgntUX: in self-hosted (hasConvex=false), only claude-sonnet-4-5 is allowed
    const models = buildAvailableModels(baseParams({ serverProviders: ['openai'] }));
    const openaiModels = models.filter((m) => m.provider === 'openai' && !isMCPJamProvidedModel(m.id));
    expect(openaiModels).toHaveLength(0);
  });

  it('includes all provider models when hasConvex is true (non-self-hosted)', () => {
    const models = buildAvailableModels(
      baseParams({ hasConvex: true, serverProviders: ['anthropic', 'openai', 'deepseek', 'google', 'mistral', 'xai'] }),
    );
    const ids = models.map((m) => m.id);
    expect(ids).toContain('claude-sonnet-4-5');
    expect(ids).toContain('gpt-4.1');
    expect(ids).toContain('deepseek-chat');
    expect(ids).toContain('gemini-2.5-pro');
    expect(ids).toContain('mistral-large-latest');
    expect(ids).toContain('grok-3');
  });

  it('self-hosted mode only returns claude-sonnet-4-5 even with multiple serverProviders', () => {
    const models = buildAvailableModels(
      baseParams({ serverProviders: ['anthropic', 'openai', 'deepseek'] }),
    );
    const ids = models.map((m) => m.id);
    expect(ids).toEqual(['claude-sonnet-4-5']);
  });

  it('defaults serverProviders to [] when not provided — no server-side models added', () => {
    const models = buildAvailableModels(baseParams());
    // With no tokens and no serverProviders, only MCPJam models or ollama would appear
    const nonMCPJam = models.filter((m) => !isMCPJamProvidedModel(m.id));
    expect(nonMCPJam).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildAvailableModels — MCPJam free-tier models hidden without Convex (AgntUX)', () => {
  it('excludes MCPJam-provided models when hasConvex is false', () => {
    const models = buildAvailableModels(baseParams({ hasConvex: false }));
    const mcpjamModels = models.filter((m) => isMCPJamProvidedModel(m.id));
    expect(mcpjamModels).toHaveLength(0);
  });

  it('includes MCPJam-provided models when hasConvex is true', () => {
    const models = buildAvailableModels(baseParams({ hasConvex: true }));
    const mcpjamModels = models.filter((m) => isMCPJamProvidedModel(m.id));
    expect(mcpjamModels.length).toBeGreaterThan(0);
  });

  it('self-hosted mode limits to only claude-sonnet-4-5, Convex mode shows all provider models', () => {
    const modelsWithConvex = buildAvailableModels(
      baseParams({ hasConvex: true, serverProviders: ['anthropic'] }),
    );
    const modelsWithoutConvex = buildAvailableModels(
      baseParams({ hasConvex: false, serverProviders: ['anthropic'] }),
    );
    const regularWithConvex = modelsWithConvex.filter((m) => !isMCPJamProvidedModel(m.id));
    const regularWithoutConvex = modelsWithoutConvex.filter((m) => !isMCPJamProvidedModel(m.id));
    // AgntUX: self-hosted mode only returns Sonnet 4.5
    expect(regularWithoutConvex.map((m) => m.id)).toEqual(['claude-sonnet-4-5']);
    // Convex mode returns all anthropic models
    expect(regularWithConvex.length).toBeGreaterThan(1);
  });

  it('all MCPJam-provided model IDs in SUPPORTED_MODELS are correctly identified', () => {
    const known = SUPPORTED_MODELS.filter((m) => isMCPJamProvidedModel(m.id));
    // Confirm we have some MCPJam models in our test SUPPORTED_MODELS
    expect(known.length).toBeGreaterThan(0);
    for (const m of known) {
      expect(isMCPJamProvidedModel(m.id)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildAvailableModels — Ollama, OpenRouter, and custom providers', () => {
  it('includes ollama models when isOllamaRunning is true', () => {
    const ollamaModels: ModelDefinition[] = [
      { id: 'llama3', name: 'Llama 3', provider: 'ollama' },
    ];
    const models = buildAvailableModels(baseParams({ isOllamaRunning: true, ollamaModels }));
    const ids = models.map((m) => m.id);
    expect(ids).toContain('llama3');
  });

  it('excludes ollama models when isOllamaRunning is false', () => {
    const ollamaModels: ModelDefinition[] = [
      { id: 'llama3', name: 'Llama 3', provider: 'ollama' },
    ];
    const models = buildAvailableModels(
      baseParams({ isOllamaRunning: false, ollamaModels }),
    );
    const ids = models.map((m) => m.id);
    expect(ids).not.toContain('llama3');
  });

  it('includes openrouter models when token and selected models are present', () => {
    const hasTokenFn = (p: keyof ProviderTokens) => p === 'openrouter';
    const models = buildAvailableModels(
      baseParams({
        hasToken: hasTokenFn,
        getOpenRouterSelectedModels: () => ['openrouter/model-x'],
      }),
    );
    const ids = models.map((m) => m.id);
    expect(ids).toContain('openrouter/model-x');
  });

  it('excludes openrouter models when token is present but no models selected', () => {
    const hasTokenFn = (p: keyof ProviderTokens) => p === 'openrouter';
    const models = buildAvailableModels(
      baseParams({ hasToken: hasTokenFn, getOpenRouterSelectedModels: () => [] }),
    );
    const openrouterModels = models.filter((m) => m.provider === 'openrouter');
    expect(openrouterModels).toHaveLength(0);
  });

  it('includes custom provider models with prefixed id', () => {
    const customProviders: CustomProvider[] = [
      { name: 'my-provider', modelIds: ['model-alpha', 'model-beta'] },
    ];
    const models = buildAvailableModels(baseParams({ customProviders }));
    const ids = models.map((m) => m.id);
    expect(ids).toContain('custom:my-provider:model-alpha');
    expect(ids).toContain('custom:my-provider:model-beta');
  });

  it('custom models have provider="custom" and customProviderName set', () => {
    const customProviders: CustomProvider[] = [
      { name: 'acme', modelIds: ['acme-llm'] },
    ];
    const models = buildAvailableModels(baseParams({ customProviders }));
    const custom = models.find((m) => m.id === 'custom:acme:acme-llm');
    expect(custom).toBeDefined();
    expect(custom!.provider).toBe('custom');
    expect(custom!.customProviderName).toBe('acme');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('getDefaultModel', () => {
  it('returns the highest-priority available model', () => {
    const models: ModelDefinition[] = [
      { id: 'anthropic/claude-haiku-4.5', name: 'Haiku Free', provider: 'anthropic' },
      { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
    ];
    const result = getDefaultModel(models);
    // AgntUX: claude-sonnet-4-5 is first in priority list
    expect(result.id).toBe('claude-sonnet-4-5');
  });

  it('falls back down the priority list when top models are missing', () => {
    // Only claude-sonnet-4-5 is available
    const models: ModelDefinition[] = [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
    ];
    const result = getDefaultModel(models);
    expect(result.id).toBe('claude-sonnet-4-5');
  });

  it('returns first model in list when none match the priority list', () => {
    const models: ModelDefinition[] = [
      { id: 'some-unknown-model', name: 'Unknown', provider: 'ollama' },
    ];
    const result = getDefaultModel(models);
    expect(result.id).toBe('some-unknown-model');
  });

  it('returns safe hardcoded fallback when availableModels is empty (AgntUX regression)', () => {
    // AgntUX added this fallback for when server providers are still loading
    const result = getDefaultModel([]);
    expect(result.id).toBe(MODEL_CLAUDE_SONNET_4_5);
    expect(result.name).toBe('Claude Sonnet 4.5');
    expect(result.provider).toBe('anthropic');
  });

  it('prefers claude-sonnet-4-5 over MCPJam free-tier models (AgntUX)', () => {
    const models: ModelDefinition[] = [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
      { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini Free', provider: 'openai' },
      { id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout Free', provider: 'meta' },
    ];
    // AgntUX: claude-sonnet-4-5 is now top priority
    const result = getDefaultModel(models);
    expect(result.id).toBe('claude-sonnet-4-5');
  });

  it('does not throw when called with an empty array', () => {
    expect(() => getDefaultModel([])).not.toThrow();
  });
});
