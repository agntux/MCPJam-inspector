# AgntUX Directory

This directory contains all AgntUX-specific code that extends MCPJam Inspector for self-hosted deployment and visual testing. Keeping fork-specific code here minimizes conflicts during upstream syncs.

## Directory Structure

```
agntux/
  config.ts                  # AgntUX configuration (mode, allowed hosts, timeouts)
  vitest.config.ts           # Vitest config for AgntUX-specific tests
  api/
    handlers.ts              # API request handlers for AgntUX endpoints
    index.ts                 # API route registration
  components/
    AgntUXWrapper.tsx         # React wrapper for AgntUX-specific UI behavior
    LockedNavigation.tsx      # Navigation restrictions for embedded mode
    index.ts                  # Component exports
  middleware/
    hostValidation.ts         # Validates MCP server URLs against allowed hosts
  playwright/
    testRunner.ts             # Playwright E2E test runner for visual testing
  __tests__/
    handlers.test.ts          # Unit tests for API handlers
    hostValidation.test.ts    # Unit tests for host validation middleware
```

## Self-Hosted Mode

When `AGNTUX_MODE=true`, the inspector runs without Convex/WorkOS dependencies:

- **No authentication required**: WorkOS login is bypassed via a dummy auth provider
- **No Convex backend**: A `NoOpWebSocket` prevents reconnection loops
- **MCPJam free-tier models hidden**: Only BYOK (Bring Your Own Key) models are shown
- **Server-side API keys**: Provider keys are configured on the server via environment variables

### How It Works

1. **Server** (`server/index.ts`): Starts without `CONVEX_HTTP_URL`, logs a warning, registers `/api/config/server-providers`
2. **Config endpoint** (`server/routes/config.ts`): Returns which providers have server-side keys (names only, never keys)
3. **Client** (`client/src/main.tsx`): Detects missing `VITE_CONVEX_URL`, creates dummy Convex client with `NoOpWebSocket`
4. **Chat hook** (`client/src/hooks/use-chat-session.ts`): Fetches server providers, skips WorkOS auth
5. **Model helpers** (`client/src/components/chat-v2/shared/model-helpers.ts`): Shows models where either client or server has a key
6. **Chat API** (`server/routes/mcp/chat-v2.ts`): Falls back to server-side key if client doesn't send one

## Visual Testing (Playwright)

The Playwright test runner (`playwright/testRunner.ts`) executes E2E test scenarios against the inspector:

### Test Scenario Structure

```typescript
interface TestScenario {
  name: string;                    // Test name
  setup: { toolName: string; args?: Record<string, unknown> };  // MCP tool to trigger
  interactions?: TestInteraction[];  // User interactions (click, type, hover, wait)
  assertions: TestAssertion[];      // Assertions (elementExists, textContains, etc.)
  screenshot?: boolean | { before?: boolean; after?: boolean };
}
```

### Supported Assertions

| Type | Description |
|------|-------------|
| `elementExists` | CSS selector matches an element |
| `textContains` | Element text includes expected string |
| `elementVisible` | Element is visible in viewport |
| `elementHidden` | Element is hidden or doesn't exist |
| `attributeEquals` | Element attribute matches expected value |

### Supported Interactions

| Type | Description |
|------|-------------|
| `click` | Click an element |
| `type` | Type text into an input |
| `hover` | Hover over an element |
| `waitFor` | Wait for element to become visible |
| `waitForHidden` | Wait for element to disappear |

### Test Results

Each scenario returns:
- Pass/fail status and individual assertion results
- Screenshots (before/after if requested)
- Console errors captured during the test
- MCP tool calls and postMessage events
- Widget state at the end of the test
- Load time in milliseconds

## Host Validation

When `AGNTUX_MODE=true`, the host validation middleware (`middleware/hostValidation.ts`) restricts MCP server connections to allowed hosts:

- `app.agntux.ai`
- `agntux.app`
- `localhost`

Subdomains of allowed hosts are also permitted.

## Configuration

`config.ts` exports the `agntuxConfig` object:

```typescript
{
  enabled: boolean;           // AGNTUX_MODE === 'true'
  allowedHosts: string[];     // Hosts permitted for MCP connections
  testTimeout: number;        // Playwright test timeout (default: 60000ms)
}
```

## Running Tests

```bash
# Unit tests
npx vitest run --config agntux/vitest.config.ts

# Watch mode
npx vitest --config agntux/vitest.config.ts
```

See [TESTING.md](TESTING.md) for the full testing guide.
