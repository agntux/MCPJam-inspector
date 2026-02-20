# CLAUDE.md — MCPJam Inspector (AgntUX Fork)

## Project Overview

Fork of [MCPJam/inspector](https://github.com/MCPJam/inspector) adapted for AgntUX self-hosted deployment and visual testing. AgntUX is "The AI Workflow Architect" — a no-code agent builder. This inspector is the primary tool for testing Agent Skills and MCP Apps in the AgntUX ecosystem.

Key AgntUX additions over upstream:
- Self-hosted mode (no Convex/WorkOS required) via `AGNTUX_MODE=true`
- Server-side API key management (provider keys never sent to browser)
- Playwright-based visual testing for MCP App widgets
- Fly.io deployment infrastructure with Docker

## Ecosystem Context

This repo is one of three in the AgntUX platform:

- **`agntux/app`** — Next.js platform (auth, billing, teams, MCP server hosting at `/:id/mcp`)
- **`agntux/langgraph`** — AI engine that orchestrates specialized agents to build Agent Skills
- **`agntux/MCPJam-inspector`** (this repo) — testing tool for MCP servers and MCP Apps

### Key Terms

- **Agent Skill** — the packaged product users create — an MCP App bundled with a SKILL.md orchestration file
- **MCP App** — the runtime format an Agent Skill runs as
- **Relay Pattern** — the data flow architecture: the AI host fetches data via third-party connectors, passes it to the AgntUX MCP App for UI rendering, the user interacts with the UI, and the host writes results back. AgntUX never touches the user's third-party API keys.

## Package Manager

Use **npm** with `--legacy-peer-deps` throughout this repo.

### Install (two-step, order matters)

```bash
# Step 1: build the SDK first (mcpjam-inspector depends on it)
cd sdk && npm ci --legacy-peer-deps && npm run build

# Step 2: install the inspector
cd mcpjam-inspector && npm ci --legacy-peer-deps
```

## Build & Dev Commands

All commands run from `mcpjam-inspector/`:

```bash
# Development (self-hosted mode)
AGNTUX_MODE=true npm run dev

# Production build
npm run build

# AgntUX Docker build
npm run build:agntux        # builds + docker build -f Dockerfile.agntux

# Deploy to Fly.io
npm run deploy:agntux
```

## Testing

```bash
# Unit tests (vitest)
cd mcpjam-inspector
npx vitest run --config agntux/vitest.config.ts

# All unit tests
npm test

# Visual / E2E tests (Playwright in Docker)
docker build -f ../Dockerfile.agntux -t mcpjam-agntux-test ..
docker run --rm mcpjam-agntux-test

# Playwright directly (if installed)
npm run test:e2e
```

### Manual Testing Checklist

After any change touching upstream-modified files:

- [ ] `npm run build` succeeds in `mcpjam-inspector/`
- [ ] App starts with `AGNTUX_MODE=true` and no `CONVEX_HTTP_URL`
- [ ] `/api/config/server-providers` returns expected providers
- [ ] LLM chat works with server-side API keys (no client-side key needed)
- [ ] MCPJam free-tier models are hidden when Convex is not configured
- [ ] No WebSocket reconnection loop errors in console
- [ ] Docker build succeeds: `docker build -f Dockerfile.agntux -t test .`

## Branch Strategy

**CRITICAL — wrong branch = merge nightmare.**

| Branch | Purpose |
|--------|---------|
| `main` | Tracks upstream `MCPJam/inspector`. **DO NOT commit AgntUX changes here.** |
| `agntux-main` | Production branch with all AgntUX customizations |
| `agntux-*` | Feature branches — always branch from `agntux-main` |

### Workflow

```
upstream/main --> main --> agntux-main --> agntux-feature-*
  (fetch)       (merge)    (rebase)        (PR to agntux-main)
```

Never open a PR targeting `main`. All AgntUX work targets `agntux-main`.

## Commit Conventions

All fork-specific commits use the `agntux:` prefix:

```
agntux: add server-side API key fallback for BYOK support
agntux: fix NoOpWebSocket re-render loop in self-hosted mode
agntux(test): add Playwright visual test runner
agntux(infra): update Fly.io deployment config
```

Upstream-compatible changes (intended for contribution back) use standard conventional commits without the prefix.

## Architecture: Self-Hosted Mode

When `AGNTUX_MODE=true`:
- Convex backend is not required (`CONVEX_HTTP_URL` optional)
- WorkOS authentication is skipped
- A `NoOpWebSocket` stubs out the Convex client
- Server-side API keys (`serverKeyMap`) are used as fallback in chat routes
- MCPJam free-tier models are hidden from the model selector

### Key Modified Files

| File | AgntUX Change |
|------|---------------|
| `mcpjam-inspector/server/index.ts` | `CONVEX_HTTP_URL` optional, config routes, static file serving |
| `mcpjam-inspector/server/middleware/session-auth.ts` | `/api/config/server-providers` added to unprotected routes |
| `mcpjam-inspector/server/routes/mcp/chat-v2.ts` | Server-side API key fallback (`serverKeyMap`) |
| `mcpjam-inspector/client/src/main.tsx` | `NoOpWebSocket` for dummy Convex client |
| `mcpjam-inspector/client/src/hooks/use-chat-session.ts` | `hasConvex` checks, `serverProviders` state, skip WorkOS auth |
| `mcpjam-inspector/client/src/components/chat-v2/shared/model-helpers.ts` | `serverProviders` param, `hasConvex` filter |

### Added Files

| File | Purpose |
|------|---------|
| `Dockerfile.agntux` | Playwright-based Docker image for production + visual testing |
| `fly.toml` | Fly.io deployment configuration |
| `mcpjam-inspector/server/routes/config.ts` | `/api/config/server-providers` endpoint |
| `mcpjam-inspector/agntux/` | All AgntUX-specific code (config, components, middleware, tests, Playwright runner) |

## Environment Variables

### Required for Self-Hosted Mode

| Variable | Value |
|----------|-------|
| `AGNTUX_MODE` | `true` |
| `NODE_ENV` | `production` (deployed instances) |

### Optional — Provider API Keys (server-side)

| Variable | Provider |
|----------|----------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `OPENAI_API_KEY` | OpenAI |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `GOOGLE_API_KEY` | Google (Gemini) |
| `MISTRAL_API_KEY` | Mistral |
| `XAI_API_KEY` | xAI (Grok) |

### Not Required in Self-Hosted Mode

`CONVEX_HTTP_URL`, `VITE_CONVEX_URL`, `VITE_WORKOS_CLIENT_ID` — these are only needed for the upstream MCPJam SaaS deployment.

## Code Conventions

- Mark every fork-specific modification with `// AgntUX: <description>`
- Place all new AgntUX-only code under `mcpjam-inspector/agntux/`
- Minimize changes to upstream files — prefer adding files over modifying existing ones
- Search for all fork markers: `grep -r "AgntUX:" mcpjam-inspector/server/ mcpjam-inspector/client/src/`

## Upstream Sync

See [UPSTREAM-SYNC.md](UPSTREAM-SYNC.md) for the full sync procedure.

High-conflict files (check these first after any upstream merge):
1. `mcpjam-inspector/server/index.ts`
2. `mcpjam-inspector/server/middleware/session-auth.ts`
3. `mcpjam-inspector/server/routes/mcp/chat-v2.ts`
4. `mcpjam-inspector/client/src/main.tsx`
5. `mcpjam-inspector/client/src/hooks/use-chat-session.ts`
6. `mcpjam-inspector/client/src/components/chat-v2/shared/model-helpers.ts`
