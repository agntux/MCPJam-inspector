/**
 * Host Validation Middleware
 *
 * Validates that MCP server URLs are from allowed hosts in AgntUX mode.
 */

import type { Context, Next } from 'hono';
import { isHostAllowed, agntuxConfig } from '../config.js';

/**
 * Middleware to validate MCP server host
 */
export async function hostValidationMiddleware(c: Context, next: Next) {
  if (!agntuxConfig.enabled) {
    return next();
  }

  const body = await c.req.json().catch(() => ({}));
  const mcpServerUrl = body.mcpServerUrl;

  // Validate mcpServerUrl if it's provided (not undefined/null)
  if (mcpServerUrl !== undefined && mcpServerUrl !== null) {
    // Empty string is invalid
    if (typeof mcpServerUrl !== 'string' || mcpServerUrl.trim() === '') {
      return c.json(
        {
          success: false,
          error: 'Invalid mcpServerUrl',
        },
        400
      );
    }

    try {
      const url = new URL(mcpServerUrl);
      if (!isHostAllowed(url.hostname)) {
        return c.json(
          {
            success: false,
            error: 'Host not allowed',
          },
          403
        );
      }
    } catch {
      return c.json(
        {
          success: false,
          error: 'Invalid mcpServerUrl',
        },
        400
      );
    }
  }

  return next();
}
