# AgntUX Fork of MCPJam Inspector

This repository is a maintained fork of [MCPJam/inspector](https://github.com/MCPJam/inspector) adapted for AgntUX's self-hosted deployment and visual testing needs.

## Why We Maintain a Fork

MCPJam Inspector is designed as a SaaS product with Convex backend and WorkOS authentication. AgntUX needs:

1. **Self-hosted mode**: Run without Convex/WorkOS dependencies (`AGNTUX_MODE=true`)
2. **Server-side API keys**: Keep LLM provider keys on the server, not in the browser
3. **Visual testing**: Playwright-based E2E testing for Agentic App widgets
4. **Custom deployment**: Fly.io infrastructure with Docker (Playwright base image)

These changes are too opinionated for upstream contribution, so we maintain a fork that tracks upstream releases.

## Key Differences from Upstream

### Modified Files

| File | Change |
|------|--------|
| `mcpjam-inspector/server/index.ts` | CONVEX_HTTP_URL optional, config routes, static file serving |
| `mcpjam-inspector/server/middleware/session-auth.ts` | `/api/config/server-providers` added to unprotected routes |
| `mcpjam-inspector/server/routes/mcp/chat-v2.ts` | Server-side API key fallback (`serverKeyMap`) |
| `mcpjam-inspector/client/src/main.tsx` | `NoOpWebSocket` for dummy Convex client in self-hosted mode |
| `mcpjam-inspector/client/src/hooks/use-chat-session.ts` | `hasConvex` checks, `serverProviders` state, skip WorkOS auth |
| `mcpjam-inspector/client/src/components/chat-v2/shared/model-helpers.ts` | `serverProviders` param, `hasConvex` filter for MCPJam models |

### Added Files

| File | Purpose |
|------|---------|
| `Dockerfile.agntux` | Playwright-based Docker image for production + visual testing |
| `fly.toml` | Fly.io deployment configuration |
| `mcpjam-inspector/server/routes/config.ts` | `/api/config/server-providers` endpoint |
| `mcpjam-inspector/agntux/` | AgntUX-specific code (config, components, middleware, tests, Playwright runner) |

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Tracks upstream `MCPJam/inspector` main branch |
| `agntux-main` | Production branch with all AgntUX customizations |
| `agntux-*` | Feature branches for new AgntUX work (branch from `agntux-main`) |

### Workflow

```
upstream/main  -->  main  -->  agntux-main  -->  agntux-feature-*
  (fetch)        (merge)       (rebase)          (PR target: agntux-main)
```

1. `main` is kept in sync with upstream via `git fetch upstream && git merge upstream/main`
2. `agntux-main` is rebased or merged from `main` after upstream syncs
3. Feature branches are created from `agntux-main` and PR'd back to `agntux-main`

## Commit Conventions

All fork-specific commits use the `agntux:` prefix to make them easy to identify during upstream syncs:

```
agntux: add server-side API key fallback for BYOK support
agntux: fix NoOpWebSocket re-render loop in self-hosted mode
agntux(test): add Playwright visual test runner
agntux(infra): update Fly.io deployment config
```

Upstream-compatible changes (bug fixes, improvements we intend to contribute) use standard conventional commits without the prefix.

## Update Workflow

See [UPSTREAM-SYNC.md](UPSTREAM-SYNC.md) for the detailed sync procedure.

## Environment Variables

### Required for Self-Hosted Mode

| Variable | Description |
|----------|-------------|
| `AGNTUX_MODE` | Set to `true` to enable self-hosted mode |
| `NODE_ENV` | `production` for deployed instances |

### Optional (Provider API Keys)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `GOOGLE_API_KEY` | Google (Gemini) API key |
| `MISTRAL_API_KEY` | Mistral API key |
| `XAI_API_KEY` | xAI (Grok) API key |

### Not Required in Self-Hosted Mode

| Variable | Description |
|----------|-------------|
| `CONVEX_HTTP_URL` | Convex backend URL (MCPJam free-tier models) |
| `VITE_CONVEX_URL` | Convex client URL (authentication) |
| `VITE_WORKOS_CLIENT_ID` | WorkOS client ID (authentication) |

## Related Documentation

- [UPSTREAM-SYNC.md](UPSTREAM-SYNC.md) - Upstream sync procedure
- [CONFLICT-RESOLUTION.md](CONFLICT-RESOLUTION.md) - Conflict resolution guide
- [RELEASING.md](RELEASING.md) - Release and deployment procedures
- [CONTRIBUTING-AGNTUX.md](CONTRIBUTING-AGNTUX.md) - Contributing to the fork
- [mcpjam-inspector/agntux/README.md](mcpjam-inspector/agntux/README.md) - AgntUX features
- [mcpjam-inspector/agntux/TESTING.md](mcpjam-inspector/agntux/TESTING.md) - Testing guide
