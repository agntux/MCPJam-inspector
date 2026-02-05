# AgntUX Customizations for MCPJam Inspector

## Overview

This document describes the AgntUX visual testing customizations added to MCPJam Inspector. MCPJam Inspector is a fork of the upstream MCPJam project that adds Playwright-based visual testing capabilities specifically designed for testing AgntUX Agentic Apps.

AgntUX Agentic Apps are interactive UI components that run in dual-protocol environments (ChatGPT and MCP Apps hosts). This customization enables automated visual testing workflows to verify component behavior, rendering, and interactions across different scenarios before deployment.

### Key Additions

- **Playwright-based Visual Testing**: Automated UI interaction and screenshot capture
- **Scenario-Driven Testing**: Define test scenarios with setup, interactions, and assertions
- **RESTful API**: HTTP endpoints for triggering and monitoring tests
- **Security Validation**: MCP server host validation to prevent unauthorized access
- **Docker Support**: Pre-configured Docker image with Playwright dependencies
- **Fly.io Deployment**: Cloud-ready configuration for managed hosting

---

## New Files Added

### `agntux/config.ts`

Configuration module for AgntUX mode. Manages environment-based settings and feature flags.

**Exported:**
- `config` object: Contains all AgntUX configuration
  - `enabled`: Boolean flag for AgntUX mode (from `AGNTUX_MODE` env var)
  - `allowedHosts`: Comma-separated list of permitted MCP server hosts
  - `testTimeout`: Maximum duration for test execution (milliseconds)
  - `playwrightConfig`: Playwright browser launch options

**Example:**
```typescript
import { config } from './agntux/config.js';

if (config.enabled) {
  console.log(`AgntUX mode active. Allowed hosts: ${config.allowedHosts}`);
  console.log(`Test timeout: ${config.testTimeout}ms`);
}
```

### `agntux/api/index.ts`

Hono router that exports the AgntUX API. Integrates with the main application server.

**Exported:**
- `agntuxRouter`: Hono router instance with all AgntUX endpoints
  - Mounted at `/api/agntux`
  - Includes health check and test execution endpoints
  - Applies security middleware to all routes

**Integration Example:**
```typescript
import { agntuxRouter } from './agntux/api/index.js';

app.route('/api/agntux', agntuxRouter);
```

### `agntux/api/handlers.ts`

Request handlers for AgntUX API endpoints. Implements business logic for health checks and test execution.

**Exported Functions:**

#### `handleHealthCheck(c: Context): Promise<Response>`
Health check endpoint. Verifies AgntUX service availability and Playwright browser status.

Returns 200 on success:
```json
{
  "status": "ok",
  "playwrightReady": true,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### `handleTest(c: Context): Promise<Response>`
Executes visual tests defined in request payload. Validates MCP server URL and runs all scenarios.

Parameters (JSON body):
- `mcpServerUrl` (string, required): URL of the MCP server hosting the component
- `scenarios` (array, required): Array of test scenario objects
- `timeout` (number, optional): Override default test timeout (milliseconds)

Returns 200 on success with test results (see Test Response Format section).

Returns 400 if request validation fails:
```json
{
  "error": "Invalid request format",
  "details": "mcpServerUrl is required"
}
```

Returns 403 if MCP server host not in allowed list:
```json
{
  "error": "Host not authorized",
  "details": "mcp-server.example.com is not in allowed hosts"
}
```

### `agntux/middleware/hostValidation.ts`

Security middleware for validating MCP server URLs. Prevents testing against unauthorized servers.

**Exported:**

#### `validateMcpServerHost(mcpServerUrl: string): void`
Validates that the provided URL's hostname is in the allowed hosts list.

Throws `HostValidationError` if:
- URL parsing fails
- Hostname is not in allowed hosts list
- Hostname is localhost/127.0.0.1 (in production)

**Usage:**
```typescript
import { validateMcpServerHost } from './agntux/middleware/hostValidation.js';

try {
  validateMcpServerHost('https://mcp.example.com/');
} catch (error) {
  console.error('Host validation failed:', error.message);
}
```

### `agntux/playwright/testRunner.ts`

Playwright-based test execution engine. Handles browser control, scenario execution, and screenshot capture.

**Exported:**

#### `class TestRunner`
Main test execution class.

**Methods:**

##### `constructor(config: PlaywrightConfig)`
Initializes the test runner with Playwright configuration.

##### `async initialize(): Promise<void>`
Launches the Playwright browser and initializes context. Must be called before executing tests.

##### `async executeScenarios(mcpServerUrl: string, scenarios: TestScenario[]): Promise<ScenarioResult[]>`
Executes all provided scenarios against the MCP server URL.

**Parameters:**
- `mcpServerUrl`: Base URL of the MCP server
- `scenarios`: Array of scenario definitions

**Returns:** Array of scenario results with:
- `scenarioName`: Name of the scenario
- `passed`: Boolean indicating overall pass/fail
- `screenshots`: Object mapping screenshot names to base64 PNG data
- `assertions`: Array of assertion results
- `error` (optional): Error message if scenario failed

##### `async cleanup(): Promise<void>`
Closes the browser and cleans up resources. Call after all tests complete.

**Example:**
```typescript
const runner = new TestRunner({ headless: true });
await runner.initialize();

try {
  const results = await runner.executeScenarios(
    'https://mcp.example.com',
    scenarios
  );
  console.log(results);
} finally {
  await runner.cleanup();
}
```

---

## API Endpoints

All endpoints are prefixed with `/api/agntux`. Requires `AGNTUX_MODE=true` to be active.

### `GET /api/agntux/health`

Health check endpoint. Verifies AgntUX service availability.

**Response (200 OK):**
```json
{
  "status": "ok",
  "playwrightReady": true,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Usage:**
```bash
curl https://inspector.example.com/api/agntux/health
```

### `POST /api/agntux/test`

Execute visual tests against an MCP server. Runs all provided scenarios and returns screenshots and assertion results.

**Request Body:**
```json
{
  "mcpServerUrl": "https://mcp-server.example.com",
  "scenarios": [
    {
      "name": "scenario name",
      "description": "what to test",
      "setup": {
        "tool": "tool_name",
        "args": {}
      },
      "interactions": [
        { "type": "click", "selector": ".button" },
        { "type": "fill", "selector": "input", "value": "test" },
        { "type": "wait", "ms": 1000 }
      ],
      "assertions": [
        { "type": "visible", "selector": ".result" },
        { "type": "text", "selector": ".result", "value": "Success" }
      ],
      "screenshots": ["initial", "after-interaction"]
    }
  ],
  "timeout": 30000
}
```

**Request Parameters:**

- **mcpServerUrl** (string, required): HTTPS URL of the MCP server. Must be in `AGNTUX_ALLOWED_HOSTS` list.
- **scenarios** (array, required): Array of test scenario objects. See Test Scenario Format below.
- **timeout** (number, optional): Override default test timeout in milliseconds. Default: 30000ms.

**Test Scenario Format:**

Each scenario object defines one test case:

```typescript
{
  name: string;           // Unique scenario identifier
  description: string;    // Human-readable description
  setup?: {
    tool: string;         // MCP tool to initialize (optional)
    args: Record<string, any>; // Arguments for tool
  };
  interactions: Array<{
    type: "click" | "fill" | "wait" | "scroll" | "hover";
    selector?: string;    // CSS selector (for click, fill, hover)
    value?: string;       // Text value (for fill)
    ms?: number;          // Duration (for wait, scroll)
    x?: number;           // X offset (for scroll)
    y?: number;           // Y offset (for scroll)
  }>;
  assertions: Array<{
    type: "visible" | "text" | "attribute" | "value";
    selector: string;     // CSS selector to test
    value?: string;       // Expected text or attribute value
    attribute?: string;   // Attribute name (for attribute type)
  }>;
  screenshots: string[]; // Names of screenshots to capture (e.g., ["initial", "after-click"])
}
```

**Interaction Types:**
- `click`: Click on element at selector
- `fill`: Clear and fill input with text value
- `wait`: Wait for milliseconds
- `scroll`: Scroll page by x and y pixels
- `hover`: Hover over element

**Assertion Types:**
- `visible`: Assert element exists and is visible
- `text`: Assert element contains exact text
- `attribute`: Assert element attribute equals value
- `value`: Assert input/textarea value equals text

**Response (200 OK):**
```json
{
  "success": true,
  "results": [
    {
      "scenarioName": "scenario name",
      "passed": true,
      "screenshots": {
        "initial": "iVBORw0KGgoAAAANSUhEUgAAA...",
        "after-interaction": "iVBORw0KGgoAAAANSUhEUgAAA..."
      },
      "assertions": [
        {
          "assertion": {
            "type": "visible",
            "selector": ".result"
          },
          "passed": true
        },
        {
          "assertion": {
            "type": "text",
            "selector": ".result",
            "value": "Success"
          },
          "passed": true
        }
      ]
    }
  ],
  "duration": 5432
}
```

**Response Fields:**

- **success** (boolean): Overall test success status. True if all scenarios passed.
- **results** (array): Array of scenario result objects
  - **scenarioName** (string): Name of the scenario
  - **passed** (boolean): Whether all assertions passed
  - **screenshots** (object): Map of screenshot names to base64 PNG data
  - **assertions** (array): Array of assertion results
    - **assertion** (object): The original assertion definition
    - **passed** (boolean): Whether assertion passed
  - **error** (string, optional): Error message if scenario failed
- **duration** (number): Total test execution time in milliseconds

**Error Responses:**

400 - Invalid Request:
```json
{
  "error": "Invalid request format",
  "details": "mcpServerUrl is required"
}
```

403 - Host Not Authorized:
```json
{
  "error": "Host not authorized",
  "details": "unauthorized.example.com is not in allowed hosts list"
}
```

500 - Test Execution Failed:
```json
{
  "error": "Test execution failed",
  "details": "Browser timeout after 30000ms"
}
```

**Example Usage:**

```bash
curl -X POST https://inspector.example.com/api/agntux/test \
  -H "Content-Type: application/json" \
  -d '{
    "mcpServerUrl": "https://mcp.example.com",
    "scenarios": [
      {
        "name": "Button Click Test",
        "description": "Verify button click triggers action",
        "interactions": [
          { "type": "click", "selector": ".action-button" }
        ],
        "assertions": [
          { "type": "visible", "selector": ".result" }
        ],
        "screenshots": ["initial", "after-click"]
      }
    ]
  }'
```

---

## Test Request & Response Formats

### Request Schema

The test request follows a well-defined JSON schema for consistency and validation.

```typescript
interface TestRequest {
  mcpServerUrl: string;
  scenarios: TestScenario[];
  timeout?: number;
}

interface TestScenario {
  name: string;
  description: string;
  setup?: {
    tool: string;
    args: Record<string, any>;
  };
  interactions: Interaction[];
  assertions: Assertion[];
  screenshots: string[];
}

type Interaction =
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'wait'; ms: number }
  | { type: 'scroll'; x: number; y: number }
  | { type: 'hover'; selector: string };

type Assertion =
  | { type: 'visible'; selector: string }
  | { type: 'text'; selector: string; value: string }
  | { type: 'attribute'; selector: string; attribute: string; value: string }
  | { type: 'value'; selector: string; value: string };
```

### Response Schema

The test response contains results, screenshots, and detailed assertion outcomes.

```typescript
interface TestResponse {
  success: boolean;
  results: ScenarioResult[];
  duration: number;
  error?: string;
}

interface ScenarioResult {
  scenarioName: string;
  passed: boolean;
  screenshots: Record<string, string>; // name -> base64 PNG
  assertions: AssertionResult[];
  error?: string;
}

interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  error?: string;
}
```

---

## Deployment

### Docker Deployment

The provided `Dockerfile.agntux` contains all dependencies for visual testing with Playwright.

**Build Image:**
```bash
docker build -f Dockerfile.agntux -t mcpjam-inspector-agntux:latest .
```

**Dockerfile Features:**
- Node.js runtime environment
- Playwright browser engines (Chromium, Firefox, WebKit)
- System dependencies for headless browser operation
- Optimized layer caching for faster rebuilds

**Run Container:**
```bash
docker run \
  -e AGNTUX_MODE=true \
  -e AGNTUX_ALLOWED_HOSTS="mcp1.example.com,mcp2.example.com" \
  -e AGNTUX_TEST_TIMEOUT=30000 \
  -p 3000:3000 \
  mcpjam-inspector-agntux:latest
```

### Fly.io Deployment

Deploy to Fly.io using the included `fly.toml` configuration.

**Prerequisites:**
- Fly.io account with CLI installed (`fly auth login`)
- Docker image built locally or via remote builder

**Deploy:**
```bash
fly deploy --dockerfile Dockerfile.agntux
```

**Fly.io Configuration (fly.toml):**
```toml
app = "mcpjam-inspector"
primary_region = "ord"

[build]
dockerfile = "Dockerfile.agntux"

[env]
AGNTUX_MODE = "true"
AGNTUX_ALLOWED_HOSTS = "mcp.example.com"
AGNTUX_TEST_TIMEOUT = "30000"

[[services]]
internal_port = 3000
processes = ["app"]

[services.http_checks]
```

**Set Secrets for Sensitive Values:**
```bash
fly secrets set AGNTUX_ALLOWED_HOSTS="mcp1.example.com,mcp2.example.com"
```

**Monitor Deployment:**
```bash
fly logs --follow
```

**Update Deployed App:**
```bash
fly deploy --dockerfile Dockerfile.agntux
```

---

## Environment Variables

AgntUX mode is configured via environment variables. All variables are optional unless noted.

### Required

None. AgntUX customizations are optional and enabled via `AGNTUX_MODE`.

### Optional

#### `AGNTUX_MODE`
Enables AgntUX visual testing features.

- **Type:** Boolean string (`"true"` or `"false"`)
- **Default:** `"false"`
- **Effect:** Disables all AgntUX endpoints if false

Example:
```bash
AGNTUX_MODE=true
```

#### `AGNTUX_ALLOWED_HOSTS`
Comma-separated list of hostnames permitted for MCP server connections.

- **Type:** Comma-separated string
- **Default:** Empty (no hosts allowed)
- **Effect:** Host validation middleware rejects any request with a host not in this list
- **Security:** Always restrict to explicitly trusted hosts

Example:
```bash
AGNTUX_ALLOWED_HOSTS="mcp1.example.com,mcp2.example.com,staging-mcp.internal"
```

#### `AGNTUX_TEST_TIMEOUT`
Maximum time in milliseconds for a single test to execute.

- **Type:** Integer
- **Default:** `30000` (30 seconds)
- **Effect:** Tests exceeding this timeout are aborted with timeout error
- **Range:** 1000-300000 (1 second to 5 minutes)

Example:
```bash
AGNTUX_TEST_TIMEOUT=60000
```

#### `PLAYWRIGHT_HEADLESS`
Run Playwright in headless mode (no visible browser window).

- **Type:** Boolean string (`"true"` or `"false"`)
- **Default:** `"true"` (recommended for production)
- **Effect:** Set to `"false"` during local debugging to see browser interactions

Example:
```bash
PLAYWRIGHT_HEADLESS=false
```

#### `PLAYWRIGHT_SLOW_MO`
Slow down Playwright operations by specified milliseconds (useful for debugging).

- **Type:** Integer (milliseconds)
- **Default:** `0` (no slowdown)
- **Effect:** Each Playwright action waits this many ms before executing

Example:
```bash
PLAYWRIGHT_SLOW_MO=1000
```

### Configuration in Code

All AgntUX configuration is centralized in `agntux/config.ts`:

```typescript
export const config = {
  enabled: process.env.AGNTUX_MODE === 'true',
  allowedHosts: (process.env.AGNTUX_ALLOWED_HOSTS || '').split(',').filter(Boolean),
  testTimeout: parseInt(process.env.AGNTUX_TEST_TIMEOUT || '30000', 10),
  playwrightConfig: {
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    slowMo: parseInt(process.env.PLAYWRIGHT_SLOW_MO || '0', 10),
  },
};
```

### Setting Environment Variables

**In `.env` file:**
```
AGNTUX_MODE=true
AGNTUX_ALLOWED_HOSTS=mcp.example.com,staging-mcp.example.com
AGNTUX_TEST_TIMEOUT=45000
```

**In Docker:**
```bash
docker run \
  -e AGNTUX_MODE=true \
  -e AGNTUX_ALLOWED_HOSTS="mcp.example.com" \
  mcpjam-inspector-agntux:latest
```

**In Fly.io:**
```bash
fly secrets set AGNTUX_MODE=true
fly config --auto-save
```

---

## Security Considerations

### Host Validation

The host validation middleware prevents testing against unauthorized MCP servers:

1. **URL Parsing**: Validates URL format and extracts hostname
2. **Whitelist Check**: Compares hostname against `AGNTUX_ALLOWED_HOSTS`
3. **Localhost Protection**: Rejects localhost/127.0.0.1 in production (unless explicitly listed)

**Best Practices:**
- Always define `AGNTUX_ALLOWED_HOSTS` in production
- Use HTTPS only (non-HTTPS URLs are rejected in production)
- Regularly audit and update the allowed hosts list
- Never use wildcard patterns; list specific hostnames only

### Browser Isolation

Playwright runs in sandboxed browser contexts:

- Each test scenario runs in an isolated context
- Cookies and local storage are cleared between scenarios
- No shared state persists across test runs
- Browser process is killed after tests complete

### Screenshot Data

Screenshots are base64-encoded in responses:

- Large screenshots (5+ screenshots) can increase response size
- Store screenshots securely if saving test results
- Consider implementing cleanup for old test data
- Be cautious sharing screenshots containing sensitive UI data

---

## Common Use Cases

### Testing Component Loading

```json
{
  "mcpServerUrl": "https://mcp.example.com",
  "scenarios": [
    {
      "name": "Component Loads",
      "description": "Verify component loads without errors",
      "interactions": [],
      "assertions": [
        { "type": "visible", "selector": "[data-testid='component-root']" }
      ],
      "screenshots": ["loaded"]
    }
  ]
}
```

### Testing Form Submission

```json
{
  "mcpServerUrl": "https://mcp.example.com",
  "scenarios": [
    {
      "name": "Form Submission",
      "description": "Submit form and verify success message",
      "interactions": [
        { "type": "fill", "selector": "[name='email']", "value": "test@example.com" },
        { "type": "fill", "selector": "[name='message']", "value": "Test message" },
        { "type": "click", "selector": "[type='submit']" },
        { "type": "wait", "ms": 2000 }
      ],
      "assertions": [
        { "type": "visible", "selector": "[data-testid='success-message']" },
        { "type": "text", "selector": "[data-testid='success-message']", "value": "Message sent" }
      ],
      "screenshots": ["initial", "after-submit"]
    }
  ]
}
```

### Testing Dynamic Content

```json
{
  "mcpServerUrl": "https://mcp.example.com",
  "scenarios": [
    {
      "name": "Dynamic Content Load",
      "description": "Verify data loads after user action",
      "interactions": [
        { "type": "click", "selector": ".load-data-button" },
        { "type": "wait", "ms": 3000 }
      ],
      "assertions": [
        { "type": "visible", "selector": ".data-table" },
        { "type": "text", "selector": ".data-count", "value": "5 items" }
      ],
      "screenshots": ["before-load", "after-load"]
    }
  ]
}
```

### Testing Responsive Design

```json
{
  "mcpServerUrl": "https://mcp.example.com",
  "scenarios": [
    {
      "name": "Mobile Responsive Layout",
      "description": "Verify layout adapts to mobile viewport",
      "interactions": [
        { "type": "wait", "ms": 1000 }
      ],
      "assertions": [
        { "type": "visible", "selector": ".mobile-menu" },
        { "type": "attribute", "selector": ".sidebar", "attribute": "hidden", "value": "true" }
      ],
      "screenshots": ["mobile-layout"]
    }
  ]
}
```

---

## Troubleshooting

### Common Issues

**Issue: "Host not authorized" error**

Solution: Verify the MCP server hostname is in `AGNTUX_ALLOWED_HOSTS`:
```bash
# Check current config
env | grep AGNTUX

# Update allowed hosts
export AGNTUX_ALLOWED_HOSTS="mcp.example.com,other-mcp.example.com"
```

**Issue: Tests timeout**

Solution: Increase `AGNTUX_TEST_TIMEOUT` or optimize interactions:
```bash
export AGNTUX_TEST_TIMEOUT=60000  # 60 seconds

# In request, use longer waits for slow components
{ "type": "wait", "ms": 5000 }
```

**Issue: Screenshots are blank or incorrect**

Solution:
1. Check that selectors exist on the page
2. Add wait interactions before screenshots
3. Verify component is rendered and visible
4. Enable `PLAYWRIGHT_HEADLESS=false` to debug locally

**Issue: Playwright browser fails to launch**

Solution:
1. Ensure Docker image includes Playwright: `npx playwright install`
2. Verify system dependencies: `apt-get install -y chromium-browser`
3. Check available disk space for browser cache

### Debug Mode

Enable detailed logging:

```bash
export PLAYWRIGHT_HEADLESS=false
export PLAYWRIGHT_SLOW_MO=1000
export DEBUG=pw:api
```

This will:
- Show browser window during test execution
- Slow down interactions (1 second per action)
- Log Playwright API calls

### Checking Logs

**Docker:**
```bash
docker logs <container-id> --follow
```

**Fly.io:**
```bash
fly logs --follow
```

**Local:**
Check stdout/stderr or pipe to a log file:
```bash
npm start > app.log 2>&1
```

---

## Integration with AgntUX Agentic Apps

This customization enables automated visual testing as part of the AgntUX component deployment pipeline.

### Testing Workflow

1. **Component Generated**: Coder agent generates new component code
2. **Test Request**: AgntUX sends test request with visual test scenarios
3. **Scenario Execution**: TestRunner executes all scenarios in parallel contexts
4. **Results Validation**: Test results checked against expectations
5. **Screenshots Captured**: Visual regression detection via screenshot comparison
6. **Deployment Decision**: Component deployed only if all tests pass

### Integration Points

- **Component Template**: New components include sample test scenarios
- **Build Pipeline**: Integration tests verify visual behavior before deployment
- **Approval Gates**: Test results shown to users before final deployment

---

## References

- [Playwright Documentation](https://playwright.dev/)
- [Playwright API Reference](https://playwright.dev/docs/api/class-playwright)
- [MCPJam Inspector](https://github.com/mcpjam/inspector)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
