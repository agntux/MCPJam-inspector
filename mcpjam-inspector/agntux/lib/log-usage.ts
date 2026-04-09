/**
 * AgntUX usage logging utility.
 *
 * Posts token usage to the AgntUX app backend for credit tracking.
 * Only active when AGNTUX_MODE=true and AGNTUX_API_URL is configured.
 * Fire-and-forget — errors are logged but never block the chat stream.
 */

import { logger } from "../../server/utils/logger";

const API_TIMEOUT_MS = 3_000;

interface LogUsageParams {
  appId: string;
  messageId: string;
  model: string;
  modelProvider: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  cache5mWriteTokens?: number;
  cache1hWriteTokens?: number;
}

/**
 * Returns true when AgntUX usage logging is enabled.
 */
export function isUsageLoggingEnabled(): boolean {
  return (
    process.env.AGNTUX_MODE === "true" &&
    !!process.env.AGNTUX_API_URL &&
    !!process.env.AGNTUX_API_KEY
  );
}

/**
 * POST a single usage entry to the AgntUX app backend.
 * The backend deduplicates by messageId and calculates credits.
 *
 * Throws on failure so the caller can log a warning via .catch().
 */
export async function logUsageToAgntUX(params: LogUsageParams): Promise<void> {
  const apiUrl = process.env.AGNTUX_API_URL;
  const apiKey = process.env.AGNTUX_API_KEY;
  if (!apiUrl || !apiKey) {
    return;
  }

  const url = `${apiUrl}/api/apps/${params.appId}/log-usage`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`log-usage returned ${response.status}`);
  }
}

/**
 * Fire-and-forget usage logging. Logs a warning on failure, never throws.
 */
export function logUsageFireAndForget(params: LogUsageParams): void {
  if (!isUsageLoggingEnabled()) {
    return;
  }

  logUsageToAgntUX(params).catch((err) => {
    logger.warn("[AgntUX] Failed to log usage:", err);
  });
}
