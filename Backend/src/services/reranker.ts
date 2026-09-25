/**
 * Cross-encoder reranking stage for the Phase 1 retrieval pipeline.
 *
 * The first-stage hybrid retrieval (dense + sparse + RRF) over Qdrant gives a
 * wide candidate pool. A cross-encoder reads each (query, chunk) pair jointly
 * and reorders them by relevance — the only mechanism that resolves the
 * consolidated-vs-parent confusion that an RRF score cannot.
 *
 * Public contract:
 *  - `Reranker.rerank(query, candidates)` returns `RerankHit[]` ordered by
 *    reranker relevance.
 *  - `NoopReranker` returns candidates sorted by first-stage RRF score with
 *    a stable tiebreak. Used as the fail-open / no-key fallback.
 *  - `CohereReranker` talks to the v2 API. SDK-free on purpose: the
 *    endpoint is small and a raw client keeps the surface auditable.
 *
 * Truncation is a scoring optimization only. The prompt/sources always see
 * the full chunk text (D4 in PHASE_1_RETRIEVAL_PLAN.md).
 */

import { rateLimitInfo } from "../utils/retry";
import { qdrantClient } from "../db/qdrantClient";
import { generateEmbedding } from "./embeddingService";
import { buildChunkPointId } from "./qdrantCollectionService";

export type RerankCandidate = {
  /** Stable id across the rerank call: `${documentId}:${chunkIndex}`. */
  id: string;
  /** Truncated prefix used only for scoring. */
  text: string;
  /** First-stage RRF score, used as a deterministic tiebreak. */
  score: number;
};

export type RerankHit = {
  id: string;
  /** Reranker relevance. Ordering only — never a threshold. */
  score: number;
};

export interface Reranker {
  readonly name: "cohere" | "noop" | "cosine";
  rerank(
    query: string,
    candidates: RerankCandidate[],
    opts?: {
      userId?: string;
      /**
       * Variant query texts (subqueries, step-back). CosineReranker scores
       * each candidate against the best-matching of question + variants, so
       * a chunk retrieved by a component subquery is judged against that
       * subquery — not punished for missing the original wording. Other
       * implementations ignore it.
       */
      variants?: string[];
    },
  ): Promise<RerankHit[]>;
}

// ---------------------------------------------------------------------------
// Env-driven configuration
// ---------------------------------------------------------------------------

const RERANK_ENABLED = (Bun.env.RERANK_ENABLED ?? "true") !== "false";
const RERANK_MODEL = Bun.env.RERANK_MODEL ?? "rerank-v3.5";
const RERANK_MAX_CHARS = Number(Bun.env.RERANK_MAX_CHARS ?? 1024);
const RERANK_TIMEOUT_MS = Number(Bun.env.RERANK_TIMEOUT_MS ?? 5_000);
const RERANK_RETRY_BUDGET_MS = Number(Bun.env.RERANK_RETRY_BUDGET_MS ?? 15_000);
const RERANK_TRANSIENT_RETRY_MS = Math.min(
  Number(Bun.env.RERANK_TRANSIENT_RETRY_MS ?? 1_000),
  RERANK_RETRY_BUDGET_MS,
);

const RERANK_ENDPOINT = "https://api.cohere.com/v2/rerank";

export const CANDIDATE_TOP_K = Number(Bun.env.CANDIDATE_TOP_K ?? 50);
export const CANDIDATE_POOL_MAX = Number(Bun.env.CANDIDATE_POOL_MAX ?? 50);
export const RERANK_TOP_K = Number(Bun.env.RERANK_TOP_K ?? 8);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncate a candidate's text for scoring. Cross-encoders are O(n·seq²)
 * and priced per token; a 1024-char prefix keeps the bill bounded while
 * retaining the section labels + first paragraphs that drive relevance.
 */
export function truncateForScoring(text: string): string {
  if (text.length <= RERANK_MAX_CHARS) return text;
  return text.slice(0, RERANK_MAX_CHARS);
}

/**
 * Stable ordering used by NoopReranker and as a tiebreak when reranker
 * scores tie: highest score first, then lowest id for reproducibility.
 */
function sortCandidatesStable<T extends { score: number; id: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Stable ordering for hits with a (rerankScore, firstStageScore, id) tuple.
 */
function sortHitsStable(
  hits: { id: string; rerankScore: number; firstStageScore: number }[],
): RerankHit[] {
  const ordered = [...hits].sort((a, b) => {
    if (b.rerankScore !== a.rerankScore) return b.rerankScore - a.rerankScore;
    if (b.firstStageScore !== a.firstStageScore) {
      return b.firstStageScore - a.firstStageScore;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return ordered.map((h) => ({ id: h.id, score: h.rerankScore }));
}

// ---------------------------------------------------------------------------
// NoopReranker — the always-on fallback. Used when no API key is configured,
// when RERANK_ENABLED=false, or after every retry budget has been spent.
// ---------------------------------------------------------------------------

export class NoopReranker implements Reranker {
  readonly name = "noop" as const;

  rerank(_query: string, candidates: RerankCandidate[]): Promise<RerankHit[]> {
    if (candidates.length === 0) return Promise.resolve([]);

    const ordered = sortCandidatesStable(candidates).slice(0, RERANK_TOP_K);

    return Promise.resolve(ordered.map((c) => ({ id: c.id, score: c.score })));
  }
}

// ---------------------------------------------------------------------------
// CohereReranker — thin typed fetch client for POST /v2/rerank
// ---------------------------------------------------------------------------

type CohereRerankResponse = {
  results?: Array<{ index: number; relevance_score?: number }>;
};

export class CohereReranker implements Reranker {
  readonly name = "cohere" as const;

  constructor(
    private readonly apiKey: string,
    private readonly deps: {
      fetchImpl?: typeof fetch;
      sleep?: (ms: number) => Promise<void>;
      now?: () => number;
      /** Per-call HTTP timeout, in ms. Tests can shorten to keep suites fast. */
      timeoutMs?: number;
    } = {},
  ) {}

  async rerank(
    query: string,
    candidates: RerankCandidate[],
  ): Promise<RerankHit[]> {
    if (candidates.length === 0) return [];
    if (!query.trim()) {
      return new NoopReranker().rerank(query, candidates);
    }

    const fetchImpl = this.deps.fetchImpl ?? fetch;
    const sleep = this.deps.sleep ?? ((ms: number) => Bun.sleep(ms));
    const now = this.deps.now ?? Date.now;

    const deadline = now() + RERANK_RETRY_BUDGET_MS;
    const topN = Math.min(RERANK_TOP_K, candidates.length);
    const timeoutMs = this.deps.timeoutMs ?? RERANK_TIMEOUT_MS;

    let lastError: unknown = null;

    for (;;) {
      const rem = deadline - now();
      if (rem <= 0) break;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      timeoutId.unref?.();

      try {
        const response = await fetchImpl(RERANK_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: RERANK_MODEL,
            query,
            documents: candidates.map((c) => c.text),
            top_n: topN,
          }),
          signal: controller.signal,
        });

        if (response.ok) {
          const payload = (await response.json()) as CohereRerankResponse;
          return mapCohereResponse(payload, candidates, topN);
        }

        // 429 / 5xx — retry. Coerce into an Error-shape so rateLimitInfo can walk
        // the message.
        const bodyText = await response.text().catch(() => "");
        const err = new Error(
          `Cohere rerank ${response.status}: ${bodyText.slice(0, 500)}`,
        ) as Error & { status?: number };
        err.status = response.status;
        lastError = err;

        const limit = rateLimitInfo(err);
        if (!limit.isRateLimit || response.status >= 500) {
          if (response.status >= 500) {
            // Transient server error — small retry once.
            if (rem > RERANK_TRANSIENT_RETRY_MS) {
              await sleep(Math.min(RERANK_TRANSIENT_RETRY_MS, rem));
              continue;
            }
          }
          break;
        }

        const waitMs = Math.min(limit.retryMs, rem);
        await sleep(waitMs);
        continue;
      } catch (error) {
        lastError = error;
        // AbortError (timeout) or transient network — one short retry within
        // budget. We don't loop on transient errors: a flake is usually a
        // single connection hiccup, and the budget is short (15 s) by design.
        if (rem > RERANK_TRANSIENT_RETRY_MS) {
          await sleep(Math.min(RERANK_TRANSIENT_RETRY_MS, rem));
          continue;
        }
        break;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // Out of budget — fall back to Noop. A chat never fails because the reranker is down.
    void lastError;
    return new NoopReranker().rerank(query, candidates);
  }
}

/**
 * Map Cohere's `{ index, relevance_score }` results back to candidate ids.
 *
 * Cohere may return fewer than `top_n` results, and the indexes point into the
 * submitted `documents` array (which is built in candidate order). Pad any
 * missing candidates with their original RRF score so the prompt sees a full
 * top-K.
 */
function mapCohereResponse(
  payload: CohereRerankResponse,
  candidates: RerankCandidate[],
  topN: number,
): RerankHit[] {
  const indexed = (payload.results ?? []).filter(
    (r): r is { index: number; relevance_score: number } =>
      Number.isInteger(r.index) &&
      typeof r.relevance_score === "number" &&
      r.index >= 0 &&
      r.index < candidates.length,
  );

  // Dedupe hits by id keeping the highest relevance score.
  const bestById = new Map<string, { id: string; rerankScore: number; firstStageScore: number }>();

  for (const r of indexed) {
    const candidate = candidates[r.index];
    const prev = bestById.get(candidate.id);

    if (!prev || r.relevance_score > prev.rerankScore) {
      bestById.set(candidate.id, {
        id: candidate.id,
        rerankScore: r.relevance_score,
        firstStageScore: candidate.score,
      });
    }
  }

  const hits = [...bestById.values()];

  // Pad with remaining candidates (in original RRF order) if Cohere returned
  // fewer than top_n.
  if (hits.length < topN) {
    const seen = new Set(hits.map((h) => h.id));
    const sorted = sortCandidatesStable(candidates);

    for (const c of sorted) {
      if (hits.length >= topN) break;
      if (seen.has(c.id)) continue;
      hits.push({
        id: c.id,
        rerankScore: 0,
        firstStageScore: c.score,
      });
      seen.add(c.id);
    }
  }

  return sortHitsStable(hits).slice(0, topN);
}

// ---------------------------------------------------------------------------
// CosineReranker — keyless precision pass over the hybrid pool (Fix C1).
//
// RRF fusion orders by rank, which buries single-sentence evidence behind
// generically-similar chunks. This stage re-scores the pool by dense cosine
// similarity blended with the first-stage RRF score, so keyword-driven hits
// keep their standing while dense precision breaks the ties RRF cannot.
//
// Cost: 1 query embedding (embedding quota, never the generation wall) + 1
// Qdrant vector read. No LLM calls, no keys, no new infra. Any failure
// degrades to noop ordering — the pipeline's fail-open contract holds.
//
// Multi-tenancy: vectors are fetched through a userId-filtered scroll, and
// only for point IDs derived from the already-filtered retrieval output,
// so no cross-tenant vectors are ever readable here.
// ---------------------------------------------------------------------------

// Default 1.0 (pure dense cosine): measured over 29/32 rag10 questions,
// alpha=1.0 converted 8/10 baseline misses (incl. both pool=1/top8=0
// ordering failures) with 19/19 prior passes held, while 0.7 converted
// none. Override per environment via COSINE_RERANK_ALPHA.
export const COSINE_RERANK_ALPHA = Number(Bun.env.COSINE_RERANK_ALPHA ?? 1.0);

// MMR diversity weight: 1.0 = pure score order (today's behavior).
export const MMR_LAMBDA = Number(Bun.env.MMR_LAMBDA ?? 1.0);

/** Cosine similarity in [-1, 1]. Zero-vector safe (returns 0). Pure. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);

  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }

  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

type CosineDeps = {
  embedQuery: (text: string) => Promise<number[]>;
  fetchVectors: (
    userId: string,
    pointIds: string[],
  ) => Promise<Map<string, number[]>>;
};

function defaultEmbedQuery(text: string): Promise<number[]> {
  return generateEmbedding({ text, taskType: "RETRIEVAL_QUERY" });
}

function denseOf(vector: unknown): number[] | null {
  if (Array.isArray(vector)) return vector as number[];
  if (vector && typeof vector === "object") {
    const named = (vector as Record<string, unknown>)[""];
    if (Array.isArray(named)) return named as number[];
  }
  return null;
}

async function defaultFetchVectors(
  userId: string,
  pointIds: string[],
): Promise<Map<string, number[]>> {
  const collection = Bun.env.QDRANT_COLLECTION;
  if (!collection) throw new Error("QDRANT_COLLECTION is not configured");

  const out = new Map<string, number[]>();
  const idToPoint = new Map<string, string>();

  // Candidate ids are `${documentId}:${chunkIndex}`; recompute the
  // deterministic point UUIDs the ingest path used.
  for (const candidateId of new Set(pointIds)) {
    const idx = candidateId.lastIndexOf(":");
    if (idx <= 0) continue;
    const chunkIndex = Number(candidateId.slice(idx + 1));
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) continue;
    try {
      idToPoint.set(
        buildChunkPointId(candidateId.slice(0, idx), chunkIndex),
        candidateId,
      );
    } catch {
      continue;
    }
  }

  if (idToPoint.size === 0) return out;

  // Scroll (not retrieve) so the userId filter stays mandatory — the same
  // tenancy boundary as every other Qdrant read in this codebase.
  const res = await qdrantClient.scroll(collection, {
    filter: {
      must: [
        { key: "userId", match: { value: userId } },
        { has_id: [...idToPoint.keys()] },
      ],
    },
    limit: idToPoint.size,
    with_payload: false,
    with_vector: true,
  });

  for (const point of res.points as Array<{
    id: string | number;
    vector?: unknown;
  }>) {
    const candidateId = idToPoint.get(String(point.id));
    const dense = denseOf(point.vector);
    if (candidateId && dense) out.set(candidateId, dense);
  }

  return out;
}

function noopOrder(candidates: RerankCandidate[]): RerankHit[] {
  return [...candidates]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((c) => ({ id: c.id, score: c.score }));
}

/**
 * Greedy MMR order over pre-scored hits. lambda=1 reproduces score order
 * exactly (same comparator as sortHitsStable); lower values demote chunks
 * near-duplicate to already-picked ones. Chunks without vectors carry no
 * diversity penalty (fail-open). Pure.
 */
export function mmrOrder(
  hits: { id: string; rerankScore: number; firstStageScore: number }[],
  vecs: Map<string, number[]>,
  lambda: number,
): { id: string; rerankScore: number; firstStageScore: number }[] {
  const remaining = [...hits].sort((a, b) => {
    if (b.rerankScore !== a.rerankScore) return b.rerankScore - a.rerankScore;
    if (b.firstStageScore !== a.firstStageScore) {
      return b.firstStageScore - a.firstStageScore;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const picked: typeof hits = [];
  const pickedVecs: number[][] = [];
  while (remaining.length > 0) {
    let best = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      let sim = 0;
      const v = vecs.get(c.id);
      if (v) {
        for (const pv of pickedVecs) {
          const s = cosineSimilarity(v, pv);
          if (s > sim) sim = s;
        }
      }
      const val = lambda * c.rerankScore - (1 - lambda) * sim;
      if (val > bestVal) {
        bestVal = val;
        best = i;
      }
    }
    const [next] = remaining.splice(best, 1);
    picked.push(next);
    const nv = vecs.get(next.id);
    if (nv) pickedVecs.push(nv);
  }
  return picked;
}

export class CosineReranker implements Reranker {
  readonly name = "cosine" as const;

  constructor(
    private deps?: Partial<CosineDeps>,
    private alpha: number = COSINE_RERANK_ALPHA,
    private lambda: number = MMR_LAMBDA,
  ) {}

  async rerank(
    query: string,
    candidates: RerankCandidate[],
    opts?: { userId?: string },
  ): Promise<RerankHit[]> {
    try {
      const userId = opts?.userId;
      if (!userId || candidates.length === 0 || !query.trim()) {
        return noopOrder(candidates);
      }

      const embed = this.deps?.embedQuery ?? defaultEmbedQuery;
      const fetch = this.deps?.fetchVectors ?? defaultFetchVectors;

      // Score against the best of question + variants: a chunk retrieved by
      // a component subquery ("current liabilities") must be judged against
      // that subquery, not punished for missing the original wording
      // ("quick ratio"). Dedupes identical texts to save embedding calls.
      const queryTexts = [query, ...(opts?.variants ?? [])];
      const seen = new Set<string>();
      const qvecs: number[][] = [];
      for (const text of queryTexts) {
        const key = text.trim().toLowerCase().replace(/\s+/g, " ");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        qvecs.push(await embed(text));
      }
      const vecs = await fetch(
        userId,
        candidates.map((c) => c.id),
      );

      // Min-max normalize first-stage scores so the blend is scale-free.
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of candidates) {
        if (c.score < lo) lo = c.score;
        if (c.score > hi) hi = c.score;
      }
      const span = hi - lo;

      const hits = candidates.map((c) => {
        const vec = vecs.get(c.id);
        let cos = 0;
        if (vec) {
          for (const qvec of qvecs) {
            const s = cosineSimilarity(qvec, vec);
            if (s > cos) cos = s;
          }
        }
        const rrf = span > 0 ? (c.score - lo) / span : 1;
        return {
          id: c.id,
          rerankScore: this.alpha * cos + (1 - this.alpha) * rrf,
          firstStageScore: c.score,
        };
      });

      return mmrOrder(hits, vecs, this.lambda).map((h) => ({
        id: h.id,
        score: h.rerankScore,
      }));
    } catch {
      return noopOrder(candidates);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory — picks the right implementation based on env + key
// ---------------------------------------------------------------------------

export function createReranker(): Reranker {
  if (!RERANK_ENABLED) return new NoopReranker();

  if ((Bun.env.RERANKER ?? "").toLowerCase() === "cosine") {
    return new CosineReranker();
  }

  const key = Bun.env.COHERE_API_KEY;

  if (!key || !key.trim()) return new NoopReranker();

  return new CohereReranker(key);
}

// ---------------------------------------------------------------------------
// Pure mappers exposed for the pipeline + tests
// ---------------------------------------------------------------------------

/**
 * Truncate every candidate's text. Pure helper exposed so the pipeline can
 * build the rerank input without re-implementing the cap.
 */
export function candidatesForScoring(
  candidates: RerankCandidate[],
): RerankCandidate[] {
  return candidates.map((c) => ({
    id: c.id,
    score: c.score,
    text: truncateForScoring(c.text),
  }));
}
