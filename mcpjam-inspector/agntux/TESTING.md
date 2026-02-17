# AgntUX Testing Guide

## Unit Tests

Run AgntUX-specific unit tests:

```bash
cd mcpjam-inspector
npx vitest run --config agntux/vitest.config.ts
```

Watch mode:

```bash
npx vitest --config agntux/vitest.config.ts
```

### Test Files

| File | Covers |
|------|--------|
| `agntux/__tests__/handlers.test.ts` | API handler request/response logic |
| `agntux/__tests__/hostValidation.test.ts` | Host validation middleware (allowed/blocked hosts) |

## Manual Testing Checklist

### Self-Hosted Mode Verification

Run the app without Convex/WorkOS environment variables:

```bash
cd mcpjam-inspector
AGNTUX_MODE=true npm run dev
```

- [ ] App loads at `http://localhost:5173` without errors
- [ ] No WebSocket reconnection errors in browser console
- [ ] No WorkOS authentication prompts appear
- [ ] MCPJam free-tier models (e.g., "anthropic/claude-haiku-4.5") are **not** shown in model selector
- [ ] Console shows `[AgntUX] Self-hosted mode: using NoOpWebSocket for Convex client`

### Server-Side API Key Verification

Set provider keys and verify they're detected:

```bash
AGNTUX_MODE=true ANTHROPIC_API_KEY=test-key OPENAI_API_KEY=test-key npm run dev
```

- [ ] `GET /api/config/server-providers` returns `{"providers":["anthropic","openai"]}`
- [ ] Anthropic and OpenAI models appear in the model selector without client-side keys
- [ ] Chat works using server-side keys (send a message, get a response)
- [ ] API keys are **never** exposed in network responses (check browser DevTools Network tab)

### Provider Config Endpoint

```bash
# Should return only providers with configured server-side keys
curl http://localhost:6274/api/config/server-providers

# Should not require authentication (in unprotected routes list)
# No X-MCP-Session-Auth header needed
```

- [ ] Returns `{"providers":[...]}` with correct provider list
- [ ] Works without session token
- [ ] Returns empty `{"providers":[]}` when no keys are set
- [ ] Never returns actual API key values

### Docker Build and Run

```bash
# Build
docker build -f Dockerfile.agntux -t mcpjam-agntux:test .

# Run with test keys
docker run -d -p 6274:6274 \
  -e ANTHROPIC_API_KEY=sk-ant-test \
  mcpjam-agntux:test

# Verify
curl http://localhost:6274/health
curl http://localhost:6274/api/config/server-providers
```

- [ ] Docker build completes without errors
- [ ] Container starts and health check passes
- [ ] App is accessible at `http://localhost:6274`
- [ ] Static assets (JS, CSS) load correctly
- [ ] Session token is injected into the HTML page

### Visual Testing (Playwright)

Playwright tests run inside the Docker container (which has browsers pre-installed):

```bash
docker run --rm mcpjam-agntux:test \
  npx playwright test --config=agntux/playwright.config.ts
```

Or locally if Playwright browsers are installed:

```bash
cd mcpjam-inspector
npx playwright install chromium
npx vitest run --config agntux/vitest.config.ts
```

- [ ] Tests complete without browser launch errors
- [ ] Screenshots are captured for visual scenarios
- [ ] No unhandled promise rejections in test output

### Host Validation

When `AGNTUX_MODE=true`, MCP server connections are restricted:

- [ ] Connections to `localhost` are allowed
- [ ] Connections to `app.agntux.ai` are allowed
- [ ] Connections to `agntux.app` are allowed
- [ ] Connections to subdomains (e.g., `test.agntux.app`) are allowed
- [ ] Connections to other hosts are blocked with 403

## Upstream Compatibility Checks

After syncing with upstream (see [UPSTREAM-SYNC.md](../UPSTREAM-SYNC.md)):

- [ ] Build succeeds: `npm run build`
- [ ] All upstream features still work when `VITE_CONVEX_URL` is set
- [ ] MCPJam free-tier models appear when Convex is configured
- [ ] WorkOS authentication works when configured
- [ ] Self-hosted mode still works without Convex/WorkOS
- [ ] No regressions in model selection (both client-side and server-side keys)

## CI/CD Testing

Recommended CI pipeline:

```yaml
steps:
  - name: Install dependencies
    run: |
      cd sdk && npm ci --legacy-peer-deps && npm run build
      cd ../mcpjam-inspector && npm ci --legacy-peer-deps

  - name: Build
    run: cd mcpjam-inspector && npm run build

  - name: Unit tests
    run: cd mcpjam-inspector && npx vitest run --config agntux/vitest.config.ts

  - name: Docker build
    run: docker build -f Dockerfile.agntux -t test .
```
