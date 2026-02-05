/**
 * Host Validation Middleware Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { hostValidationMiddleware } from '../middleware/hostValidation.js';

// Mock the config module
vi.mock('../config.js', () => ({
  agntuxConfig: {
    enabled: true,
    allowedHosts: ['app.agntux.ai', 'agntux.app', 'localhost'],
  },
  isHostAllowed: vi.fn((host: string) => {
    const allowedHosts = ['app.agntux.ai', 'agntux.app', 'localhost'];
    return allowedHosts.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );
  }),
}));

import { agntuxConfig, isHostAllowed } from '../config.js';

/**
 * Create test app with host validation middleware
 */
function createTestApp(): Hono {
  const app = new Hono();
  app.use('*', hostValidationMiddleware);
  app.post('/api/test', (c) => c.json({ success: true }));
  return app;
}

describe('hostValidationMiddleware', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    // Reset config to enabled state
    agntuxConfig.enabled = true;
  });

  describe('allowed hosts', () => {
    it('passes for exact match - app.agntux.ai', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'https://app.agntux.ai/api',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('passes for exact match - agntux.app', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'https://agntux.app/mcp',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('passes for localhost', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('passes for subdomain - api.app.agntux.ai', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'https://api.app.agntux.ai/test',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('passes for subdomain - test.agntux.app', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'https://test.agntux.app',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('passes for localhost with port', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:8080/api',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe('rejected hosts', () => {
    it('rejects non-allowed host - example.com', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'https://example.com/api',
        }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Host not allowed');
    });

    it('rejects non-allowed host - malicious.com', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'https://malicious.com',
        }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Host not allowed');
    });

    it('returns generic error without exposing allowed hosts', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'https://evil.com',
        }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      // Security: error message should NOT expose internal allowed hosts list
      expect(json.error).toBe('Host not allowed');
      expect(json.error).not.toContain('app.agntux.ai');
      expect(json.error).not.toContain('agntux.app');
      expect(json.error).not.toContain('localhost');
    });

    it('rejects look-alike domain - agntux.app.evil.com', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'https://agntux.app.evil.com',
        }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Host not allowed');
    });
  });

  describe('malformed URLs', () => {
    it('returns 400 for invalid URL - no protocol', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'not-a-valid-url',
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Invalid mcpServerUrl');
    });

    it('returns 400 for invalid URL - malformed', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://[invalid',
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Invalid mcpServerUrl');
    });

    it('returns 400 for empty string', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: '',
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Invalid mcpServerUrl');
    });
  });

  describe('agntux mode disabled', () => {
    it('bypasses validation when agntux mode is disabled', async () => {
      agntuxConfig.enabled = false;

      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'https://any-host.com',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('allows any host when disabled', async () => {
      agntuxConfig.enabled = false;

      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'https://evil.com',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe('missing mcpServerUrl', () => {
    it('passes when mcpServerUrl is not provided', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('passes when mcpServerUrl is null', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcpServerUrl: null }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe('invalid JSON', () => {
    it('handles invalid JSON body gracefully', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json',
      });

      // Should pass through when JSON parsing fails (no mcpServerUrl to validate)
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
