/**
 * Self-hosted provider wrappers for MCPJam Inspector.
 *
 * Extracts the provider-tree logic from main.tsx so the entry point stays clean.
 * - `createSelfHostedProviders()` — dummy Convex client with NoOpWebSocket, stable auth state
 * - `createManagedProviders(...)` — real Convex + WorkOS authentication
 */

import { type ReactElement } from "react";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient, ConvexProviderWithAuth } from "convex/react";
import { ConvexProviderWithAuthKit } from "@convex-dev/workos";
import App from "../../client/src/App.jsx";
import { NoOpWebSocket } from "./no-op-websocket";

/**
 * Build the provider tree for self-hosted mode (no Convex / WorkOS).
 *
 * Uses a dummy ConvexReactClient backed by {@link NoOpWebSocket} so the client
 * never makes network requests or enters a reconnection loop.
 */
export function createSelfHostedProviders(): ReactElement {
  console.log("[AgntUX] Self-hosted mode: using NoOpWebSocket for Convex client");

  const dummyConvex = new ConvexReactClient("https://127.0.0.1:1", {
    skipConvexDeploymentUrlCheck: true,
    webSocketConstructor: NoOpWebSocket as any,
  });

  // CRITICAL: useAuth return value must be a STABLE reference (same object every call).
  // ConvexProviderWithAuth calls useAuth() on every render as a hook. If fetchAccessToken
  // is a new function reference each time, Convex's internal useEffect dependencies change
  // on every render, causing an infinite re-render loop that freezes the page.
  const stableFetchToken = async () => null;
  const stableAuthState = {
    isLoading: false,
    isAuthenticated: true,
    fetchAccessToken: stableFetchToken,
  };
  const selfHostedUseAuth = () => stableAuthState;

  return (
    <AuthKitProvider
      clientId="hosted_placeholder"
      redirectUri="/callback"
      devMode={true}
    >
      <ConvexProviderWithAuth client={dummyConvex} useAuth={selfHostedUseAuth}>
        <App />
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}

/**
 * Build the provider tree for managed mode (real Convex + WorkOS).
 */
export function createManagedProviders(
  convexUrl: string,
  workosClientId: string,
  workosRedirectUri: string,
  workosClientOptions: Record<string, unknown>,
): ReactElement {
  const convex = new ConvexReactClient(convexUrl);

  return (
    <AuthKitProvider
      clientId={workosClientId}
      redirectUri={workosRedirectUri}
      {...workosClientOptions}
    >
      <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
        <App />
      </ConvexProviderWithAuthKit>
    </AuthKitProvider>
  );
}
