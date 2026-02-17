# Contributing to AgntUX Fork

This guide covers how to work with the AgntUX fork of MCPJam Inspector. For upstream MCPJam contributing guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Development Setup

```bash
# Clone the fork
git clone git@github.com:agntux/MCPJam-inspector.git
cd MCPJam-inspector

# Switch to the AgntUX production branch
git checkout agntux-main

# Install dependencies
cd sdk && npm ci --legacy-peer-deps && npm run build && cd ..
cd mcpjam-inspector && npm ci --legacy-peer-deps

# Start development server (self-hosted mode)
AGNTUX_MODE=true npm run dev
```

## Branch Workflow

1. Create feature branches from `agntux-main`:
   ```bash
   git checkout agntux-main
   git pull origin agntux-main
   git checkout -b agntux-my-feature
   ```

2. Make changes and commit with the `agntux:` prefix:
   ```bash
   git commit -m "agntux: add rate limiting to config endpoint"
   ```

3. Open a PR targeting `agntux-main` (not `main`)

## When to Contribute Upstream vs Keep Local

### Contribute Upstream

- Bug fixes in core MCPJam functionality
- Performance improvements
- Accessibility fixes
- Documentation corrections

Use standard conventional commits (no `agntux:` prefix) and open a PR against `MCPJam/inspector`.

### Keep in Fork

- Self-hosted mode changes (NoOpWebSocket, hasConvex guards)
- Server-side API key fallback
- AgntUX deployment infrastructure (Dockerfile.agntux, fly.toml)
- Visual testing (Playwright runner, test scenarios)
- Host validation middleware
- Anything in `mcpjam-inspector/agntux/`

## Commit Conventions

| Prefix | Use |
|--------|-----|
| `agntux:` | Fork-specific changes to existing upstream files |
| `agntux(test):` | Test additions or changes |
| `agntux(infra):` | Dockerfile, fly.toml, CI/CD changes |
| `agntux(docs):` | Documentation specific to the fork |
| No prefix | Changes intended for upstream contribution |

## Code Conventions

### Marking Fork Changes

Always mark AgntUX-specific code with a comment:

```typescript
// AgntUX: <brief description of why this change exists>
const hasConvex = Boolean(import.meta.env.VITE_CONVEX_URL);
```

This makes changes easy to find during upstream syncs:

```bash
grep -r "AgntUX:" mcpjam-inspector/
```

### Adding to Existing Upstream Files

- Keep changes minimal — smallest viable diff
- Add `// AgntUX:` comments on changed lines
- Prefer additive changes (new code blocks) over modifying existing lines
- If modifying an existing line, keep the original as a comment if it aids conflict resolution

### Adding New Files

- Place AgntUX-specific code in `mcpjam-inspector/agntux/` when possible
- New server routes go in `mcpjam-inspector/server/routes/` with an `// AgntUX:` header comment
- New tests go in `mcpjam-inspector/agntux/__tests__/`

## Testing Requirements

Before submitting a PR:

1. **Build passes**:
   ```bash
   cd mcpjam-inspector && npm run build
   ```

2. **Unit tests pass**:
   ```bash
   npx vitest run --config agntux/vitest.config.ts
   ```

3. **Self-hosted mode works**:
   - App loads without CONVEX_HTTP_URL/VITE_CONVEX_URL
   - No WebSocket errors in console
   - `/api/config/server-providers` returns expected data

4. **Docker build succeeds** (for infrastructure changes):
   ```bash
   docker build -f Dockerfile.agntux -t test .
   ```

## Code Review Process

1. All PRs to `agntux-main` require at least one review
2. Reviewer checks:
   - Change is properly scoped (fork-only vs upstream-worthy)
   - `// AgntUX:` comments are present on modified upstream code
   - No unnecessary changes to upstream files
   - Tests cover the change
   - Build and tests pass

## File Reference

See [AGNTUX-FORK.md](AGNTUX-FORK.md) for the complete list of modified and added files.
