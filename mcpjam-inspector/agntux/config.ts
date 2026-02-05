/**
 * AgntUX Configuration
 *
 * Environment-based configuration for AgntUX mode in MCPJam Inspector.
 * When AGNTUX_MODE=true, the inspector runs in AgntUX testing mode.
 */

export interface AgntuxConfig {
  /** Whether AgntUX mode is enabled */
  enabled: boolean;
  /** Allowed hosts for MCP server connections */
  allowedHosts: readonly string[];
  /** Default timeout for Playwright tests (ms) */
  testTimeout: number;
}

export const agntuxConfig: AgntuxConfig = {
  enabled: process.env.AGNTUX_MODE === 'true',
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
