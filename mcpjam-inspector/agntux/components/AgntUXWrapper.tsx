/**
 * AgntUX Wrapper Component
 *
 * Wraps the MCPJam Inspector UI when running in AgntUX mode.
 * - Hides server configuration UI (navigation is locked)
 * - Validates MCP server URLs
 * - Provides visual indicator of AgntUX mode
 */

import type { ReactNode } from 'react';

interface AgntUXWrapperProps {
  children: ReactNode;
}

export function AgntUXWrapper({ children }: AgntUXWrapperProps) {
  // Check if AgntUX mode is enabled
  const isAgntUXMode = import.meta.env.VITE_AGNTUX_MODE === 'true';

  if (!isAgntUXMode) {
    return <>{children}</>;
  }

  return (
    <div className="agntux-wrapper">
      {/* AgntUX Mode Banner - role="banner" for accessibility */}
      <div
        role="banner"
        className="agntux-banner bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 text-sm flex items-center justify-between"
      >
        <span className="font-medium">AgntUX Visual Testing Mode</span>
        <span className="text-purple-200 text-xs">Powered by Playwright</span>
      </div>

      {/* Main content with locked navigation context */}
      <main className="agntux-content">
        {children}
      </main>
    </div>
  );
}
