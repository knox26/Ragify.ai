/**
 * Gemini client pool with key rotation.
 *
 * Reads `GEMINI_API_KEY`, `GEMINI_API_KEY2`, … (no fixed cap — every
 * numbered slot present in env joins the pool) and instantiates one
 * `GoogleGenAI` per key. Provides two helpers:
 *   - `getGeminiClients()` — ordered list of healthy clients.
 *   - `pickNextGeminiClient(prev?)` — round-robin selection with a built-in
 *     cooldown for keys that just hit a rate limit.
 *
 * Free-tier Gemini quotas are per-API-key. The eval pipeline makes dozens of
 * calls; cycling through keys lets one project use multiple free accounts
 * to avoid daily caps. Rotation is independent of the per-call retry
 * already in `utils/retry.ts`.
 *
 * Cooldowns are in-memory and per-process. They expire after
 * `GEMINI_KEY_COOLDOWN_MS` (default 5 minutes — long enough to outlast a
 * a rate-limit window but short enough to retry a key later).
 */

import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

// Upper bound for numbered-key scanning. Gaps are skipped, so
// KEY..KEY6,KEY8 joins 7 clients, not 6.
const MAX_KEYS = 32;

function keyEnvNames(): string[] {
  const names = ["GEMINI_API_KEY"];
  for (let i = 2; i <= MAX_KEYS; i++) {
    names.push(`GEMINI_API_KEY${i}`);
  }
  return names;
}

function loadKeys(): string[] {
  const out: string[] = [];
  for (const name of keyEnvNames()) {
    const value = Bun.env[name];
    if (typeof value === "string" && value.trim().length > 0) {
      out.push(value.trim());
    }
  }
  return out;
}

function loadGeminiKeyCount(): number {
  return loadKeys().length;
}

// ---------------------------------------------------------------------------
// Cooldown + rotation state
// ---------------------------------------------------------------------------

const GEMINI_KEY_COOLDOWN_MS = Number(Bun.env.GEMINI_KEY_COOLDOWN_MS ?? 5 * 60_000);

let clients: GoogleGenAI[] = [];
let nextIndex = 0;

if (loadGeminiKeyCount() === 0) {
  // The legacy module-level check in embeddingService / chatService throws a
  // friendly error. We don't throw here so the bundler / test harness can
  // import this module without env; those services already check.
} else {
  clients = loadKeys().map((key) => new GoogleGenAI({ apiKey: key }));
}

const cooldownUntil: number[] = new Array(clients.length).fill(0);

function isAvailable(index: number, now: number): boolean {
  return cooldownUntil[index]! <= now;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Number of healthy (non-rate-limited) clients right now. */
export function availableGeminiClientCount(now: number = Date.now()): number {
  let n = 0;
  for (let i = 0; i < clients.length; i++) {
    if (isAvailable(i, now)) n++;
  }
  return n;
}

/**
 * Pick the next healthy client. `prev` is the client last used; we advance
 * one slot from there to spread load. If every key is in cooldown, returns
 * the one whose cooldown expires soonest so the caller can decide whether
 * to wait or fail.
 */
export function pickNextGeminiClient(
  prev?: GoogleGenAI,
  now: number = Date.now(),
): GoogleGenAI | null {
  if (clients.length === 0) return null;

  const startIdx = prev
    ? (clients.indexOf(prev) + 1) % clients.length
    : nextIndex;

  // First pass: a healthy client after `prev`.
  for (let step = 0; step < clients.length; step++) {
    const idx = (startIdx + step) % clients.length;
    if (isAvailable(idx, now)) {
      nextIndex = (idx + 1) % clients.length;
      return clients[idx]!;
    }
  }

  // Second pass: the soonest-expiring cooldown.
  let bestIdx = 0;
  let bestExpiry = cooldownUntil[0]!;
  for (let i = 1; i < clients.length; i++) {
    if (cooldownUntil[i]! < bestExpiry) {
      bestIdx = i;
      bestExpiry = cooldownUntil[i]!;
    }
  }
  nextIndex = (bestIdx + 1) % clients.length;
  return clients[bestIdx]!;
}

/**
 * Mark a client as rate-limited until `Date.now() + retryMs` (or
 * `GEMINI_KEY_COOLDOWN_MS` if no hint). Returns the next healthy client.
 */
export function rotateAfterRateLimit(
  failedClient: GoogleGenAI,
  retryMs: number = GEMINI_KEY_COOLDOWN_MS,
  now: number = Date.now(),
): GoogleGenAI | null {
  const idx = clients.indexOf(failedClient);
  if (idx >= 0) {
    cooldownUntil[idx] = now + retryMs;
  }
  return pickNextGeminiClient(failedClient, now);
}

/** Convenience: the pool's first healthy client (or null). Used at module init. */
export function primaryGeminiClient(): GoogleGenAI | null {
  return pickNextGeminiClient(undefined);
}

/** Test-only reset. */
export function _resetGeminiRotationState(): void {
  for (let i = 0; i < cooldownUntil.length; i++) cooldownUntil[i] = 0;
  nextIndex = 0;
  const keys = loadKeys();
  clients = keys.map((key) => new GoogleGenAI({ apiKey: key }));
}

/** The configured keys — for diagnostics / "which keys are in use?" log lines. */
export function configuredGeminiKeyCount(): number {
  return loadGeminiKeyCount();
}

/** Active cooldown state, in the same order as the configured keys. Test-only. */
export function _geminiCooldownSnapshot(now: number = Date.now()): number[] {
  return cooldownUntil.map((expiry) => Math.max(0, expiry - now));
}
