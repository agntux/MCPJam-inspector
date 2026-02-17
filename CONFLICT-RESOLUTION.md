# Conflict Resolution Guide

When syncing with upstream MCPJam/inspector, conflicts may arise in files that AgntUX has modified. This guide establishes priority order and resolution strategies.

## Priority Order

When conflicts arise, resolve them in this priority order:

1. **Security** - Session auth, token handling, host validation
2. **Core functionality** - Server startup, API routes, chat pipeline
3. **UI/UX** - Client components, hooks, model helpers
4. **Infrastructure** - Docker, deployment, CI/CD

## General Principles

- **Keep AgntUX additions**: Code blocks marked with `// AgntUX:` comments are fork-specific and must be preserved
- **Accept upstream refactors**: If upstream restructures code, adapt AgntUX changes to fit the new structure
- **Accept upstream security fixes**: Always take upstream security patches, then re-apply AgntUX modifications on top
- **Test after every conflict resolution**: Build and verify before moving to the next conflict

## Common Conflict Scenarios

### Scenario 1: `server/index.ts` - New upstream routes or middleware

**Symptom**: Upstream adds new routes or changes middleware order.

**Resolution**:
1. Accept all upstream route/middleware changes
2. Re-add the AgntUX config route import and registration:
   ```typescript
   import configRoutes from "./routes/config"; // AgntUX: server-side provider config
   // ...
   app.route("/api/config", configRoutes); // AgntUX: server-side provider config
   ```
3. Preserve the optional CONVEX_HTTP_URL warning (lines ~216-221)

### Scenario 2: `server/middleware/session-auth.ts` - Unprotected routes change

**Symptom**: Upstream modifies the `UNPROTECTED_ROUTES` or `UNPROTECTED_PREFIXES` arrays.

**Resolution**:
1. Accept upstream's changes to the arrays
2. Ensure `/api/config/server-providers` remains in `UNPROTECTED_ROUTES`:
   ```typescript
   "/api/config/server-providers", // AgntUX: exposes provider names (not keys) for model selection
   ```

### Scenario 3: `server/routes/mcp/chat-v2.ts` - Chat pipeline changes

**Symptom**: Upstream modifies the chat request handler, model creation, or streaming logic.

**Resolution**:
1. Accept upstream's structural changes
2. Re-apply the server-side API key fallback before `createLlmModel`:
   ```typescript
   // AgntUX: Fall back to server-side API keys when client doesn't provide one.
   const serverKeyMap: Record<string, string | undefined> = {
     anthropic: process.env.ANTHROPIC_API_KEY,
     openai: process.env.OPENAI_API_KEY,
     deepseek: process.env.DEEPSEEK_API_KEY,
     google: process.env.GOOGLE_API_KEY,
     mistral: process.env.MISTRAL_API_KEY,
     xai: process.env.XAI_API_KEY,
   };
   const effectiveApiKey = apiKey || serverKeyMap[modelDefinition.provider] || "";
   ```
3. Use `effectiveApiKey` instead of `apiKey` in `createLlmModel` call

### Scenario 4: `client/src/main.tsx` - Provider tree restructuring

**Symptom**: Upstream changes the Convex/WorkOS provider setup.

**Resolution**:
1. Accept upstream's provider changes for the `convexUrl && workosClientId` branch
2. Preserve the entire `else` branch with `NoOpWebSocket` and `selfHostedUseAuth`
3. The `NoOpWebSocket` class prevents infinite WebSocket reconnection loops — do not simplify

### Scenario 5: `client/src/hooks/use-chat-session.ts` - Hook restructuring

**Symptom**: Upstream modifies `useChatSession` — new state, changed auth flow, or new effects.

**Resolution**:
1. Accept upstream structural changes
2. Preserve these AgntUX additions:
   - `hasConvex` constant: `const hasConvex = Boolean(import.meta.env.VITE_CONVEX_URL);`
   - `serverProviders` state and `useEffect` to fetch from `/api/config/server-providers`
   - `hasConvex` guard on auth effects (prevents CORS errors in self-hosted mode)
   - `serverProviders` passed to `buildAvailableModels`

### Scenario 6: `client/src/components/chat-v2/shared/model-helpers.ts` - Model list changes

**Symptom**: Upstream adds/removes models or changes `buildAvailableModels` signature.

**Resolution**:
1. Accept upstream model list changes
2. Preserve `serverProviders` parameter in `buildAvailableModels`
3. Preserve `serverProviders.includes(provider)` fallback in `providerHasKey`
4. Preserve `hasConvex` filter for MCPJam-provided models

## Testing After Resolution

After resolving conflicts in any file, run these checks:

```bash
# Build
cd mcpjam-inspector
npm run build

# Unit tests
npx vitest run --config agntux/vitest.config.ts

# Manual smoke test
AGNTUX_MODE=true npm start
# Verify: app loads, /api/config/server-providers works, chat with server-side keys works
```

## When to Escalate

Escalate to the team if:
- Upstream removes a feature that AgntUX depends on (e.g., removes BYOK support entirely)
- Upstream changes the auth architecture fundamentally (e.g., replaces WorkOS with a different provider)
- Upstream changes the build system in a way that breaks the Dockerfile
- Conflicts span more than 5 files in a single sync
