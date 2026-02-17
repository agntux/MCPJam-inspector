/**
 * Config Endpoint Tests
 *
 * Tests for the /api/config/server-providers endpoint that exposes
 * which LLM providers have server-side API keys configured.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';

// We import the route factory fresh per test via dynamic import + resetModules
// so that process.env reads inside the handler reflect our stubs.

describe('/api/config/server-providers', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear all provider env vars before each test
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    vi.stubEnv('GOOGLE_API_KEY', '');
    vi.stubEnv('MISTRAL_API_KEY', '');
    vi.stubEnv('XAI_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function createApp(): Promise<Hono> {
    const mod = await import('../../server/routes/config.js');
    const app = new Hono();
    app.route('/api/config', mod.default);
    return app;
  }

  it('returns empty array when no API keys are set', async () => {
    const app = await createApp();
    const res = await app.request('/api/config/server-providers');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ providers: [] });
  });

  it('returns ["anthropic"] when only ANTHROPIC_API_KEY is set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-key');
    const app = await createApp();
    const res = await app.request('/api/config/server-providers');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ providers: ['anthropic'] });
  });

  it('returns ["openai"] when only OPENAI_API_KEY is set', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-test-key');
    const app = await createApp();
    const res = await app.request('/api/config/server-providers');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ providers: ['openai'] });
  });

  it('returns all providers when all keys are set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-key');
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-key');
    vi.stubEnv('DEEPSEEK_API_KEY', 'sk-deepseek-key');
    vi.stubEnv('GOOGLE_API_KEY', 'google-key');
    vi.stubEnv('MISTRAL_API_KEY', 'mistral-key');
    vi.stubEnv('XAI_API_KEY', 'xai-key');
    const app = await createApp();
    const res = await app.request('/api/config/server-providers');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.providers).toEqual(
      expect.arrayContaining(['anthropic', 'openai', 'deepseek', 'google', 'mistral', 'xai'])
    );
    expect(json.providers).toHaveLength(6);
  });

  it('response has { providers: string[] } shape', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-key');
    const app = await createApp();
    const res = await app.request('/api/config/server-providers');
    const json = await res.json();

    expect(json).toHaveProperty('providers');
    expect(Array.isArray(json.providers)).toBe(true);
    for (const p of json.providers) {
      expect(typeof p).toBe('string');
    }
  });

  it('does not expose actual API key values in the response', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-secret-value');
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-secret-value');
    const app = await createApp();
    const res = await app.request('/api/config/server-providers');
    const text = await res.text();

    expect(text).not.toContain('sk-ant-secret-value');
    expect(text).not.toContain('sk-openai-secret-value');
    // Only provider names should appear
    expect(text).toContain('anthropic');
    expect(text).toContain('openai');
  });
});
