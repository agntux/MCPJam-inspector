/**
 * AgntUX API Handlers Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { healthHandler, testHandler } from '../api/handlers.js';

// Mock the testRunner module
vi.mock('../playwright/testRunner.js', () => ({
  runPlaywrightTests: vi.fn(),
}));

import { runPlaywrightTests } from '../playwright/testRunner.js';

/**
 * Create test app with handlers
 */
function createTestApp(): Hono {
  const app = new Hono();
  app.get('/api/health', healthHandler);
  app.post('/api/test', testHandler);
  return app;
}

describe('healthHandler', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('returns correct response structure', async () => {
    const res = await app.request('/api/health');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty('status');
    expect(json).toHaveProperty('mode');
    expect(json).toHaveProperty('timestamp');
  });

  it('returns ok status', async () => {
    const res = await app.request('/api/health');
    const json = await res.json();

    expect(json.status).toBe('ok');
  });

  it('returns agntux mode', async () => {
    const res = await app.request('/api/health');
    const json = await res.json();

    expect(json.mode).toBe('agntux');
  });

  it('returns ISO timestamp', async () => {
    const res = await app.request('/api/health');
    const json = await res.json();

    expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('testHandler', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('validation', () => {
    it('returns 400 when mcpServerUrl is missing', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarios: [] }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Missing required fields');
    });

    it('returns 400 when scenarios is missing', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcpServerUrl: 'http://localhost:3000' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Missing required fields');
    });

    it('returns 400 when scenarios is not an array', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
          scenarios: 'not-an-array',
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Missing required fields');
    });

    it('returns 400 when both fields are missing', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Missing required fields');
    });

    it('returns 400 when mcpServerUrl is not a valid URL', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'not-a-valid-url',
          scenarios: [],
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid mcpServerUrl');
    });

    it('returns 400 when mcpServerUrl has invalid protocol', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'ftp://localhost:3000',
          scenarios: [],
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid mcpServerUrl');
    });

    it('accepts valid http URL', async () => {
      const mockResults = {
        success: true,
        scenarios: [],
        summary: { total: 0, passed: 0, failed: 0 },
      };
      vi.mocked(runPlaywrightTests).mockResolvedValue(mockResults);

      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
          scenarios: [],
        }),
      });

      expect(res.status).toBe(200);
    });

    it('accepts valid https URL', async () => {
      const mockResults = {
        success: true,
        scenarios: [],
        summary: { total: 0, passed: 0, failed: 0 },
      };
      vi.mocked(runPlaywrightTests).mockResolvedValue(mockResults);

      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'https://example.com/mcp',
          scenarios: [],
        }),
      });

      expect(res.status).toBe(200);
    });

    it('returns 400 when a mockServerUrl is not a valid URL', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
          scenarios: [],
          mockServerUrls: ['not-a-valid-url'],
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid mockServerUrl');
      expect(json.error).toContain('not-a-valid-url');
    });

    it('returns 400 when a mockServerUrl has invalid protocol', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
          scenarios: [],
          mockServerUrls: ['ftp://mock.example.com'],
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid mockServerUrl');
    });

    it('returns 400 when second mockServerUrl in array is invalid', async () => {
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
          scenarios: [],
          mockServerUrls: ['http://valid.example.com', 'not-valid'],
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid mockServerUrl');
      expect(json.error).toContain('not-valid');
    });

    it('accepts valid mockServerUrls array', async () => {
      const mockResults = {
        success: true,
        scenarios: [],
        summary: { total: 0, passed: 0, failed: 0 },
      };
      vi.mocked(runPlaywrightTests).mockResolvedValue(mockResults);

      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
          scenarios: [],
          mockServerUrls: ['http://mock1.example.com', 'https://mock2.example.com'],
        }),
      });

      expect(res.status).toBe(200);
    });

    it('accepts request without mockServerUrls field', async () => {
      const mockResults = {
        success: true,
        scenarios: [],
        summary: { total: 0, passed: 0, failed: 0 },
      };
      vi.mocked(runPlaywrightTests).mockResolvedValue(mockResults);

      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
          scenarios: [],
        }),
      });

      expect(res.status).toBe(200);
    });
  });

  describe('successful execution', () => {
    it('calls runPlaywrightTests with correct parameters (no mockServerUrls)', async () => {
      const mockResults = {
        success: true,
        scenarios: [],
        summary: { total: 0, passed: 0, failed: 0 },
      };
      vi.mocked(runPlaywrightTests).mockResolvedValue(mockResults);

      const mcpServerUrl = 'http://localhost:3000';
      const scenarios = [{ name: 'test-scenario' }];

      await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcpServerUrl, scenarios }),
      });

      expect(runPlaywrightTests).toHaveBeenCalledWith(mcpServerUrl, scenarios, undefined);
      expect(runPlaywrightTests).toHaveBeenCalledTimes(1);
    });

    it('calls runPlaywrightTests with mockServerUrls when provided', async () => {
      const mockResults = {
        success: true,
        scenarios: [],
        summary: { total: 0, passed: 0, failed: 0 },
      };
      vi.mocked(runPlaywrightTests).mockResolvedValue(mockResults);

      const mcpServerUrl = 'http://localhost:3000';
      const scenarios = [{ name: 'test-scenario' }];
      const mockServerUrls = ['http://mock1.example.com', 'https://mock2.example.com'];

      await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcpServerUrl, scenarios, mockServerUrls }),
      });

      expect(runPlaywrightTests).toHaveBeenCalledWith(mcpServerUrl, scenarios, mockServerUrls);
      expect(runPlaywrightTests).toHaveBeenCalledTimes(1);
    });

    it('returns results from runPlaywrightTests', async () => {
      const mockResults = {
        success: false,
        scenarios: [
          {
            name: 'test-1',
            passed: true,
            screenshots: [],
            consoleErrors: [],
            mcpCalls: [],
            postMessages: [],
            widgetState: {},
            assertions: [],
            loadTimeMs: 100,
          },
          {
            name: 'test-2',
            passed: false,
            error: 'Test failed',
            screenshots: [],
            consoleErrors: [],
            mcpCalls: [],
            postMessages: [],
            widgetState: {},
            assertions: [],
            loadTimeMs: 200,
          },
        ],
        summary: { total: 2, passed: 1, failed: 1 },
      };
      vi.mocked(runPlaywrightTests).mockResolvedValue(mockResults);

      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
          scenarios: [{ name: 'test-1' }, { name: 'test-2' }],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(mockResults);
    });

    it('handles empty scenarios array', async () => {
      const mockResults = {
        success: true,
        scenarios: [],
        summary: { total: 0, passed: 0, failed: 0 },
      };
      vi.mocked(runPlaywrightTests).mockResolvedValue(mockResults);

      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
          scenarios: [],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(mockResults);
    });
  });

  describe('error handling', () => {
    it('returns 500 when runPlaywrightTests throws Error', async () => {
      const errorMessage = 'Test execution failed';
      vi.mocked(runPlaywrightTests).mockRejectedValue(new Error(errorMessage));

      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
          scenarios: [],
        }),
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe(errorMessage);
    });

    it('returns 500 when runPlaywrightTests throws non-Error', async () => {
      vi.mocked(runPlaywrightTests).mockRejectedValue('string error');

      const res = await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
          scenarios: [],
        }),
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('string error');
    });

    it('logs errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Test error');
      vi.mocked(runPlaywrightTests).mockRejectedValue(error);

      await app.request('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerUrl: 'http://localhost:3000',
          scenarios: [],
        }),
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Test execution error:', error);
      consoleErrorSpy.mockRestore();
    });
  });
});
