/**
 * Upstream Modifications Regression Tests
 *
 * These tests guard against upstream merges accidentally removing or breaking
 * AgntUX-specific modifications to upstream files.
 *
 * Covered modifications:
 * 1. session-auth.ts — `/api/config/server-providers` added to UNPROTECTED_ROUTES
 * 2. chat-v2.ts — `serverKeyMap` fallback for server-side API keys
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// 1. Session Auth — unprotected route regression
// ---------------------------------------------------------------------------

// Mock session-token service so we control validateToken without a real token
vi.mock('../../server/services/session-token.js', () => ({
  validateToken: vi.fn().mockReturnValue(false),
}));

describe('session-auth middleware — AgntUX unprotected route regression', () => {
  let app: Hono;

  beforeEach(async () => {
    vi.resetModules();

    // Re-import after resetModules so the mock is fresh
    const { sessionAuthMiddleware } = await import(
      '../../server/middleware/session-auth.js'
    );

    app = new Hono();
    app.use('*', sessionAuthMiddleware);
    // Dummy handler that always returns 200
    app.all('*', (c) => c.json({ ok: true }, 200));
  });

  it('allows GET /api/config/server-providers without auth token (returns 200)', async () => {
    const res = await app.request('/api/config/server-providers', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
  });

  it('blocks GET /api/some-protected-route without auth token (returns 401)', async () => {
    const res = await app.request('/api/some-protected-route', {
      method: 'GET',
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('allows non-API routes through without auth (static assets etc.)', async () => {
    const res = await app.request('/', { method: 'GET' });
    expect(res.status).toBe(200);
  });

  it('allows OPTIONS preflight through without auth', async () => {
    const res = await app.request('/api/any-route', { method: 'OPTIONS' });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 2. Chat-v2 — serverKeyMap regression
// ---------------------------------------------------------------------------

// Mock the AI SDK
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    convertToModelMessages: vi.fn((messages) => messages),
    streamText: vi.fn().mockReturnValue({
      toUIMessageStreamResponse: vi.fn().mockReturnValue(
        new Response(JSON.stringify({ type: 'text', content: 'Hello' }), {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    }),
    stepCountIs: vi.fn().mockReturnValue(() => false),
  };
});

// Mock chat-helpers — we need to spy on createLlmModel
vi.mock('../../server/utils/chat-helpers', async () => {
  const actual = await vi.importActual<
    typeof import('../../server/utils/chat-helpers')
  >('../../server/utils/chat-helpers');
  return {
    createLlmModel: vi.fn().mockReturnValue({}),
    scrubMcpAppsToolResultsForBackend: vi.fn((messages) => messages),
    scrubChatGPTAppsToolResultsForBackend: vi.fn((messages) => messages),
    isAnthropicCompatibleModel: actual.isAnthropicCompatibleModel,
    getInvalidAnthropicToolNames: actual.getInvalidAnthropicToolNames,
  };
});

// Mock shared types
vi.mock('@/shared/types', () => ({
  isGPT5Model: vi.fn().mockReturnValue(false),
  isMCPJamProvidedModel: vi.fn().mockReturnValue(false),
}));

// Mock skill-tools to avoid file system operations
vi.mock('../../server/utils/skill-tools', () => ({
  getSkillToolsAndPrompt: vi.fn().mockResolvedValue({
    tools: {},
    systemPromptSection: '',
  }),
}));

// Mock http-tool-calls (used by mcpjam-stream-handler, transitively imported)
vi.mock('@/shared/http-tool-calls', () => ({
  hasUnresolvedToolCalls: vi.fn().mockReturnValue(false),
  executeToolCallsFromMessages: vi.fn(),
}));

/** Minimal MCP client manager stub */
function createMockManager() {
  return {
    getToolsForAiSdk: vi.fn().mockResolvedValue({}),
  };
}

/** Build a minimal Hono test app wired to chat-v2 */
async function buildChatApp(manager: ReturnType<typeof createMockManager>) {
  const { default: chatV2 } = await import(
    '../../server/routes/mcp/chat-v2.js'
  );
  const app = new Hono();
  // Inject manager into context (mirrors how the real server does it)
  app.use('*', async (c, next) => {
    // @ts-ignore — mcpClientManager is added by the real middleware
    c.mcpClientManager = manager;
    await next();
  });
  app.route('/api/mcp/chat-v2', chatV2);
  return app;
}

const VALID_MESSAGES = [{ role: 'user', content: 'Hello' }];
const ANTHROPIC_MODEL = { id: 'claude-sonnet-4-0', provider: 'anthropic', name: 'Claude' };

describe('chat-v2 serverKeyMap — AgntUX regression', () => {
  let manager: ReturnType<typeof createMockManager>;
  let app: Hono;
  // Hold a stable reference to the mocked createLlmModel
  let createLlmModelMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Clear all provider env vars before each test
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.XAI_API_KEY;

    manager = createMockManager();
    app = await buildChatApp(manager);

    // Grab the mock reference after the app is built
    const helpers = await import('../../server/utils/chat-helpers');
    createLlmModelMock = vi.mocked(helpers.createLlmModel);
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.XAI_API_KEY;
  });

  it('uses server-side ANTHROPIC_API_KEY when body.apiKey is absent', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-server-key-anthropic';

    await app.request('/api/mcp/chat-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: VALID_MESSAGES,
        model: ANTHROPIC_MODEL,
        // no apiKey provided
      }),
    });

    expect(createLlmModelMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'anthropic' }),
      'sk-server-key-anthropic',
      expect.anything(),
      undefined,
    );
  });

  it('uses server-side ANTHROPIC_API_KEY when body.apiKey is empty string', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-server-key-anthropic';

    await app.request('/api/mcp/chat-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: VALID_MESSAGES,
        model: ANTHROPIC_MODEL,
        apiKey: '',
      }),
    });

    expect(createLlmModelMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'anthropic' }),
      'sk-server-key-anthropic',
      expect.anything(),
      undefined,
    );
  });

  it('client-provided apiKey takes priority over server-side key', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-server-key-anthropic';

    await app.request('/api/mcp/chat-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: VALID_MESSAGES,
        model: ANTHROPIC_MODEL,
        apiKey: 'sk-client-provided-key',
      }),
    });

    expect(createLlmModelMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'anthropic' }),
      'sk-client-provided-key',
      expect.anything(),
      undefined,
    );
  });

  it('effectiveApiKey is empty string when neither client nor server key exists', async () => {
    // No env var, no client key
    await app.request('/api/mcp/chat-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: VALID_MESSAGES,
        model: ANTHROPIC_MODEL,
        // no apiKey
      }),
    });

    expect(createLlmModelMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'anthropic' }),
      '',
      expect.anything(),
      undefined,
    );
  });

  it('uses server-side OPENAI_API_KEY for openai provider', async () => {
    process.env.OPENAI_API_KEY = 'sk-server-openai-key';

    await app.request('/api/mcp/chat-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: VALID_MESSAGES,
        model: { id: 'gpt-4o', provider: 'openai', name: 'GPT-4o' },
        // no apiKey
      }),
    });

    expect(createLlmModelMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'openai' }),
      'sk-server-openai-key',
      expect.anything(),
      undefined,
    );
  });

  it('does not leak server key for a different provider', async () => {
    // Only openai key set, but request uses anthropic model with no client key
    process.env.OPENAI_API_KEY = 'sk-server-openai-key';

    await app.request('/api/mcp/chat-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: VALID_MESSAGES,
        model: ANTHROPIC_MODEL,
        // no apiKey for anthropic
      }),
    });

    // effectiveApiKey should be "" (openai key must NOT be used for anthropic)
    expect(createLlmModelMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'anthropic' }),
      '',
      expect.anything(),
      undefined,
    );
  });
});
