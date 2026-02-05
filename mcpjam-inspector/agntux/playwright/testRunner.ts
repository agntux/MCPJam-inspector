/**
 * Playwright Test Runner for Visual E2E Testing
 *
 * Executes test scenarios using Playwright against MCPJam Inspector
 * to verify Agentic Apps render and behave correctly.
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { agntuxConfig } from '../config.js';

/**
 * Test assertion types
 */
export interface TestAssertion {
  type: 'elementExists' | 'textContains' | 'elementHidden' | 'elementVisible' | 'attributeEquals';
  selector: string;
  text?: string;
  attribute?: string;
  value?: string;
}

/**
 * User interaction types
 */
export interface TestInteraction {
  type: 'click' | 'type' | 'waitFor' | 'waitForHidden' | 'hover';
  selector: string;
  text?: string;
  timeout?: number;
}

/**
 * Setup configuration for triggering MCP tool
 */
export interface TestSetup {
  toolName: string;
  args?: Record<string, unknown>;
}

/**
 * Screenshot options
 */
export type ScreenshotOptions = boolean | { before?: boolean; after?: boolean };

/**
 * Test scenario definition
 */
export interface TestScenario {
  name: string;
  setup: TestSetup;
  interactions?: TestInteraction[];
  assertions: TestAssertion[];
  screenshot?: ScreenshotOptions;
}

/**
 * Single scenario result
 */
export interface ScenarioResult {
  name: string;
  passed: boolean;
  error?: string;
  screenshots: Array<{ name: string; base64: string }>;
  consoleErrors: Array<{ message: string; stack?: string }>;
  mcpCalls: Array<{
    method: string;
    toolName?: string;
    args?: Record<string, unknown>;
    response?: Record<string, unknown>;
    timestamp: number;
  }>;
  postMessages: Array<{ type: string; payload: Record<string, unknown> }>;
  widgetState: Record<string, unknown>;
  assertions: Array<{ name: string; passed: boolean; expected?: string; actual?: string }>;
  loadTimeMs: number;
}

/**
 * Full test results
 */
export interface TestResults {
  success: boolean;
  scenarios: ScenarioResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

/**
 * Run a single test scenario
 */
async function runScenario(
  page: Page,
  scenario: TestScenario,
  mcpServerUrl: string,
): Promise<ScenarioResult> {
  const startTime = Date.now();
  const result: ScenarioResult = {
    name: scenario.name,
    passed: true,
    screenshots: [],
    consoleErrors: [],
    mcpCalls: [],
    postMessages: [],
    widgetState: {},
    assertions: [],
    loadTimeMs: 0,
  };

  // Capture console errors - use named handlers for proper cleanup
  const pageErrorHandler = (error: Error): void => {
    result.consoleErrors.push({
      message: error.message,
      stack: error.stack,
    });
  };

  const consoleHandler = (msg: { type: () => string; text: () => string }): void => {
    if (msg.type() === 'error') {
      result.consoleErrors.push({ message: msg.text() });
    }
  };

  page.on('pageerror', pageErrorHandler);
  page.on('console', consoleHandler);

  try {
    // Navigate to MCPJam Inspector with the MCP server
    const inspectorUrl = `http://localhost:6274?mcpServer=${encodeURIComponent(mcpServerUrl)}`;
    await page.goto(inspectorUrl, { waitUntil: 'networkidle' });

    // Wait for the app to be ready
    await page.waitForSelector('[data-testid="mcp-connected"]', {
      timeout: agntuxConfig.testTimeout
    }).catch(() => {
      // Fall back to waiting for any content
      return page.waitForSelector('body', { timeout: agntuxConfig.testTimeout });
    });

    // Capture screenshot before interactions if requested
    const shouldScreenshotBefore =
      scenario.screenshot === true ||
      (typeof scenario.screenshot === 'object' && scenario.screenshot.before);

    if (shouldScreenshotBefore) {
      const screenshot = await page.screenshot({ type: 'png' });
      result.screenshots.push({
        name: `${scenario.name.replace(/\s+/g, '-').toLowerCase()}-before.png`,
        base64: screenshot.toString('base64'),
      });
    }

    // Execute the setup - trigger MCP tool call
    await page.evaluate(
      async ({ toolName, args }) => {
        // This would trigger the MCP tool call through the inspector's UI
        // The exact implementation depends on how MCPJam exposes tool calling
        const event = new CustomEvent('mcp-tool-call', {
          detail: { toolName, args },
        });
        window.dispatchEvent(event);
      },
      { toolName: scenario.setup.toolName, args: scenario.setup.args || {} }
    );

    // Wait for component to render (allow time for MCP tool response and UI update)
    const componentRenderWaitMs = 1000;
    await page.waitForTimeout(componentRenderWaitMs);

    // Execute interactions
    if (scenario.interactions) {
      for (const interaction of scenario.interactions) {
        const timeout = interaction.timeout || agntuxConfig.testTimeout;

        switch (interaction.type) {
          case 'click':
            await page.click(interaction.selector, { timeout });
            break;
          case 'type':
            if (interaction.text) {
              await page.fill(interaction.selector, interaction.text);
            }
            break;
          case 'waitFor':
            await page.waitForSelector(interaction.selector, {
              state: 'visible',
              timeout
            });
            break;
          case 'waitForHidden':
            await page.waitForSelector(interaction.selector, {
              state: 'hidden',
              timeout
            });
            break;
          case 'hover':
            await page.hover(interaction.selector, { timeout });
            break;
        }
      }
    }

    // Run assertions
    for (const assertion of scenario.assertions) {
      const assertionResult = {
        name: `${assertion.type}: ${assertion.selector}`,
        passed: false,
        expected: '',
        actual: '',
      };

      try {
        switch (assertion.type) {
          case 'elementExists': {
            const element = await page.$(assertion.selector);
            assertionResult.passed = element !== null;
            assertionResult.expected = 'element exists';
            assertionResult.actual = element ? 'found' : 'not found';
            break;
          }
          case 'textContains': {
            const element = await page.$(assertion.selector);
            if (element) {
              const text = await element.textContent();
              assertionResult.passed = text?.includes(assertion.text || '') || false;
              assertionResult.expected = `contains "${assertion.text}"`;
              assertionResult.actual = text || '';
            }
            break;
          }
          case 'elementVisible': {
            const element = await page.$(assertion.selector);
            if (element) {
              assertionResult.passed = await element.isVisible();
              assertionResult.expected = 'visible';
              assertionResult.actual = assertionResult.passed ? 'visible' : 'hidden';
            }
            break;
          }
          case 'elementHidden': {
            const element = await page.$(assertion.selector);
            assertionResult.passed = element === null || !(await element.isVisible());
            assertionResult.expected = 'hidden';
            assertionResult.actual = assertionResult.passed ? 'hidden' : 'visible';
            break;
          }
          case 'attributeEquals': {
            const element = await page.$(assertion.selector);
            if (element && assertion.attribute) {
              const value = await element.getAttribute(assertion.attribute);
              assertionResult.passed = value === assertion.value;
              assertionResult.expected = assertion.value || '';
              assertionResult.actual = value || '';
            }
            break;
          }
        }
      } catch (error) {
        assertionResult.passed = false;
        assertionResult.actual = error instanceof Error ? error.message : 'Error';
      }

      result.assertions.push(assertionResult);
      if (!assertionResult.passed) {
        result.passed = false;
      }
    }

    // Capture widget state
    result.widgetState = await page.evaluate(() => {
      return (window as unknown as { __WIDGET_STATE__?: Record<string, unknown> }).__WIDGET_STATE__ || {};
    });

    // Capture screenshot after if requested
    const shouldScreenshotAfter =
      scenario.screenshot === true ||
      (typeof scenario.screenshot === 'object' && scenario.screenshot.after);

    if (shouldScreenshotAfter) {
      const screenshot = await page.screenshot({ type: 'png' });
      result.screenshots.push({
        name: `${scenario.name.replace(/\s+/g, '-').toLowerCase()}-after.png`,
        base64: screenshot.toString('base64'),
      });
    }

  } catch (error) {
    result.passed = false;
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    // Clean up event listeners to prevent memory leaks
    page.off('pageerror', pageErrorHandler);
    page.off('console', consoleHandler);
  }

  result.loadTimeMs = Date.now() - startTime;
  return result;
}

/**
 * Run all test scenarios
 */
export async function runPlaywrightTests(
  mcpServerUrl: string,
  scenarios: TestScenario[],
): Promise<TestResults> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      const page = await context.newPage();
      try {
        const result = await runScenario(page, scenario, mcpServerUrl);
        results.push(result);
      } finally {
        await page.close();
      }
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return {
      success: failed === 0,
      scenarios: results,
      summary: {
        total: results.length,
        passed,
        failed,
      },
    };
  } finally {
    // Explicit cleanup: close context first, then browser
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
    }
  }
}

export default runPlaywrightTests;
