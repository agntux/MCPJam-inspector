# Upstream Sync Procedure

How to sync this fork with [MCPJam/inspector](https://github.com/MCPJam/inspector) upstream.

## Prerequisites

Ensure the `upstream` remote is configured:

```bash
git remote add upstream https://github.com/MCPJam/inspector.git
git remote -v
# origin    git@github.com:agntux/MCPJam-inspector.git (fetch/push)
# upstream  https://github.com/MCPJam/inspector.git (fetch/push)
```

## Pre-Sync Checklist

- [ ] All work on `agntux-main` is committed and pushed
- [ ] No in-progress feature branches depend on files likely to conflict
- [ ] Current `agntux-main` builds and tests pass
- [ ] Review upstream changelog/releases for breaking changes

## Sync Steps

### 1. Fetch upstream changes

```bash
git fetch upstream
```

### 2. Update the `main` tracking branch

```bash
git checkout main
git merge upstream/main
git push origin main
```

### 3. Merge into `agntux-main`

```bash
git checkout agntux-main
git merge main
```

If there are conflicts, see [CONFLICT-RESOLUTION.md](CONFLICT-RESOLUTION.md).

### 4. Resolve conflicts

AgntUX-modified files are the most likely to conflict. Check these first:

```bash
git diff --name-only --diff-filter=U
```

Common conflict files (in resolution priority order):

1. `mcpjam-inspector/server/index.ts` - Keep AgntUX config route, optional CONVEX_HTTP_URL
2. `mcpjam-inspector/server/middleware/session-auth.ts` - Keep server-providers in unprotected routes
3. `mcpjam-inspector/server/routes/mcp/chat-v2.ts` - Keep serverKeyMap fallback
4. `mcpjam-inspector/client/src/main.tsx` - Keep NoOpWebSocket and self-hosted provider tree
5. `mcpjam-inspector/client/src/hooks/use-chat-session.ts` - Keep hasConvex checks, serverProviders
6. `mcpjam-inspector/client/src/components/chat-v2/shared/model-helpers.ts` - Keep serverProviders

### 5. Build and test

```bash
cd mcpjam-inspector
npm ci --legacy-peer-deps
npm run build
```

### 6. Run AgntUX-specific tests

```bash
# Unit tests
cd mcpjam-inspector
npx vitest run --config agntux/vitest.config.ts

# Visual tests (requires Docker or Playwright installed)
docker build -f ../Dockerfile.agntux -t mcpjam-agntux-test ..
docker run --rm mcpjam-agntux-test
```

### 7. Commit and push

```bash
git add .
git commit -m "agntux: sync with upstream MCPJam/inspector $(git log upstream/main -1 --format='%h')"
git push origin agntux-main
```

## Post-Sync Verification

- [ ] `npm run build` succeeds in `mcpjam-inspector/`
- [ ] App starts with `AGNTUX_MODE=true` and no CONVEX_HTTP_URL
- [ ] `/api/config/server-providers` returns expected providers
- [ ] LLM chat works with server-side API keys (no client-side key needed)
- [ ] MCPJam free-tier models are hidden when Convex is not configured
- [ ] No console errors related to WebSocket reconnection loops
- [ ] Docker build succeeds: `docker build -f Dockerfile.agntux -t test .`

## Rollback Procedure

If the sync introduces regressions:

```bash
# Find the pre-sync commit
git log agntux-main --oneline -10

# Reset to the pre-sync state
git checkout agntux-main
git reset --hard <pre-sync-commit-hash>
git push origin agntux-main --force-with-lease
```

## Sync Frequency

- **Recommended**: Sync after each upstream release or significant feature merge
- **Minimum**: Monthly, to avoid large conflict sets
- **Urgent**: When upstream patches security vulnerabilities

## Identifying AgntUX Changes

All AgntUX-specific modifications are marked with comments:

```typescript
// AgntUX: <description of change>
```

Search for these markers to find all fork-specific code:

```bash
grep -r "AgntUX:" mcpjam-inspector/server/ mcpjam-inspector/client/src/
```
