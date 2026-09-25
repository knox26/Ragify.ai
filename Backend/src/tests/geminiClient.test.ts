import { beforeEach, describe, expect, test } from "bun:test";

/**
 * Tests for the Gemini client rotation pool.
 *
 * The module reads env at first import. To test multiple configurations, we
 * rely on Bun's cache invalidation via `bun:test`'s fresh import — but Bun
 * doesn't honor `?fresh` reliably for our module. Instead, we test the
 * pure rotation helpers (`pickNextGeminiClient`, `rotateAfterRateLimit`,
 * etc.) by:
 *   - Verifying load + rotation behavior end-to-end with the real env keys.
 *   - Resetting cooldown state between tests via `_resetGeminiRotationState`.
 *
 * If we had to test different key counts in isolation, we'd split the pool
 * into a factory function — out of scope here.
 */

describe("geminiClient rotation", () => {
  // Each test should observe a fresh cooldown state — reset before.
  beforeEach(async () => {
    const { _resetGeminiRotationState } = await import(
      "../services/geminiClient"
    );
    _resetGeminiRotationState();
  });

  test("configuredGeminiKeyCount reflects loaded env vars", async () => {
    const { configuredGeminiKeyCount } = await import(
      "../services/geminiClient"
    );

    // The host .env has GEMINI_API_KEY through GEMINI_API_KEY6 configured
    // (verified by grep earlier in the session). The module counts only
    // non-blank entries.
    expect(configuredGeminiKeyCount()).toBeGreaterThanOrEqual(1);
  });

  test("pickNextGeminiClient returns a non-null client when keys exist", async () => {
    const { pickNextGeminiClient } = await import(
      "../services/geminiClient"
    );

    const c = pickNextGeminiClient();
    expect(c).not.toBeNull();
  });

  test("two successive picks return different clients (round-robin)", async () => {
    const { pickNextGeminiClient, configuredGeminiKeyCount } = await import(
      "../services/geminiClient"
    );

    // Round-robin only kicks in when more than one key is configured.
    if (configuredGeminiKeyCount() < 2) {
      return;
    }

    const c1 = pickNextGeminiClient();
    const c2 = pickNextGeminiClient();
    expect(c1).not.toBeNull();
    expect(c2).not.toBeNull();
    expect(c1).not.toBe(c2);
  });

  test("rotateAfterRateLimit marks a client in cooldown and returns the next", async () => {
    const {
      pickNextGeminiClient,
      rotateAfterRateLimit,
      availableGeminiClientCount,
    } = await import("../services/geminiClient");

    const before = availableGeminiClientCount();
    if (before < 2) {
      return;
    }

    const c = pickNextGeminiClient();
    expect(c).not.toBeNull();
    const beforeCooldown = availableGeminiClientCount();
    const next = rotateAfterRateLimit(c!, 60_000);

    expect(availableGeminiClientCount()).toBe(beforeCooldown - 1);
    expect(next).not.toBeNull();
    // The rotated client should have a different API key than the failed one.
    expect((next as { apiKey?: string }).apiKey).not.toBe(
      (c as { apiKey?: string }).apiKey,
    );
  });

  test("returns the soonest-expiring client when all are in cooldown", async () => {
    const {
      pickNextGeminiClient,
      rotateAfterRateLimit,
      availableGeminiClientCount,
      configuredGeminiKeyCount,
    } = await import("../services/geminiClient");

    const keyCount = configuredGeminiKeyCount();
    if (keyCount < 2) {
      return;
    }

    // Drain the pool: collect every key into cooldown with one having
    // a noticeably shorter cooldown than the rest. The "soonest" branch
    // only triggers when ALL clients are in cooldown, so we MUST
    // exhaust every key here.
    const allKeys: Array<{ apiKey?: string }> = [];
    for (let i = 0; i < keyCount; i++) {
      allKeys.push(pickNextGeminiClient() as { apiKey?: string });
    }

    expect(new Set(allKeys.map((k) => k.apiKey)).size).toBe(keyCount);
    expect(availableGeminiClientCount()).toBe(keyCount);

    // Put the FIRST key on the shortest cooldown, every other on a long one.
    for (let i = 0; i < keyCount; i++) {
      rotateAfterRateLimit(allKeys[i], i === 0 ? 5_000 : 60_000);
    }

    expect(availableGeminiClientCount()).toBe(0);

    const picked = pickNextGeminiClient() as { apiKey?: string };
    expect(picked).not.toBeNull();
    expect(picked.apiKey).toBe(allKeys[0]!.apiKey);
  });
});
