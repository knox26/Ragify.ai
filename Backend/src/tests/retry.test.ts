import { describe, expect, test } from "bun:test";
import {
  isTransientNetworkError,
  RATE_LIMIT_DEFAULT_RETRY_MS,
  rateLimitInfo,
} from "../utils/retry";

function makeError(message: string, cause?: unknown): Error {
  const err = new Error(message) as Error & { cause?: unknown };
  if (cause !== undefined) {
    err.cause = cause;
  }
  return err;
}

describe("rateLimitInfo", () => {
  test("returns not-a-rate-limit when the error is plain", () => {
    expect(rateLimitInfo(new Error("boom"))).toEqual({
      isRateLimit: false,
      retryMs: 0,
    });
  });

  test("detects a 429 inside the message", () => {
    expect(rateLimitInfo(new Error("429 Too Many Requests"))).toEqual({
      isRateLimit: true,
      retryMs: RATE_LIMIT_DEFAULT_RETRY_MS,
    });
  });

  test("detects RESOURCE_EXHAUSTED inside the message", () => {
    expect(
      rateLimitInfo(new Error("RESOURCE_EXHAUSTED: please slow down")),
    ).toEqual({
      isRateLimit: true,
      retryMs: RATE_LIMIT_DEFAULT_RETRY_MS,
    });
  });

  test("detects quota / rate-limit phrase", () => {
    expect(rateLimitInfo(new Error("rate limit exceeded"))).toEqual({
      isRateLimit: true,
      retryMs: RATE_LIMIT_DEFAULT_RETRY_MS,
    });
  });

  test("pulls the API's own retry-delay when present (s)", () => {
    const err = makeError(
      "Please retry in 12.5s.",
      makeError('{"retryDelay":"30s"}'),
    );

    expect(rateLimitInfo(err)).toEqual({ isRateLimit: true, retryMs: 12_500 });
  });

  test("falls back to retryDelay JSON when retry-in phrasing is absent", () => {
    const err = makeError('{"retryDelay":"8s"}');

    expect(rateLimitInfo(err)).toEqual({ isRateLimit: true, retryMs: 8_000 });
  });

  test("walks the cause chain to find a rate-limit signal", () => {
    const deep = makeError("RESOURCE_EXHAUSTED");
    const mid = makeError("wrapped", deep);
    const outer = makeError("rewrapped", mid);

    expect(rateLimitInfo(outer).isRateLimit).toBe(true);
  });

  test("respects cycle protection (seen set)", () => {
    const a: Error & { cause?: unknown } = new Error("a");
    const b: Error & { cause?: unknown } = new Error("b");
    a.cause = b;
    b.cause = a;

    expect(rateLimitInfo(a)).toEqual({
      isRateLimit: false,
      retryMs: 0,
    });
  });

  test("handles non-Error inputs without throwing", () => {
    expect(rateLimitInfo("not an error")).toEqual({
      isRateLimit: false,
      retryMs: 0,
    });
    expect(rateLimitInfo(undefined)).toEqual({
      isRateLimit: false,
      retryMs: 0,
    });
    expect(rateLimitInfo(null)).toEqual({
      isRateLimit: false,
      retryMs: 0,
    });
  });

  test("ignores a malformed delay string when no rate-limit signal fires", () => {
    expect(rateLimitInfo(makeError("Please retry in abc"))).toEqual({
      isRateLimit: false,
      retryMs: 0,
    });
  });
});

describe("isTransientNetworkError", () => {
  test("false for a plain application error", () => {
    expect(isTransientNetworkError(new Error("boom"))).toBe(false);
  });

  test("true for ECONNRESET", () => {
    expect(isTransientNetworkError(new Error("read ECONNRESET"))).toBe(true);
  });

  test("true for fetch failed", () => {
    expect(isTransientNetworkError(new Error("fetch failed"))).toBe(true);
  });

  test("true for socket connection was closed", () => {
    expect(
      isTransientNetworkError(new Error("socket connection was closed")),
    ).toBe(true);
  });

  test("true for ETIMEDOUT", () => {
    expect(isTransientNetworkError(new Error("connect ETIMEDOUT"))).toBe(true);
  });

  test("true for timeout", () => {
    expect(isTransientNetworkError(new Error("Request timeout"))).toBe(true);
  });

  test("walks the cause chain", () => {
    const deep = makeError("fetch failed");
    const outer = makeError("wrapped", deep);

    expect(isTransientNetworkError(outer)).toBe(true);
  });

  test("handles non-Error inputs", () => {
    expect(isTransientNetworkError("plain string")).toBe(false);
    expect(isTransientNetworkError(undefined)).toBe(false);
    expect(isTransientNetworkError(null)).toBe(false);
  });
});

describe("withRateLimitRetry", () => {
  test("succeeds after one rate-limit failure", async () => {
    const { withRateLimitRetry } = await import("../utils/retry");
    let calls = 0;
    const out = await withRateLimitRetry(
      async () => {
        calls++;
        if (calls === 1) throw makeError("429 Too Many Requests");
        return "ok";
      },
      { sleep: async () => {} },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(2);
  });

  test("rethrows non-retryable errors immediately", async () => {
    const { withRateLimitRetry } = await import("../utils/retry");
    let calls = 0;
    await expect(
      withRateLimitRetry(
        async () => {
          calls++;
          throw makeError("boom");
        },
        { sleep: async () => {} },
      ),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });

  test("exhausts attempts then rethrows", async () => {
    const { withRateLimitRetry } = await import("../utils/retry");
    let calls = 0;
    await expect(
      withRateLimitRetry(
        async () => {
          calls++;
          throw makeError("fetch failed: socket");
        },
        { attempts: 2, sleep: async () => {} },
      ),
    ).rejects.toThrow("fetch failed");
    expect(calls).toBe(2);
  });
});
