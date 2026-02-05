/**
 * Locked Navigation Component
 *
 * Replaces the standard MCPJam navigation in AgntUX mode.
 * Hides server configuration options and shows only testing-relevant UI.
 */

interface LockedNavigationProps {
  mcpServerUrl?: string;
  componentName?: string;
}

export function LockedNavigation({ mcpServerUrl, componentName }: LockedNavigationProps) {
  return (
    <nav
      className="locked-navigation bg-gray-900 border-b border-gray-800 px-4 py-3"
      aria-label="AgntUX testing navigation"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-white font-semibold">MCPJam Inspector</span>
          {componentName && (
            <span className="text-gray-400 text-sm">
              Testing: <span className="text-blue-400">{componentName}</span>
            </span>
          )}
        </div>

        {mcpServerUrl && (
          <div
            className="text-gray-500 text-xs truncate max-w-md"
            aria-label="Connected MCP server URL"
          >
            {mcpServerUrl}
          </div>
        )}
      </div>
    </nav>
  );
}
