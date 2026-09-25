/**
 * Query rewriter for the Phase 1 retrieval pipeline.
 *
 * Layers three techniques on top of the existing decompose:
 *   1. Multi-query (the existing subquery decomposition)
 *   2. HyDE (hypothetical-document embedding)
 *   3. Step-back (principle-level rephrasing)
 *
 * Route-gating per D3 in PHASE_1_RETRIEVAL_PLAN.md:
 *   - HyDE is OFF for lookup / metric_calc / multi_hop / comparison because
 *     a hypothetical answer can invent a figure and actively misdirect
 *     retrieval.
 *   - Step-back is OFF for lookup / metric_calc — those need exact figures,
 *     not abstract rephrasings.
 *
 * Each rewrite call is independently try/catch'd — one failure drops only
 * that variant. Rewrite text is retrieval-only and is NEVER surfaced in the
 * prompt, sources, or logs.
 */

import { generateText } from "./chatService";
import { withRateLimitRetry } from "../utils/retry";
import {
  decomposeQuery,
  parseSubqueries,
} from "./subqueryService";
import {
  routeStrategy,
  type QueryRoute,
  type RetrievalStrategy,
} from "./queryRouter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueryVariantKind = "original" | "subquery" | "hyde" | "stepback";

export type QueryVariant = {
  kind: QueryVariantKind;
  text: string;
};

export type RewriterOptions = {
  /** Injected generator for tests. Default: chatService.generateText. */
  generateText?: typeof generateText;
  /** Injected decomposer for tests. Default: subqueryService.decomposeQuery. */
  decomposeQuery?: typeof decomposeQuery;
  /** Global feature switches (overrides route-gating when false). */
  hydeEnabled?: boolean;
  stepbackEnabled?: boolean;
  /** Hard cap on the number of variants returned. */
  maxVariants?: number;
};

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const QUERY_REWRITE_HYDE_ENABLED = (Bun.env.QUERY_REWRITE_HYDE_ENABLED ?? "true") !== "false";
const QUERY_REWRITE_STEPBACK_ENABLED = (Bun.env.QUERY_REWRITE_STEPBACK_ENABLED ?? "true") !== "false";
const QUERY_REWRITE_MAX_VARIANTS = Number(Bun.env.QUERY_REWRITE_MAX_VARIANTS ?? 8);

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const HYDE_SYSTEM = [
  "You write a short, factual document excerpt that would answer the user's question.",
  "Keep it grounded — only mention entities and topics the user named. Do not invent specific figures, dates, or numbers.",
  "Write 1-3 sentences in plain text. No JSON, no markdown, no preamble.",
].join("\n");

const STEPBACK_SYSTEM = [
  "You rephrase a specific question into a more abstract, principle-level question.",
  "The rephrasing should retrieve broader context (definitions, frameworks, categories) that the specific question depends on.",
  'Return ONLY a JSON object: {"stepback": "<one abstract question>"}.',
  "No text outside the JSON.",
].join("\n");

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Short factual questions ("How is intent annotated?") are answered by a
 * specific passage, not a topic cloud — a HyDE hypothetical reliably
 * describes the wrong neighbor (e.g. annotation schemes instead of the
 * data-collection procedure) and drags retrieval with it. Gate HyDE out
 * for these; decomposition already covers them.
 */
const SHORT_FACTUAL_RE = /^(how|what|when|which|who|whom|whose|name|list)\b/i;

export function isShortFactual(question: string): boolean {
  const words = question.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 8 && SHORT_FACTUAL_RE.test(question.trim());
}

/** Normalize a string for dedupe comparison. */
function normalizeForDedupe(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Parse the step-back LLM response defensively. Any failure → null so the
 * caller skips the variant.
 */
export function parseStepbackResponse(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;

  let parsed: { stepback?: unknown };
  try {
    parsed = JSON.parse(objectMatch[0]);
  } catch {
    return null;
  }

  if (typeof parsed.stepback !== "string") return null;
  const trimmed = parsed.stepback.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Apply strategy gating + dedupe + cap. Pure helper — exposed for tests.
 */
export function buildOrderedVariants(
  segments: Array<{ kind: QueryVariantKind; text: string } | null>,
  maxVariants: number,
): QueryVariant[] {
  const seen = new Set<string>();
  const out: QueryVariant[] = [];

  for (const seg of segments) {
    if (!seg) continue;
    const key = normalizeForDedupe(seg.text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: seg.kind, text: seg.text });
    if (out.length >= maxVariants) break;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the ordered list of query variants for retrieval. Original always
 * first, then subqueries, then step-back (if enabled), then HyDE (if
 * enabled). Each rewrite is independently try/catch'd so a single failure
 * doesn't break the chat.
 */
export async function buildQueryVariants(
  question: string,
  route: QueryRoute,
  options: RewriterOptions = {},
): Promise<QueryVariant[]> {
  const cleaned = question.trim();
  if (!cleaned) return [];

  const strategy = routeStrategy(route);
  const maxVariants = options.maxVariants ?? QUERY_REWRITE_MAX_VARIANTS;

  const segments: Array<{ kind: QueryVariantKind; text: string } | null> = [];

  // 1. Original.
  segments.push({ kind: "original", text: cleaned });

  // 2. Subqueries (always — the router controls whether to decompose).
  if (strategy.has("decompose" satisfies RetrievalStrategy)) {
    const decompose = options.decomposeQuery ?? decomposeQuery;
    try {
      const subs = await decompose(cleaned);
      for (const sub of subs) {
        if (sub && sub.trim().length > 0) {
          segments.push({ kind: "subquery", text: sub.trim() });
        }
      }
    } catch {
      // Decompose is best-effort — fall through to the rest.
    }
  }

  // 3. Step-back (route-gated + env-gated).
  const stepbackOn =
    strategy.has("stepback" satisfies RetrievalStrategy) &&
    (options.stepbackEnabled ?? QUERY_REWRITE_STEPBACK_ENABLED);

  if (stepbackOn) {
    const generate = options.generateText ?? generateText;
    try {
      const raw = await withRateLimitRetry(() =>
        generate({ system: STEPBACK_SYSTEM, user: cleaned }),
      );
      const stepback = parseStepbackResponse(raw);
      if (stepback) {
        segments.push({ kind: "stepback", text: stepback });
      }
    } catch {
      // Drop this variant.
    }
  }

  // 4. HyDE (route-gated + env-gated + short-factual gate).
  const hydeOn =
    strategy.has("hyde" satisfies RetrievalStrategy) &&
    (options.hydeEnabled ?? QUERY_REWRITE_HYDE_ENABLED) &&
    !isShortFactual(cleaned);

  if (hydeOn) {
    const generate = options.generateText ?? generateText;
    try {
      const hydeText = await withRateLimitRetry(() =>
        generate({ system: HYDE_SYSTEM, user: cleaned }),
      );
      if (hydeText && hydeText.trim().length > 0) {
        segments.push({ kind: "hyde", text: hydeText.trim() });
      }
    } catch {
      // Drop this variant.
    }
  }

  return buildOrderedVariants(segments, maxVariants);
}

/**
 * Re-export so the pipeline can call `parseSubqueries` directly when it
 * needs to validate a subquery list.
 */
export { parseSubqueries };
