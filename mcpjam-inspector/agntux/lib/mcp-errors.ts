/**
 * AgntUX: Shared MCP error detection utilities for graceful degradation
 * when connected servers don't support certain MCP methods.
 */

/**
 * Detects MCP "method not available" errors (e.g. error code -32603 or -32601)
 * for servers that don't support prompts/list or similar methods.
 * Handles both Error instances and plain objects with a `message` property.
 */
export function isMethodUnavailableError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return (
    lower.includes("unknown method") ||
    lower.includes("method not found") ||
    lower.includes("not implemented") ||
    lower.includes("does not support")
  );
}
