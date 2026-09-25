/**
 * Shared helpers for detecting Gemini/Google API rate-limit and transient
 * network failures inside an `Error.cause` chain.
 *
 * Extracted from `services/embeddingService.ts` so the reranker (and any
 * future service that talks to Gemini or another HTTP API) reuses the same
 * detection logic instead of forking yet another near-copy of it.
 *
 * The `@google/genai` SDK wraps the JSON status string inside `Error.message`,
 * and pipeline stages re-wrap the whole thing in `{ cause }`. A plain message
 * test misses the wrapped case, so the helpers walk the entire cause chain.
 */

export interface RateLimitInfo {
  isRateLimit: boolean;
  retryMs: number;
}

/**
 * Default fallback delay when a rate-limit is detected but the API's own
 * retryDelay string is absent. Sized to outlast a free-tier saturation stall
 * without making the caller hang for an unbounded time.
 */
export const RATE_LIMIT_DEFAULT_RETRY_MS = 45_000;

/**
 * Detect a Gemini rate-limit (429 / RESOURCE_EXHAUSTED) anywhere in the error
 * cause chain and pull the API's own retry delay when present. Returns
 * `retryMs = 0` and `isRateLimit = false` when no rate-limit signal is found.
 */
export function rateLimitInfo(error: unknown): RateLimitInfo {
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current && !seen.has(current)) {
    seen.add(current);
    const obj = current as Record<string, unknown>;
    const message = typeof obj.message === "string" ? obj.message : "";

    if (message) {
      const retryMatch = message.match(/Please retry in ([\d.]+)s?\.?/i);
      const delayMatch = message.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i);
      const secs = retryMatch
        ? Number(retryMatch[1])
        : delayMatch
          ? Number(delayMatch[1])
          : NaN;

      if (Number.isFinite(secs) && secs > 0) {
        return { isRateLimit: true, retryMs: secs * 1000 };
      }

      if (/429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(message)) {
        return { isRateLimit: true, retryMs: RATE_LIMIT_DEFAULT_RETRY_MS };
      }
    }

    if (obj.code === 429) {
      return { isRateLimit: true, retryMs: RATE_LIMIT_DEFAULT_RETRY_MS };
    }

    current = obj.cause;
  }

  return { isRateLimit: false, retryMs: 0 };
}

/**
 * Transient network failures (dropped socket, ECONNRESET, fetch timeout) are
 * retryable. A single hiccup must not fail a long-running job.
 */
export type RetryOptions = {
  /** Total attempts including the first (default 3). */
  attempts?: number;
  /** Cap on any single wait (default 60s). */
  maxDelayMs?: number;
  /** Injectable clock for tests (default real sleep). */
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run fn, retrying rate-limit (429) and transient network failures with the
 * API's own retry delay (capped). Rethrows the last error — callers keep
 * their exact fall-through behavior, they just run out of luck later.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const attempts = Math.max(1, opts?.attempts ?? 3);
  const maxDelayMs = opts?.maxDelayMs ?? 60_000;
  const sleep = opts?.sleep ?? realSleep;

  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === attempts - 1) break;
      const limit = rateLimitInfo(error);
      const retryable = limit.isRateLimit || isTransientNetworkError(error);
      if (!retryable) break;
      await sleep(Math.min(limit.isRateLimit ? limit.retryMs : 5_000, maxDelayMs));
    }
  }
  throw lastError;
}

export function isTransientNetworkError(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current && !seen.has(current)) {
    seen.add(current);
    const obj = current as Record<string, unknown>;
    const message = typeof obj.message === "string" ? obj.message : "";

    if (
      /socket connection was closed|ECONNRESET|fetch failed|network|ETIMEDOUT|timeout/i.test(
        message,
      )
    ) {
      return true;
    }

    current = obj.cause;
  }

  return false;
}
