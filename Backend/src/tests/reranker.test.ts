import { describe, expect, spyOn, test } from "bun:test";
import {
  candidatesForScoring,
  CohereReranker,
  NoopReranker,
  RERANK_TOP_K,
  truncateForScoring,
  type RerankCandidate,
  type RerankHit,
} from "../services/reranker";

function makeCandidates(count: number): RerankCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `doc-${i}:${i}`,
    score: 1 - i * 0.01,
    text: `chunk number ${i} content ` + "x".repeat(2000),
  }));
}

// ---------------------------------------------------------------------------
// truncateForScoring / candidatesForScoring
// ---------------------------------------------------------------------------

describe("truncateForScoring", () => {
  test("returns the input unchanged when shorter than the cap", () => {
    expect(truncateForScoring("hello world")).toBe("hello world");
  });

  test("truncates past the cap", () => {
    const long = "a".repeat(2_000);
    const out = truncateForScoring(long);

    expect(out.length).toBe(1024);
    expect(out).toBe("a".repeat(1024));
  });
});

describe("candidatesForScoring", () => {
  test("truncates each candidate text but preserves id + score", () => {
    const input: RerankCandidate[] = [
      { id: "d:0", text: "x".repeat(5_000), score: 0.9 },
      { id: "d:1", text: "short", score: 0.5 },
    ];

    const out = candidatesForScoring(input);

    expect(out[0]?.text.length).toBe(1024);
    expect(out[1]?.text).toBe("short");
    expect(out[0]?.id).toBe("d:0");
    expect(out[0]?.score).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// NoopReranker
// ---------------------------------------------------------------------------

describe("NoopReranker", () => {
  test("returns [] for an empty pool", async () => {
    const r = new NoopReranker();
    expect(await r.rerank("q", [])).toEqual([]);
  });

  test("orders by score desc, id asc, capped to RERANK_TOP_K", async () => {
    const candidates: RerankCandidate[] = [
      { id: "d:z", score: 0.1, text: "z" },
      { id: "d:a", score: 0.5, text: "a" },
      { id: "d:b", score: 0.5, text: "b" },
      { id: "d:c", score: 0.9, text: "c" },
    ];

    const hits = await new NoopReranker().rerank("q", candidates);

    expect(hits.map((h) => h.id)).toEqual(["d:c", "d:a", "d:b", "d:z"]);
    expect(hits[0]?.score).toBe(0.9);
  });

  test("caps results at RERANK_TOP_K", async () => {
    const candidates = makeCandidates(20);
    const hits = await new NoopReranker().rerank("q", candidates);

    expect(hits.length).toBe(RERANK_TOP_K);
  });
});

// ---------------------------------------------------------------------------
// CohereReranker — uses an injected fetch + sleep + clock for determinism
// ---------------------------------------------------------------------------

type FetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

function makeFetch(
  handler: (url: string, init: RequestInit) => FetchResponse,
): { fetchImpl: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const recordedInit = init ?? {};
    calls.push({ url, init: recordedInit });

    const signal = recordedInit.signal as AbortSignal | undefined;
    if (signal?.aborted) {
      throw makeAbortError();
    }

    const response = handler(url, recordedInit);
    const wrappedResponse = new Promise<typeof response>((resolve, reject) => {
      if (signal) {
        signal.addEventListener(
          "abort",
          () => reject(makeAbortError()),
          { once: true },
        );
      }
      resolve(response);
    });

    return wrappedResponse;
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

function makeAbortError(): Error {
  const err = new Error("The operation was aborted.") as Error & { name: string };
  err.name = "AbortError";
  return err;
}

function cohereJson(results: Array<{ index: number; relevance_score: number }>): FetchResponse {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ results }),
    json: async () => ({ results }),
  };
}

function cohereError(status: number, body = ""): FetchResponse {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => ({ error: body }),
  };
}

describe("CohereReranker", () => {
  test("maps Cohere index→candidate id and uses relevance score", async () => {
    const candidates: RerankCandidate[] = [
      { id: "d:2", score: 0.9, text: "two" },
      { id: "d:0", score: 0.7, text: "zero" },
      { id: "d:1", score: 0.5, text: "one" },
    ];

    const { fetchImpl, calls } = makeFetch((_url, init) => {
      const body = JSON.parse(String(init.body));
      expect(body.documents).toEqual(["two", "zero", "one"]);
      expect(body.top_n).toBe(3);
      expect(body.model).toBe("rerank-v3.5");
      return cohereJson([
        { index: 2, relevance_score: 0.42 },
        { index: 0, relevance_score: 0.95 },
        { index: 1, relevance_score: 0.11 },
      ]);
    });

    const r = new CohereReranker("test-key", { fetchImpl, sleep: async () => {}, now: () => 0, timeoutMs: 100 });
    const hits = await r.rerank("query", candidates);

    expect(calls.length).toBe(1);
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer test-key",
    });
    // candidates: [d:2(0.9), d:0(0.7), d:1(0.5)]
    // Cohere: index2→d:1@0.42, index0→d:2@0.95, index1→d:0@0.11
    expect(hits.map((h) => h.id)).toEqual(["d:2", "d:1", "d:0"]);
    expect(hits[0]?.score).toBe(0.95);
  });

  test("returns [] when the candidate pool is empty", async () => {
    const r = new CohereReranker("k");
    expect(await r.rerank("q", [])).toEqual([]);
  });

  test("falls back to Noop for a whitespace query", async () => {
    const candidates: RerankCandidate[] = [
      { id: "d:0", score: 0.9, text: "x" },
      { id: "d:1", score: 0.4, text: "y" },
    ];

    const fetchImpl = (() => {
      throw new Error("fetch must not be called for empty query");
    }) as unknown as typeof fetch;

    const r = new CohereReranker("k", { fetchImpl, sleep: async () => {}, now: () => 0, timeoutMs: 100 });
    const hits = await r.rerank("   ", candidates);

    expect(hits.map((h) => h.id)).toEqual(["d:0", "d:1"]);
  });

  test("dedupes hits when Cohere returns duplicate indexes", async () => {
    const candidates: RerankCandidate[] = [
      { id: "d:a", score: 0.5, text: "a" },
      { id: "d:b", score: 0.3, text: "b" },
    ];

    const { fetchImpl } = makeFetch(() =>
      cohereJson([
        { index: 0, relevance_score: 0.7 },
        { index: 0, relevance_score: 0.9 },
        { index: 1, relevance_score: 0.2 },
      ]),
    );

    const r = new CohereReranker("k", { fetchImpl, sleep: async () => {}, now: () => 0, timeoutMs: 100 });
    const hits = await r.rerank("q", candidates);

    expect(hits.length).toBe(2);
    expect(hits[0]?.id).toBe("d:a");
    expect(hits[0]?.score).toBe(0.9); // max kept
  });

  test("pads with remaining candidates in RRF order when Cohere returns fewer hits", async () => {
    const candidates: RerankCandidate[] = [
      { id: "d:a", score: 0.9, text: "a" },
      { id: "d:b", score: 0.8, text: "b" },
      { id: "d:c", score: 0.7, text: "c" },
      { id: "d:d", score: 0.6, text: "d" },
      { id: "d:e", score: 0.5, text: "e" },
    ];

    const { fetchImpl } = makeFetch(() =>
      cohereJson([{ index: 2, relevance_score: 0.99 }]),
    );

    const r = new CohereReranker("k", { fetchImpl, sleep: async () => {}, now: () => 0, timeoutMs: 100 });
    const hits = await r.rerank("q", candidates);

    // topN = min(RERANK_TOP_K, candidates.length) = 5
    expect(hits.length).toBe(5);
    // d:c first (only hit with rerank score), then padding in RRF desc order.
    expect(hits.map((h) => h.id)).toEqual(["d:c", "d:a", "d:b", "d:d", "d:e"]);
  });

  test("falls back to Noop on 429 after exhausting the retry budget", async () => {
    const candidates: RerankCandidate[] = [
      { id: "d:a", score: 0.9, text: "a" },
      { id: "d:b", score: 0.4, text: "b" },
    ];

    let call = 0;
    const { fetchImpl } = makeFetch(() => {
      call++;
      return cohereError(429, `{"retryDelay":"20s"}`);
    });

    let nowMs = 0;
    const sleeps: number[] = [];
    const sleep = async (ms: number) => {
      sleeps.push(ms);
      nowMs += ms;
    };

    const r = new CohereReranker("k", {
      fetchImpl,
      sleep,
      now: () => nowMs,
      timeoutMs: 100,
    });

    const hits = await r.rerank("q", candidates);

    expect(call).toBeGreaterThanOrEqual(1);
    expect(hits.length).toBeGreaterThan(0);
    // Final ordering should match Noop (RRF desc, id asc).
    expect(hits[0]?.id).toBe("d:a");
  });

  test("falls back to Noop on timeout", async () => {
    const candidates: RerankCandidate[] = [
      { id: "d:a", score: 0.9, text: "a" },
      { id: "d:b", score: 0.4, text: "b" },
    ];

    const fetchImpl = (() => {
      throw new Error("fetch failed: timeout");
    }) as unknown as typeof fetch;

    // Advancing clock (like the 429 test): a frozen now() would keep
    // rem = deadline - now() above the retry threshold forever.
    let nowMs = 0;
    const sleep = async (ms: number) => {
      nowMs += ms;
    };

    const r = new CohereReranker("k", { fetchImpl, sleep, now: () => nowMs, timeoutMs: 100 });
    const hits = await r.rerank("q", candidates);

    // After timeout-bounded retries, fall back to Noop.
    expect(hits[0]?.id).toBe("d:a");
  });

  test("does not throw on non-rate-limit server errors — falls back to Noop", async () => {
    const candidates: RerankCandidate[] = [
      { id: "d:a", score: 0.9, text: "a" },
      { id: "d:b", score: 0.4, text: "b" },
    ];

    const { fetchImpl } = makeFetch(() => cohereError(500, "boom"));

    // Advancing clock: same frozen-clock hazard as the timeout test above.
    let nowMs = 0;
    const sleep = async (ms: number) => {
      nowMs += ms;
    };

    const r = new CohereReranker("k", { fetchImpl, sleep, now: () => nowMs, timeoutMs: 100 });
    const hits = await r.rerank("q", candidates);

    expect(hits[0]?.id).toBe("d:a");
  });

  test("sorts ties by first-stage score then id", async () => {
    const candidates: RerankCandidate[] = [
      { id: "d:b", score: 0.5, text: "b" },
      { id: "d:a", score: 0.7, text: "a" },
    ];

    const { fetchImpl } = makeFetch(() =>
      cohereJson([
        { index: 0, relevance_score: 0.5 },
        { index: 1, relevance_score: 0.5 },
      ]),
    );

    const r = new CohereReranker("k", { fetchImpl, sleep: async () => {}, now: () => 0, timeoutMs: 100 });
    const hits = await r.rerank("q", candidates);

    expect(hits.map((h) => h.id)).toEqual(["d:a", "d:b"]);
  });
});
