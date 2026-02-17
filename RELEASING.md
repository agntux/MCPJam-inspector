# Releasing AgntUX Inspector

## Version Numbering

AgntUX releases track the upstream MCPJam Inspector version with an `-agntux.N` suffix:

```
<upstream-version>-agntux.<patch>
```

**Examples**:
- Upstream `1.2.3` + first AgntUX release: `1.2.3-agntux.1`
- Same upstream + AgntUX bugfix: `1.2.3-agntux.2`
- New upstream `1.3.0` synced: `1.3.0-agntux.1`

## Release Checklist

### Pre-Release

- [ ] `agntux-main` is up to date with latest upstream sync (see [UPSTREAM-SYNC.md](UPSTREAM-SYNC.md))
- [ ] All AgntUX-specific tests pass:
  ```bash
  cd mcpjam-inspector
  npx vitest run --config agntux/vitest.config.ts
  ```
- [ ] Production build succeeds:
  ```bash
  cd mcpjam-inspector
  npm run build
  ```
- [ ] Docker build succeeds:
  ```bash
  docker build -f Dockerfile.agntux -t mcpjam-agntux:test .
  ```
- [ ] Docker container starts and passes health check:
  ```bash
  docker run -d -p 6274:6274 \
    -e AGNTUX_MODE=true \
    -e ANTHROPIC_API_KEY=test \
    mcpjam-agntux:test
  curl http://localhost:6274/health
  ```
- [ ] Manual smoke test passes (see [mcpjam-inspector/agntux/TESTING.md](mcpjam-inspector/agntux/TESTING.md))

### Tagging

```bash
git checkout agntux-main
git tag -a v<version> -m "Release v<version>"
git push origin v<version>
```

## Deployment to Fly.io

### First-Time Setup

```bash
fly auth login
fly apps create mcpjam-agntux
```

### Set Secrets

```bash
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  OPENAI_API_KEY=sk-... \
  DEEPSEEK_API_KEY=... \
  GOOGLE_API_KEY=... \
  MISTRAL_API_KEY=... \
  XAI_API_KEY=...
```

### Deploy

```bash
fly deploy --dockerfile Dockerfile.agntux
```

### Verify Deployment

```bash
# Health check
curl https://mcpjam-agntux.fly.dev/health

# Server providers
curl https://mcpjam-agntux.fly.dev/api/config/server-providers

# Logs
fly logs
```

## Rollback

### Fly.io Rollback

```bash
# List recent releases
fly releases

# Roll back to a previous release
fly deploy --image <previous-image-ref>
```

### Git Rollback

```bash
# Find the previous good tag
git tag -l 'v*-agntux*' --sort=-version:refname

# Deploy the previous tag
git checkout v<previous-version>
fly deploy --dockerfile Dockerfile.agntux

# Return to agntux-main
git checkout agntux-main
```

## Infrastructure Details

| Setting | Value |
|---------|-------|
| Fly.io app name | `mcpjam-agntux` |
| Region | `iad` (US East) |
| VM | shared-cpu-1x, 2GB RAM |
| Internal port | 6274 |
| Health check | `GET /health` every 30s |
| Auto-stop | Enabled (scales to 0 when idle) |
| Auto-start | Enabled (wakes on request) |
| HTTPS | Forced |

## Dockerfile Notes

The `Dockerfile.agntux` uses `mcr.microsoft.com/playwright:v1.54.2-jammy` as the base image. This provides:
- Pre-installed Chromium, Firefox, WebKit browsers
- Required system dependencies for headless browser automation
- Non-root user (`pwuser`, UID 1000) for security

The Playwright version in the Dockerfile **must match** the `@playwright/test` version in `mcpjam-inspector/package.json`. Mismatches cause browser launch failures.
