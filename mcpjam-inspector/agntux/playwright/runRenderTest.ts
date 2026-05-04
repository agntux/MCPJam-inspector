/**
 * Render-only test helper for MCP App UI handlers.
 *
 * The existing testRunner.ts is general-purpose: scenarios with assertions,
 * interactions, and screenshots. This helper is the narrower, faster path
 * the agntux-plugin-dev `plugin-toolkit` test harness uses to iterate on
 * a UI handler:
 *
 *   1. Spawn a Chromium page pointed at MCPJam Inspector with the plugin's
 *      MCP server URL.
 *   2. Trigger one tool call (or inject prebuilt structuredContent for
 *      fixture-driven flows that bypass the MCP server entirely).
 *   3. Wait for the iframe to render, capture a single screenshot, return
 *      console errors + tool-call log + widget state.
 *
 * Used both directly by the `plugin-toolkit-test` CLI and indirectly via
 * the existing /api/test handler when scenarios in the request use the
 * `prebuiltStructuredContent` field.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { agntuxConfig } from '../config.js';
import type { TestScenario, ScenarioResult } from './testRunner.js';

export interface RenderTestOptions {
  /** Plugin MCP server URL (stdio bridge, HTTP endpoint, or hosted). */
  mcpServerUrl: string;
  /** Tool to invoke. Either this or `prebuiltStructuredContent` must be provided. */
  toolName?: string;
  /** Tool args (passed as the structuredContent input to the MCP server). */
  toolArgs?: Record<string, unknown>;
  /**
   * Skip the MCP tool call and inject this structuredContent directly
   * into the iframe via postMessage. Use for fixture-driven render tests
   * where the server isn't relevant to what's being asserted.
   */
  prebuiltStructuredContent?: unknown;
  /** Inspector base URL. Defaults to localhost:6274. */
  inspectorUrl?: string;
  /** Optional mock server URLs to register alongside the primary. */
  mockServerUrls?: string[];
  /** Hard timeout for the full render. Defaults to agntuxConfig.testTimeout. */
  timeoutMs?: number;
  /** Capture extra screenshot before any tool call (useful for empty-state). */
  captureBeforeFrame?: boolean;
}

export interface RenderTestResult {
  /** PNG screenshot of the rendered iframe (base64). */
  screenshot: string;
  /** Optional pre-render screenshot if captureBeforeFrame was set. */
  screenshotBefore?: string;
  /** Console errors and uncaught exceptions raised during render. */
  consoleErrors: Array<{ message: string; stack?: string }>;
  /** MCP tool calls observed (chain — for asserting tool-call sequences). */
  mcpCalls: Array<{
    method: string;
    toolName?: string;
    args?: Record<string, unknown>;
    response?: Record<string, unknown>;
    timestamp: number;
  }>;
  /** widgetState snapshot post-render (read from window.__WIDGET_STATE__). */
  widgetState: Record<string, unknown>;
  /** True if no console errors and screenshot was captured. */
  passed: boolean;
  /** Render error if failed. */
  error?: string;
  /** End-to-end render time. */
  loadTimeMs: number;
}

/**
 * Run a single render test against a freshly-spawned browser. Caller is
 * responsible for ensuring MCPJam Inspector is reachable at `inspectorUrl`.
 *
 * For batched runs, prefer `runRenderTests` which shares one browser.
 */
export async function runRenderTest(
  options: RenderTestOptions
): Promise<RenderTestResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    try {
      const page = await context.newPage();
      try {
        return await renderOnPage(page, options);
      } finally {
        await page.close();
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

/**
 * Run multiple render tests against one shared browser instance. ~10x
 * faster than calling runRenderTest in a loop.
 */
export async function runRenderTests(
  list: RenderTestOptions[]
): Promise<RenderTestResult[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const results: RenderTestResult[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    try {
      for (const options of list) {
        const page = await context.newPage();
        try {
          results.push(await renderOnPage(page, options));
        } finally {
          await page.close();
        }
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

async function renderOnPage(
  page: Page,
  options: RenderTestOptions
): Promise<RenderTestResult> {
  const startTime = Date.now();
  const result: RenderTestResult = {
    screenshot: '',
    consoleErrors: [],
    mcpCalls: [],
    widgetState: {},
    passed: false,
    loadTimeMs: 0,
  };

  if (!options.toolName && options.prebuiltStructuredContent === undefined) {
    result.error = 'runRenderTest: must provide either `toolName` or `prebuiltStructuredContent`.';
    result.loadTimeMs = Date.now() - startTime;
    return result;
  }

  const timeout = options.timeoutMs ?? agntuxConfig.testTimeout;

  const onPageError = (e: Error): void => {
    result.consoleErrors.push({ message: e.message, stack: e.stack });
  };
  const onConsole = (msg: { type: () => string; text: () => string }): void => {
    if (msg.type() === 'error') result.consoleErrors.push({ message: msg.text() });
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  try {
    const inspectorBase = options.inspectorUrl ?? 'http://localhost:6274';
    const params = new URLSearchParams();
    params.append('mcpServerUrl', options.mcpServerUrl);
    if (options.mockServerUrls) {
      for (const url of options.mockServerUrls) params.append('mcpServerUrl', url);
    }
    await page.goto(`${inspectorBase}?${params.toString()}`, { waitUntil: 'networkidle', timeout });

    // Best-effort: wait for the connected indicator if the inspector renders one.
    await page
      .waitForSelector('[data-testid="mcp-connected"]', { timeout })
      .catch(() => page.waitForSelector('body', { timeout }));

    if (options.captureBeforeFrame) {
      const buf = await page.screenshot({ type: 'png' });
      result.screenshotBefore = buf.toString('base64');
    }

    if (options.prebuiltStructuredContent !== undefined) {
      // Inject directly into the rendered iframe via the same postMessage
      // channel a real tool response would use. The inspector listens for
      // an `mcp-prebuilt-structured-content` event on `window`.
      await page.evaluate((sc: unknown) => {
        window.dispatchEvent(
          new CustomEvent('mcp-prebuilt-structured-content', { detail: { structuredContent: sc } })
        );
      }, options.prebuiltStructuredContent);
    } else {
      // Trigger the MCP tool call through the inspector's existing event hook.
      await page.evaluate(
        async ({ toolName, args }: { toolName: string; args: Record<string, unknown> }) => {
          window.dispatchEvent(new CustomEvent('mcp-tool-call', { detail: { toolName, args } }));
        },
        { toolName: options.toolName!, args: options.toolArgs ?? {} }
      );
    }

    // Allow time for tool response / iframe paint.
    await page.waitForTimeout(1000);

    // Capture the final frame.
    const buf = await page.screenshot({ type: 'png' });
    result.screenshot = buf.toString('base64');

    // Capture widget state.
    result.widgetState = await page.evaluate(() => {
      const w = window as unknown as { __WIDGET_STATE__?: Record<string, unknown> };
      return w.__WIDGET_STATE__ ?? {};
    });

    // Capture observed mcp calls if the inspector exposes them.
    result.mcpCalls = await page.evaluate(() => {
      const w = window as unknown as {
        __MCP_CALL_LOG__?: Array<{
          method: string;
          toolName?: string;
          args?: Record<string, unknown>;
          response?: Record<string, unknown>;
          timestamp: number;
        }>;
      };
      return w.__MCP_CALL_LOG__ ?? [];
    });

    result.passed = result.consoleErrors.length === 0;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    result.passed = false;
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
  }

  result.loadTimeMs = Date.now() - startTime;
  return result;
}

/**
 * Convenience adapter: convert a render result to the existing
 * ScenarioResult shape for callers that already consume that schema.
 */
export function renderResultToScenarioResult(
  scenarioName: string,
  result: RenderTestResult
): ScenarioResult {
  const screenshots: ScenarioResult['screenshots'] = [];
  if (result.screenshotBefore) {
    screenshots.push({ name: `${scenarioName}-before.png`, base64: result.screenshotBefore });
  }
  if (result.screenshot) {
    screenshots.push({ name: `${scenarioName}.png`, base64: result.screenshot });
  }
  return {
    name: scenarioName,
    passed: result.passed,
    error: result.error,
    screenshots,
    consoleErrors: result.consoleErrors,
    mcpCalls: result.mcpCalls,
    postMessages: [],
    widgetState: result.widgetState,
    assertions: [],
    loadTimeMs: result.loadTimeMs,
  };
}

/**
 * Re-export TestScenario so consumers can write fixture-driven scenarios
 * without depending on testRunner.ts directly. Adds the optional
 * `prebuiltStructuredContent` field by extension.
 */
export interface RenderScenario extends Omit<TestScenario, 'setup'> {
  setup: TestScenario['setup'] & { prebuiltStructuredContent?: unknown };
}
