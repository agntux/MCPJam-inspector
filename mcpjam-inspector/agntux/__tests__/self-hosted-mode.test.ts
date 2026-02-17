/**
 * Self-Hosted Mode Tests
 *
 * Tests for AgntUX config and NoOpWebSocket used in self-hosted mode.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- AgntUX Config Tests ---

describe('agntuxConfig', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('loads with enabled=true when AGNTUX_MODE=true', async () => {
    vi.stubEnv('AGNTUX_MODE', 'true');
    const { agntuxConfig } = await import('../config.js');
    expect(agntuxConfig.enabled).toBe(true);
    vi.unstubAllEnvs();
  });

  it('defaults to disabled when AGNTUX_MODE is not set', async () => {
    vi.stubEnv('AGNTUX_MODE', '');
    const { agntuxConfig } = await import('../config.js');
    expect(agntuxConfig.enabled).toBe(false);
    vi.unstubAllEnvs();
  });

  it('defaults to disabled when AGNTUX_MODE is a non-true value', async () => {
    vi.stubEnv('AGNTUX_MODE', 'false');
    const { agntuxConfig } = await import('../config.js');
    expect(agntuxConfig.enabled).toBe(false);
    vi.unstubAllEnvs();
  });

  it('has expected allowedHosts list', async () => {
    const { agntuxConfig } = await import('../config.js');
    expect(agntuxConfig.allowedHosts).toContain('app.agntux.ai');
    expect(agntuxConfig.allowedHosts).toContain('agntux.app');
    expect(agntuxConfig.allowedHosts).toContain('localhost');
  });
});

describe('isHostAllowed', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns true for allowed host when in agntux mode', async () => {
    vi.stubEnv('AGNTUX_MODE', 'true');
    const { isHostAllowed } = await import('../config.js');
    expect(isHostAllowed('app.agntux.ai')).toBe(true);
    vi.unstubAllEnvs();
  });

  it('returns true for subdomain of allowed host when in agntux mode', async () => {
    vi.stubEnv('AGNTUX_MODE', 'true');
    const { isHostAllowed } = await import('../config.js');
    expect(isHostAllowed('api.app.agntux.ai')).toBe(true);
    vi.unstubAllEnvs();
  });

  it('returns false for disallowed host when in agntux mode', async () => {
    vi.stubEnv('AGNTUX_MODE', 'true');
    const { isHostAllowed } = await import('../config.js');
    expect(isHostAllowed('evil.com')).toBe(false);
    vi.unstubAllEnvs();
  });

  it('returns true for any host when not in agntux mode', async () => {
    vi.stubEnv('AGNTUX_MODE', '');
    const { isHostAllowed } = await import('../config.js');
    expect(isHostAllowed('evil.com')).toBe(true);
    expect(isHostAllowed('anything.example.org')).toBe(true);
    vi.unstubAllEnvs();
  });
});

// --- NoOpWebSocket Tests ---

import { NoOpWebSocket } from '../lib/no-op-websocket.js';

describe('NoOpWebSocket', () => {
  it('sets url property from constructor', () => {
    const ws = new NoOpWebSocket('wss://example.com');
    expect(ws.url).toBe('wss://example.com');
  });

  it('readyState starts at CONNECTING (0)', () => {
    const ws = new NoOpWebSocket('wss://example.com');
    expect(ws.readyState).toBe(0);
  });

  it('close() sets readyState to CLOSED (3)', () => {
    const ws = new NoOpWebSocket('wss://example.com');
    ws.close();
    expect(ws.readyState).toBe(3);
  });

  it('send() does not throw', () => {
    const ws = new NoOpWebSocket('wss://example.com');
    expect(() => ws.send()).not.toThrow();
  });

  it('addEventListener does not throw', () => {
    const ws = new NoOpWebSocket('wss://example.com');
    expect(() => ws.addEventListener()).not.toThrow();
  });

  it('removeEventListener does not throw', () => {
    const ws = new NoOpWebSocket('wss://example.com');
    expect(() => ws.removeEventListener()).not.toThrow();
  });

  it('dispatchEvent returns false', () => {
    const ws = new NoOpWebSocket('wss://example.com');
    expect(ws.dispatchEvent()).toBe(false);
  });

  it('static CONNECTING equals 0', () => {
    expect(NoOpWebSocket.CONNECTING).toBe(0);
  });

  it('static OPEN equals 1', () => {
    expect(NoOpWebSocket.OPEN).toBe(1);
  });

  it('static CLOSING equals 2', () => {
    expect(NoOpWebSocket.CLOSING).toBe(2);
  });

  it('static CLOSED equals 3', () => {
    expect(NoOpWebSocket.CLOSED).toBe(3);
  });

  it('event handler properties default to null', () => {
    const ws = new NoOpWebSocket('wss://example.com');
    expect(ws.onopen).toBeNull();
    expect(ws.onclose).toBeNull();
    expect(ws.onerror).toBeNull();
    expect(ws.onmessage).toBeNull();
  });
});
