/**
 * Phase 1 retrieval pipeline — rewrite → route → rerank.
 *
 * Single entry point that replaces `retrieveWithGapFill`. Every stage is
 * stateless per request; failures degrade gracefully so a chat never breaks
 * because the router, rewriter, or reranker is down.
 *
 * Order of operations:
 *   1. Guard against whitespace-only questions.
 *   2. Route the question (rule-first → LLM fallback).
 *   3. Build query variants (original + subqueries + step-back + HyDE,
 *      route-gated and capped).
 *   4. Parallel hybrid retrieval per variant (userId filter ALWAYS).
 *   5. Merge + dedupe by id (keep max RRF score), sort, cap pool.
 *   6. Optional route-gated gap-fill rounds (bounded).
 *   7. Rerank over the pool; reattach full chunk text.
 *   8. Return top RERANK_TOP_K.
 */

import {
  candidatesForScoring,
  createReranker,
  RERANK_TOP_K,
  type Reranker,
  type RerankCandidate,
  type RerankHit,
} from "./reranker";
import {
  buildQueryVariants,
  type QueryVariant,
} from "./queryRewriter";
import {
  retrieveChunks,
  type RetrievedChunk,
} from "./retrievalService";
import {
  routeStrategy,
  routeQuery,
  type QueryRoute,
  type RouteResult,
} from "./queryRouter";
import {
  GAP_FILL_ENABLED,
  GAP_FILL_MAX_CHUNKS,
  GAP_FILL_MAX_ROUNDS,
  GAP_FILL_TOP_K,
  detectGaps,
} from "./gapFillService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineRetriever = (params: {
  userId: string;
  query: string;
  documentId?: string | null;
  topK?: number;
}) => Promise<RetrievedChunk[]>;

export type PipelineRouter = (question: string) => Promise<RouteResult>;

export type PipelineRewriter = (
  question: string,
  route: QueryRoute,
) => Promise<QueryVariant[]>;

export type GapDetector = (
  question: string,
  chunks: RetrievedChunk[],
) => Promise<string[]>;

export type PipelineMetrics = {
  route: QueryRoute;
  routeSource: string;
  variantCount: number;
  /** Query variant texts. Eval diagnosis only; never log raw in prod chat. */
  variantQueries?: string[];
  candidatePoolSize: number;
  rerankProvider: "cohere" | "noop" | "cosine";
  rerankLatencyMs: number;
  rerankRetries: number;
  gapFillRounds: number;
  finalChunkCount: number;
};

export type PipelineObserver = (metrics: PipelineMetrics) => void;

export type RetrievePipelineArgs = {
  userId: string;
  question: string;
  documentId?: string | null;
  // Injectable dependencies for tests + future tuning. Default to the
  // production implementations.
  router?: PipelineRouter;
  rewriter?: PipelineRewriter;
  retriever?: PipelineRetriever;
  reranker?: Reranker;
  gapDetector?: GapDetector;
  /** Called once per request with non-PII observability metrics. */
  observer?: PipelineObserver;
  /**
   * Called with the pre-rerank pool (post gap-fill). Eval-only seam for
   * measuring pool-recall vs final-recall; never used in chat.
   */
  poolObserver?: (pool: RetrievedChunk[]) => void;
  /**
   * Called with the rerank hits in final order. Eval-only seam for the
   * per-question chunk log; never used in chat.
   */
  rerankObserver?: (hits: RerankHit[]) => void;
  /**
   * Called with the effective variants actually used (post fall-through to
   * bare-original when every variant family failed). Eval-only seam so the
   * probe can tell "retrieved poorly" apart from "variants never fired";
   * never used in chat.
   */
  variantObserver?: (variants: QueryVariant[]) => void;
};

// ---------------------------------------------------------------------------
// Pure helpers — exposed for tests
// ---------------------------------------------------------------------------

/**
 * Stable merge across many variant retrievals. Keep the highest RRF score
 * per `${documentId}:${chunkIndex}`. Sort desc by score, then id asc.
 * Cap at `cap`.
 */
export function mergeAndDedupeChunks(
  groups: RetrievedChunk[][],
  cap: number,
): RetrievedChunk[] {
  const best = new Map<string, RetrievedChunk>();

  for (const group of groups) {
    for (const chunk of group) {
      const key = `${chunk.documentId}:${chunk.chunkIndex}`;
      const existing = best.get(key);
      if (!existing || chunk.score > existing.score) {
        best.set(key, chunk);
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.documentId < b.documentId
        ? -1
        : a.documentId > b.documentId
          ? 1
          : a.chunkIndex - b.chunkIndex;
    })
    .slice(0, cap);
}

/**
 * Map rerank hits (ordered) back to full RetrievedChunk[]. The id map
 * captures the full text; hits only carry the truncated scoring prefix.
 * Reattach the full text; preserve the reranker's ordering.
 */
export function reattachFullChunks(
  hits: RerankHit[],
  idToChunk: Map<string, RetrievedChunk>,
): RetrievedChunk[] {
  const out: RetrievedChunk[] = [];
  for (const hit of hits) {
    const chunk = idToChunk.get(hit.id);
    if (chunk) out.push(chunk);
  }
  return out;
}

export const PARENT_CONTEXT_ENABLED =
  (Bun.env.PARENT_CONTEXT_ENABLED ?? "true") !== "false";
export const PARENT_CONTEXT_MAX_CHARS = Number(
  Bun.env.PARENT_CONTEXT_MAX_CHARS ?? 6000,
);

/**
 * Attach section context for the final top-K (Fix B1). Scoring upstream
 * keeps using the precise child text; only what the chat prompt and the
 * recall oracle see is augmented. Parent text is payload-stored section
 * context, capped so one chunk cannot flood the prompt. Single-child
 * sections (parent identical to child) and absent parents degrade to the
 * child text unchanged. Page range stays the child's — never fabricate.
 */
export function attachParentContext(chunk: RetrievedChunk): RetrievedChunk {
  const parent = chunk.parentText?.trim();

  if (!PARENT_CONTEXT_ENABLED || !parent || parent === chunk.text.trim()) {
    return chunk;
  }

  const head = chunk.text;
  const room = Math.max(0, PARENT_CONTEXT_MAX_CHARS - head.length);
  const tail = parent.slice(0, room).trimEnd();

  if (!tail) {
    return chunk;
  }

  return { ...chunk, text: `${head}\n\n[Section context]\n${tail}` };
}

/**
 * Build the rerank candidates from the pool. Score text is truncated via
 * `candidatesForScoring`. Returns both the candidates and the id→full-chunk
 * map for reattachment.
 */
export function buildRerankInput(
  pool: RetrievedChunk[],
): { candidates: RerankCandidate[]; idToChunk: Map<string, RetrievedChunk> } {
  const idToChunk = new Map<string, RetrievedChunk>();

  for (const chunk of pool) {
    idToChunk.set(`${chunk.documentId}:${chunk.chunkIndex}`, chunk);
  }

  const candidates: RerankCandidate[] = pool.map((chunk) => ({
    id: `${chunk.documentId}:${chunk.chunkIndex}`,
    score: chunk.score,
    text: chunk.text, // candidatesForScoring will truncate
  }));

  return {
    candidates: candidatesForScoring(candidates),
    idToChunk,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const defaultRetriever: PipelineRetriever = ({ userId, query, documentId, topK }) =>
  retrieveChunks({ userId, query, documentId, topK });

const defaultGapDetector: GapDetector = (question, chunks) =>
  detectGaps(question, chunks);

/**
 * Run the Phase 1 retrieval pipeline. Every stage is fail-open: a router,
 * rewriter, or reranker failure degrades to today's behavior; the chat
 * never errors because of retrieval plumbing.
 */
export async function retrievePipeline(
  args: RetrievePipelineArgs,
): Promise<RetrievedChunk[]> {
  const cleaned = args.question.trim();
  if (!cleaned) return [];

  const router = args.router ?? routeQuery;
  const rewriter = args.rewriter ?? buildQueryVariants;
  const retriever = args.retriever ?? defaultRetriever;
  const reranker = args.reranker ?? createReranker();
  const gapDetect = args.gapDetector ?? defaultGapDetector;

  // 1. Route.
  const route = await router(cleaned);

  // 2. Build variants.
  const variants = await rewriter(cleaned, route.route);

  // Fall back to the original question if the rewriter dropped everything
  // (e.g. every variant failed). This keeps the pipeline stateless and
  // ensures we never return [] for a non-empty question just because the
  // router/rewriter misbehaved.
  const effectiveVariants: QueryVariant[] =
    variants.length > 0 ? variants : [{ kind: "original", text: cleaned }];

  if (args.variantObserver) {
    try {
      args.variantObserver([...effectiveVariants]);
    } catch {
      // Observation must not break retrieval.
    }
  }

  // 3. Parallel retrieval per variant.
  const groups = await Promise.all(
    effectiveVariants.map((variant) =>
      retriever({
        userId: args.userId,
        query: variant.text,
        documentId: args.documentId,
        topK: GAP_FILL_MAX_CHUNKS,
      }),
    ),
  );

  // 4. Merge + dedupe + cap pool.
  let pool = mergeAndDedupeChunks(groups, GAP_FILL_MAX_CHUNKS);

  // 5. Optional route-gated gap-fill.
  const strategy = routeStrategy(route.route);
  const gapFillOn = GAP_FILL_ENABLED && strategy.has("gapFill");
  let gapFillRounds = 0;

  if (gapFillOn) {
    const result = await runGapFill({
      userId: args.userId,
      documentId: args.documentId ?? null,
      question: cleaned,
      chunks: pool,
      retriever,
      gapDetect,
    });
    pool = result.chunks;
    gapFillRounds = result.rounds;
  }

  // 6. Rerank.
  if (args.poolObserver) {
    try {
      args.poolObserver([...pool]);
    } catch {
      // Observation must not break retrieval.
    }
  }
  const { candidates, idToChunk } = buildRerankInput(pool);
  const rerankStart = Date.now();
  const hits = await reranker.rerank(cleaned, candidates, {
    userId: args.userId,
    variants: effectiveVariants.map((v) => v.text),
  });
  const rerankLatencyMs = Date.now() - rerankStart;
  if (args.rerankObserver) {
    try {
      args.rerankObserver(hits.map((h) => ({ ...h })));
    } catch {
      // Observation must not break retrieval.
    }
  }

  // 7. Return top chunks with full text + parent context.
  const finalChunks = reattachFullChunks(hits.slice(0, RERANK_TOP_K), idToChunk).map(
    attachParentContext,
  );

  // 8. Emit non-PII metrics.
  if (args.observer) {
    try {
      args.observer({
        route: route.route,
        routeSource: route.source,
        variantCount: effectiveVariants.length,
        variantQueries: effectiveVariants.map((v) => v.text),
        candidatePoolSize: pool.length,
        rerankProvider: reranker.name,
        rerankLatencyMs,
        // CohereReranker doesn't surface retry counts in this version;
        // hook future versions to fill this in.
        rerankRetries: 0,
        gapFillRounds,
        finalChunkCount: finalChunks.length,
      });
    } catch {
      // Observer failures must not break the chat.
    }
  }

  return finalChunks;
}

/**
 * Bounded gap-fill. Mirrors the existing `retrieveWithGapFill` semantics:
 * up to `GAP_FILL_MAX_ROUNDS` iterations, each widening the pool with
 * targeted follow-up retrievals. Stops early if no new chunks surface.
 */
async function runGapFill(params: {
  userId: string;
  documentId: string | null;
  question: string;
  chunks: RetrievedChunk[];
  retriever: PipelineRetriever;
  gapDetect: GapDetector;
}): Promise<{ chunks: RetrievedChunk[]; rounds: number }> {
  const { userId, documentId, question, retriever, gapDetect } = params;
  let current = params.chunks;
  let rounds = 0;

  for (let round = 0; round < GAP_FILL_MAX_ROUNDS; round++) {
    let gaps: string[];

    try {
      gaps = await gapDetect(question, current);
    } catch {
      return { chunks: current, rounds };
    }

    if (gaps.length === 0) break;

    const extraGroups = await Promise.all(
      gaps.map((gapQuery) =>
        retriever({
          userId,
          query: gapQuery,
          documentId,
          topK: GAP_FILL_TOP_K,
        }),
      ),
    );

    const merged = mergeAndDedupeChunks(
      [current, ...extraGroups],
      GAP_FILL_MAX_CHUNKS,
    );

    if (merged.length === current.length) break;

    current = merged;
    rounds = round + 1;
  }

  return { chunks: current, rounds };
}
