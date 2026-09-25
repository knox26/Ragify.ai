/**
 * Query router for the Phase 1 retrieval pipeline.
 *
 * Rule-first classification into one of five routes:
 *   - lookup         (single fact/figure)
 *   - metric_calc    (ratio/difference/percent from two+ figures)
 *   - multi_hop      (answer chains across facts)
 *   - comparison     (compare two entities)
 *   - conceptual     (definition/explanation)
 *
 * When rules are inconclusive, an LLM fallback can run (opt-in via
 * QUERY_ROUTE_LLM_FALLBACK). Any failure — bad JSON, unknown route,
 * disabled feature — returns the "default" route, which is the
 * current production path (decompose + gap-fill, no HyDE/step-back).
 *
 * Determinism first: rules use word-boundary regexes against the
 * normalized lowercase question. The LLM fallback is one Gemini call
 * with a tight JSON prompt; never trusted blindly.
 */

import { generateText } from "./chatService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueryRoute =
  | "lookup"
  | "metric_calc"
  | "multi_hop"
  | "comparison"
  | "conceptual"
  // "default" is the fail-open route — every error path returns this. It
  // reproduces today's full path (decompose + gap-fill, no HyDE/step-back)
  // so a router bug never narrows a complex query into a single-shot lookup.
  | "default";

export const QUERY_ROUTES: ReadonlyArray<QueryRoute> = [
  "lookup",
  "metric_calc",
  "multi_hop",
  "comparison",
  "conceptual",
];

export type RouteSource = "rule" | "llm" | "default";

export type RouteResult = {
  route: QueryRoute;
  source: RouteSource;
  /** 0..1. Rule hits = 1.0. LLM uses its self-reported confidence. Default = 0.0. */
  confidence: number;
};

export type RouterOptions = {
  /** Skip the whole router — always return default. */
  enabled?: boolean;
  /** Allow an LLM fallback when rules are inconclusive. */
  llmFallback?: boolean;
  /** Injected generator for tests. Default: chatService.generateText. */
  generateText?: typeof generateText;
};

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const QUERY_ROUTE_ENABLED = (Bun.env.QUERY_ROUTE_ENABLED ?? "true") !== "false";
const QUERY_ROUTE_LLM_FALLBACK = (Bun.env.QUERY_ROUTE_LLM_FALLBACK ?? "true") !== "false";

const ROUTER_SYSTEM = [
  "You classify a user's question into one of these retrieval routes for a RAG system over the user's uploaded documents (any domain):",
  "- lookup: a single fact or figure",
  "- metric_calc: a ratio, growth rate, percentage change, or arithmetic over figures",
  "- multi_hop: a question that chains across multiple facts in the documents",
  "- comparison: comparing two or more entities side by side",
  "- conceptual: a definition, explanation, or why/how question",
  "",
  'Return ONLY a JSON object: {"route": "<one of the five>", "confidence": <0..1>}.',
  "Pick the most specific route that fits. Lower confidence when ambiguous.",
  "No text outside the JSON.",
].join("\n");

// ---------------------------------------------------------------------------
// Pure helpers — exposed for tests + the rewriter
// ---------------------------------------------------------------------------

/**
 * Lower-case + collapse whitespace. Cheap normalization for rule matching
 * without changing the original question for retrieval.
 */
export function normalizeQuestion(question: string): string {
  return question.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Detect a comparison question. Two named entities OR comparison keywords.
 */
export function looksLikeComparison(question: string): boolean {
  const q = normalizeQuestion(question);
  if (/\b(compare|versus|vs\.?)\b/.test(q)) return true;
  if (/\bdifference\s+between\b/.test(q)) return true;

  // Two capitalized proper-noun-ish entities joined by "and"/"vs"/"or" often
  // signal a comparison. We strip leading question words so "What was AES
  // and TCS" still counts the entities (not "What" + "AES").
  const QUESTION_WORDS = new Set([
    "what",
    "how",
    "when",
    "where",
    "which",
    "who",
    "give",
    "show",
    "calculate",
    "compute",
    "find",
  ]);
  const words = question.split(/\s+/).filter((w) => w.length >= 3);
  const candidates = words.filter(
    (w) =>
      /^[A-Z][A-Za-z0-9.&-]*$/.test(w) && !QUESTION_WORDS.has(w.toLowerCase()),
  );
  if (candidates.length >= 2 && /\b(and|vs\.?|versus|or)\b/i.test(question)) {
    return true;
  }

  return false;
}

/**
 * Detect a metric calculation question — ratios, growth, ROA/ROE,
 * percentages, etc.
 */
export function looksLikeMetricCalc(question: string): boolean {
  const q = normalizeQuestion(question);
  return /\b(ratio|margin|growth|roa|roe|roi|eps|percentage|change|increase|decrease|calculate|compute)\b/.test(
    q,
  );
}

/**
 * Detect a multi-hop question — multiple asks joined by "and", or
 * pronouns referring to a prior fact ("then", "it", "that").
 */
export function looksLikeMultiHop(question: string): boolean {
  // Multiple distinct asks joined by "and": split on " and " or "; "
  const lowered = question.toLowerCase();
  const asks = lowered
    .split(/\s+and\s+|\s*;\s*|\?\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (asks.length >= 2 && asks.some((s) => /\b(what|how|when|where|which|calculate|compute|give)\b/.test(s))) {
    return true;
  }

  // Pronouns referencing prior context — only meaningful mid-conversation,
  // but we treat any "then", "it", "that figure" as a multi-hop signal.
  if (/\b(then|after\s+that|that\s+one|that\s+figure|that\s+number|\bit\b|\bits\b|\btheir\b)\b/.test(lowered)) {
    return true;
  }

  return false;
}

/**
 * Detect a conceptual question — definitions, explanations, "why", "how".
 */
export function looksLikeConceptual(question: string): boolean {
  const q = normalizeQuestion(question);
  return /^\s*(what\s+is|what\s+are|define|definition|explain|why\s|how\s+(does|do|is|are|can|should)|what\s+does\s+\w+\s+mean)/i.test(
    q,
  ) || /\b(explain|definition\s+of|meaning\s+of)\b/.test(q);
}

/**
 * Try rule-first classification. Returns null when rules are inconclusive.
 */
export function classifyByRules(question: string): QueryRoute | null {
  if (!question.trim()) return null;

  // Priority order matters: more-specific signals first so a question that
  // contains both "compare" and "ratio" routes to comparison (the action),
  // not metric_calc (the math).
  if (looksLikeComparison(question)) return "comparison";
  if (looksLikeMetricCalc(question)) return "metric_calc";
  if (looksLikeMultiHop(question)) return "multi_hop";
  if (looksLikeConceptual(question)) return "conceptual";

  return null;
}

/**
 * Parse the LLM fallback response into a RouteResult. Defensive: any
 * malformed output returns null so the caller falls back to "default".
 */
export function parseRouteResponse(
  raw: string,
): { route: QueryRoute; confidence: number } | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);

  if (!objectMatch) return null;

  let parsed: { route?: unknown; confidence?: unknown };

  try {
    parsed = JSON.parse(objectMatch[0]);
  } catch {
    return null;
  }

  if (typeof parsed.route !== "string") return null;

  const route = parsed.route.trim().toLowerCase() as QueryRoute;
  if (!QUERY_ROUTES.includes(route)) return null;

  let confidence: number = 0.5;

  if (typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)) {
    confidence = Math.max(0, Math.min(1, parsed.confidence));
  }

  return { route, confidence };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a question into a route. Fail-open: every error path returns the
 * "default" route, which is what the previous pipeline did (decompose +
 * gap-fill, no HyDE/step-back).
 */
export async function routeQuery(
  question: string,
  options: RouterOptions = {},
): Promise<RouteResult> {
  const enabled = options.enabled ?? QUERY_ROUTE_ENABLED;

  if (!enabled) {
    return { route: "default", source: "default", confidence: 0 };
  }

  const ruleRoute = classifyByRules(question);

  if (ruleRoute) {
    return { route: ruleRoute, source: "rule", confidence: 1.0 };
  }

  const llmFallback = options.llmFallback ?? QUERY_ROUTE_LLM_FALLBACK;

  if (!llmFallback) {
    return { route: "default", source: "default", confidence: 0 };
  }

  const generate = options.generateText ?? generateText;
  const cleaned = question.trim();

  if (!cleaned) {
    return { route: "default", source: "default", confidence: 0 };
  }

  try {
    const raw = await generate({ system: ROUTER_SYSTEM, user: cleaned });
    const parsed = parseRouteResponse(raw);

    if (!parsed) {
      return { route: "default", source: "default", confidence: 0 };
    }

    return { route: parsed.route, source: "llm", confidence: parsed.confidence };
  } catch {
    return { route: "default", source: "default", confidence: 0 };
  }
}

// ---------------------------------------------------------------------------
// Per-route enablement matrix — used by the pipeline + rewriter
// ---------------------------------------------------------------------------

/**
 * Which retrieval strategies each route allows.
 *
 *  - decompose: multi-query decomposition (always on when the router is on)
 *  - hyde: hypothetical-document embedding (off for fact-bound routes to
 *          avoid hallucinations)
 *  - stepback: principle-level rephrasing (off for routes that need
 *              exact figures)
 *  - gapFill: corrective retrieval (off for single-fact / explanation
 *             routes where the LLM cost isn't expected to help)
 */
export type RetrievalStrategy = "decompose" | "hyde" | "stepback" | "gapFill";

export function routeStrategy(route: QueryRoute): Set<RetrievalStrategy> {
  switch (route) {
    case "lookup":
      return new Set(["decompose"]);
    case "metric_calc":
      return new Set(["decompose", "gapFill"]);
    case "multi_hop":
      return new Set(["decompose", "stepback", "gapFill"]);
    case "comparison":
      return new Set(["decompose", "stepback", "gapFill"]);
    case "conceptual":
      return new Set(["decompose", "hyde", "stepback"]);
    default:
      // "default" → reproduces today's behavior exactly.
      return new Set(["decompose", "gapFill"]);
  }
}
