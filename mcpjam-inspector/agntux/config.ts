/**
 * AgntUX Configuration
 *
 * Environment-based configuration for AgntUX mode in MCPJam Inspector.
 * When AGNTUX_MODE=true, the inspector runs in AgntUX testing mode.
 */

export interface AgntuxConfig {
  /** Whether AgntUX mode is enabled */
  enabled: boolean;
  /** Alias for `enabled` — true when running without Convex/WorkOS (self-hosted) */
  isSelfHostedMode: boolean;
  /** True when VITE_MCPJAM_HOSTED_MODE is set (managed cloud deployment) */
  isHostedMode: boolean;
  /** True when Convex is required (i.e. NOT self-hosted) */
  convexRequired: boolean;
  /** Allowed hosts for MCP server connections */
  allowedHosts: readonly string[];
  /** Default timeout for Playwright tests (ms) */
  testTimeout: number;
}

const _enabled = process.env.AGNTUX_MODE === 'true';
const _isHostedMode = process.env.VITE_MCPJAM_HOSTED_MODE === 'true';

export const agntuxConfig: AgntuxConfig = {
  enabled: _enabled,
  isSelfHostedMode: _enabled,
  isHostedMode: _isHostedMode,
  convexRequired: !_enabled,
  allowedHosts: ['app.agntux.ai', 'agntux.app', 'localhost'],
  testTimeout: 60000,
};

/**
 * Check if a host is allowed for MCP connections
 */
export function isHostAllowed(host: string): boolean {
  if (!agntuxConfig.enabled) return true; // No restrictions in normal mode
  return agntuxConfig.allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}

export default agntuxConfig;
