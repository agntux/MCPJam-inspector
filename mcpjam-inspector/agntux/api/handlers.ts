/**
 * AgntUX API Handlers
 */

import type { Context } from 'hono';
import type { TestScenario } from '../playwright/testRunner.js';
import { runPlaywrightTests } from '../playwright/testRunner.js';

/**
 * Request body for test endpoint
 */
interface TestRequestBody {
  mcpServerUrl: string;
  scenarios: TestScenario[];
}

/**
 * Validates that a string is a valid URL with http or https protocol
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Health check endpoint
 * GET /api/health
 */
export async function healthHandler(c: Context): Promise<Response> {
  return c.json({
    status: 'ok',
    mode: 'agntux',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Visual test execution endpoint
 * POST /api/test
 */
export async function testHandler(c: Context): Promise<Response> {
  try {
    const body = (await c.req.json()) as Partial<TestRequestBody>;
    const { mcpServerUrl, scenarios } = body;

    if (!mcpServerUrl || !scenarios || !Array.isArray(scenarios)) {
      return c.json(
        {
          success: false,
          error: 'Missing required fields: mcpServerUrl and scenarios array',
        },
        400
      );
    }

    if (!isValidUrl(mcpServerUrl)) {
      return c.json(
        {
          success: false,
          error: 'Invalid mcpServerUrl: must be a valid HTTP or HTTPS URL',
        },
        400
      );
    }

    const results = await runPlaywrightTests(mcpServerUrl, scenarios);
    return c.json(results);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Test execution error:', error);
    return c.json(
      {
        success: false,
        error: errorMessage,
      },
      500
    );
  }
}
