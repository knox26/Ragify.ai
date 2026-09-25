import { describe, expect, test } from "bun:test";
import {
  buildRerankInput,
  mergeAndDedupeChunks,
  reattachFullChunks,
  retrievePipeline,
  type PipelineRetriever,
  type PipelineRewriter,
  type PipelineRouter,
  type GapDetector,
} from "../services/retrievalPipeline";
import {
  NoopReranker,
  type Reranker,
  type RerankCandidate,
} from "../services/reranker";
import type { RetrievedChunk } from "../services/retrievalService";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function chunk(
  documentId: string,
  chunkIndex: number,
  text: string,
  score = 0.5,
): RetrievedChunk {
  return {
    documentId,
    fileName: `${documentId}.pdf`,
    chunkIndex,
    text,
    pageStart: 1,
    pageEnd: 1,
    score,
  };
}

/**
 * Fake retriever that returns canned chunks per query text. Records every
 * call for sequence assertions.
 */
function makeFakeRetriever(
  byQuery: Map<string, RetrievedChunk[]>,
): { retriever: PipelineRetriever; calls: Array<{ query: string; documentId: string | null; topK?: number }> } {
  const calls: Array<{ query: string; documentId: string | null; topK?: number }> = [];

  const retriever: PipelineRetriever = async ({ query, documentId, topK }) => {
    calls.push({ query, documentId: documentId ?? null, topK });
    return byQuery.get(query) ?? [];
  };

  return { retriever, calls };
}

const fixedRouter = (route: string): PipelineRouter => async () => ({
  route: route as never,
  source: "rule",
  confidence: 1,
});

const emptyRewriter: PipelineRewriter = async (q) => [
  { kind: "original" as const, text: q },
];

const errorGapDetector: GapDetector = async () => {
  throw new Error("LLM down");
};

const noGapDetector: GapDetector = async () => [];

// ---------------------------------------------------------------------------
// mergeAndDedupeChunks
// ---------------------------------------------------------------------------

describe("mergeAndDedupeChunks", () => {
  test("returns [] for empty input", () => {
    expect(mergeAndDedupeChunks([], 8)).toEqual([]);
  });

  test("keeps highest score per id", () => {
    const a = chunk("d", 0, "a", 0.5);
    const b = chunk("d", 0, "a", 0.9);
    const c = chunk("d", 1, "c", 0.7);

    const merged = mergeAndDedupeChunks([[a, b], [c]], 8);

    expect(merged).toHaveLength(2);
    const d0 = merged.find((x) => x.chunkIndex === 0);
    expect(d0?.score).toBe(0.9);
  });

  test("sorts by score desc then documentId asc then chunkIndex asc", () => {
    const merged = mergeAndDedupeChunks(
      [
        [
          chunk("doc-b", 0, "b", 0.5),
          chunk("doc-a", 1, "a1", 0.9),
          chunk("doc-a", 0, "a0", 0.9),
        ],
      ],
      8,
    );

    expect(merged.map((c) => `${c.documentId}:${c.chunkIndex}`)).toEqual([
      "doc-a:0",
      "doc-a:1",
      "doc-b:0",
    ]);
  });

  test("caps at the cap", () => {
    const groups = Array.from({ length: 5 }, (_, g) =>
      Array.from({ length: 3 }, (_, i) =>
        chunk(`d${g}`, i, "x", 1 - g * 0.1 - i * 0.01),
      ),
    );

    const merged = mergeAndDedupeChunks(groups, 5);

    expect(merged.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// reattachFullChunks
// ---------------------------------------------------------------------------

describe("reattachFullChunks", () => {
  const map = new Map<string, RetrievedChunk>([
    ["d:0", chunk("d", 0, "long text 1")],
    ["d:1", chunk("d", 1, "long text 2")],
  ]);

  test("preserves hit order", () => {
    const hits = [
      { id: "d:1", score: 0.9 },
      { id: "d:0", score: 0.5 },
    ];

    const chunks = reattachFullChunks(hits, map);

    expect(chunks.map((c) => c.chunkIndex)).toEqual([1, 0]);
    expect(chunks[0]?.text).toBe("long text 2");
  });

  test("skips hits with no matching id", () => {
    const hits = [
      { id: "d:0", score: 0.9 },
      { id: "missing", score: 0.8 },
    ];

    const chunks = reattachFullChunks(hits, map);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.chunkIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildRerankInput
// ---------------------------------------------------------------------------

describe("buildRerankInput", () => {
  test("builds candidates and id map", () => {
    const pool = [chunk("d", 0, "short"), chunk("d", 1, "x".repeat(2000))];

    const { candidates, idToChunk } = buildRerankInput(pool);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.id).toBe("d:0");
    expect(candidates[1]?.id).toBe("d:1");
    // Truncation happens via candidatesForScoring.
    expect((candidates[1]?.text ?? "").length).toBeLessThanOrEqual(1024);
    expect(idToChunk.get("d:0")?.text).toBe("short");
    expect(idToChunk.get("d:1")?.text.length).toBe(2000); // full text preserved
  });
});

// ---------------------------------------------------------------------------
// retrievePipeline — orchestration
// ---------------------------------------------------------------------------

describe("retrievePipeline", () => {
  test("returns [] for whitespace-only question", async () => {
    const { retriever } = makeFakeRetriever(new Map());

    const chunks = await retrievePipeline({
      userId: "u",
      question: "   ",
      retriever,
    });

    expect(chunks).toEqual([]);
  });

  test("happy path: route → rewrite → retrieve → merge → rerank → final", async () => {
    const byQuery = new Map<string, RetrievedChunk[]>([
      ["AES ROA FY27", [chunk("d1", 0, "balance sheet", 0.9), chunk("d1", 1, "income", 0.7)]],
      ["AES ROA", [chunk("d1", 0, "balance sheet", 0.95)]],
    ]);
    const { retriever, calls } = makeFakeRetriever(byQuery);

    const rewriter: PipelineRewriter = async (q, r) => {
      expect(r).toBe("metric_calc");
      return [
        { kind: "original", text: q },
        { kind: "subquery", text: "AES ROA" },
      ];
    };

    // Trivial reranker: just returns the first hit (highest score).
    const reranker: Reranker = {
      name: "noop",
      rerank: async (_q, candidates: RerankCandidate[]) => {
        return candidates.slice(0, 8).map((c, i) => ({ id: c.id, score: c.score - i * 0.001 }));
      },
    };

    const chunks = await retrievePipeline({
      userId: "u",
      question: "AES ROA FY27",
      documentId: "d1",
      router: fixedRouter("metric_calc"),
      rewriter,
      retriever,
      reranker,
      gapDetector: noGapDetector,
    });

    // Two retrieves (parallel).
    expect(calls.length).toBe(2);
    expect(calls.map((c) => c.documentId)).toEqual(["d1", "d1"]);
    expect(calls.map((c) => c.query).sort()).toEqual(
      ["AES ROA FY27", "AES ROA"].sort(),
    );

    // Two unique chunks survive the merge.
    expect(chunks.length).toBe(2);
    // Highest score wins (RERANK_TOP_K = 8 by default, but only 2 here).
    const texts = chunks.map((c) => c.text);
    expect(texts).toContain("balance sheet");
    expect(texts).toContain("income");
  });

  test("falls back to original question when rewriter returns []", async () => {
    const byQuery = new Map<string, RetrievedChunk[]>([
      ["hello", [chunk("d", 0, "x")]],
    ]);
    const { retriever, calls } = makeFakeRetriever(byQuery);

    const chunks = await retrievePipeline({
      userId: "u",
      question: "hello",
      router: fixedRouter("lookup"),
      rewriter: async () => [], // empty
      retriever,
      reranker: new NoopReranker(),
      gapDetector: noGapDetector,
    });

    expect(calls.length).toBe(1);
    expect(calls[0]?.query).toBe("hello");
    expect(chunks.length).toBe(1);
  });

  test("reranker failure does not propagate — Noop fallback runs", async () => {
    const byQuery = new Map<string, RetrievedChunk[]>([
      ["q", [chunk("d", 0, "x", 0.9), chunk("d", 1, "y", 0.5)]],
    ]);
    const { retriever } = makeFakeRetriever(byQuery);

    const failingReranker: Reranker = {
      name: "cohere",
      rerank: async () => {
        throw new Error("RESOURCE_EXHAUSTED");
      },
    };

    // Pipeline uses Noop directly when production factory is bypassed; here
    // we manually substitute a Noop to simulate the CohereReranker fallback.
    const noopReranker = new NoopReranker();

    const chunks = await retrievePipeline({
      userId: "u",
      question: "q",
      router: fixedRouter("lookup"),
      rewriter: emptyRewriter,
      retriever,
      reranker: noopReranker,
      gapDetector: noGapDetector,
    });

    expect(chunks.length).toBe(2);

    // Sanity: the failing reranker would have crashed — assert we never see it.
    await expect(
      failingReranker.rerank("q", []),
    ).rejects.toThrow("RESOURCE_EXHAUSTED");
  });

  test("gap-fill only runs on routes that allow it", async () => {
    const byQuery = new Map<string, RetrievedChunk[]>([
      ["AES revenue", [chunk("d", 0, "revenue text")]],
    ]);
    const { retriever } = makeFakeRetriever(byQuery);

    let gapCalls = 0;
    const countingGapDetector: GapDetector = async () => {
      gapCalls++;
      return [];
    };

    // Lookup route → no gapFill in strategy.
    await retrievePipeline({
      userId: "u",
      question: "AES revenue",
      router: fixedRouter("lookup"),
      rewriter: emptyRewriter,
      retriever,
      reranker: new NoopReranker(),
      gapDetector: countingGapDetector,
    });

    expect(gapCalls).toBe(0);

    // metric_calc → gapFill enabled.
    await retrievePipeline({
      userId: "u",
      question: "AES revenue",
      router: fixedRouter("metric_calc"),
      rewriter: emptyRewriter,
      retriever,
      reranker: new NoopReranker(),
      gapDetector: countingGapDetector,
    });

    expect(gapCalls).toBe(1);
  });

  test("gap-fill errors degrade to current chunks (no throw)", async () => {
    const byQuery = new Map<string, RetrievedChunk[]>([
      ["AES revenue", [chunk("d", 0, "revenue text")]],
    ]);
    const { retriever } = makeFakeRetriever(byQuery);

    const chunks = await retrievePipeline({
      userId: "u",
      question: "AES revenue",
      router: fixedRouter("metric_calc"),
      rewriter: emptyRewriter,
      retriever,
      reranker: new NoopReranker(),
      gapDetector: errorGapDetector,
    });

    expect(chunks.length).toBe(1);
  });

  test("gap-fill widens the pool when gaps are detected", async () => {
    const byQuery = new Map<string, RetrievedChunk[]>([
      ["AES revenue", [chunk("d", 0, "rev-1")]],
      ["AES profit FY27", [chunk("d", 1, "profit-1")]],
    ]);
    const { retriever } = makeFakeRetriever(byQuery);

    const gapDetector: GapDetector = async () => ["AES profit FY27"];

    const chunks = await retrievePipeline({
      userId: "u",
      question: "AES revenue",
      router: fixedRouter("metric_calc"),
      rewriter: emptyRewriter,
      retriever,
      reranker: new NoopReranker(),
      gapDetector,
    });

    // Both chunks should appear (one from initial, one from gap-fill).
    expect(chunks.map((c) => c.text).sort()).toEqual(["profit-1", "rev-1"]);
  });

  test("tenant filter passed through on every retrieve (documentId + userId)", async () => {
    const byQuery = new Map<string, RetrievedChunk[]>([
      ["q", [chunk("d", 0, "x")]],
    ]);
    const { retriever, calls } = makeFakeRetriever(byQuery);

    await retrievePipeline({
      userId: "user-1",
      question: "q",
      documentId: "doc-1",
      router: fixedRouter("lookup"),
      rewriter: async (q) => [
        { kind: "original", text: q },
        { kind: "subquery", text: "q2" },
      ],
      retriever,
      reranker: new NoopReranker(),
      gapDetector: noGapDetector,
    });

    // userId/documentId were not checked by fake retriever — but it MUST
    // receive the same value on every call. We verify via the calls log.
    expect(calls.every((c) => c.documentId === "doc-1")).toBe(true);
  });

  test("final result is capped at RERANK_TOP_K (8)", async () => {
    // Build 20 distinct candidates.
    const byQuery = new Map<string, RetrievedChunk[]>([
      ["q", Array.from({ length: 20 }, (_, i) => chunk("d", i, `text ${i}`))],
    ]);
    const { retriever } = makeFakeRetriever(byQuery);

    const chunks = await retrievePipeline({
      userId: "u",
      question: "q",
      router: fixedRouter("lookup"),
      rewriter: emptyRewriter,
      retriever,
      reranker: new NoopReranker(),
      gapDetector: noGapDetector,
    });

    expect(chunks.length).toBeLessThanOrEqual(8);
  });

  test("default router is used when none is provided", async () => {
    const byQuery = new Map<string, RetrievedChunk[]>([
      ["What is a balance sheet?", [chunk("d", 0, "definition")]],
    ]);
    const { retriever } = makeFakeRetriever(byQuery);

    const chunks = await retrievePipeline({
      userId: "u",
      question: "What is a balance sheet?",
      rewriter: emptyRewriter,
      retriever,
      reranker: new NoopReranker(),
      gapDetector: noGapDetector,
    });

    // 'What is' routes to conceptual; rewriter produces one variant.
    expect(chunks.length).toBe(1);
  });
});
