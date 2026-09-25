import { describe, expect, test } from "bun:test";
import {
  CosineReranker,
  cosineSimilarity,
  type RerankCandidate,
} from "../services/reranker";

function candidate(
  id: string,
  score: number,
): RerankCandidate & { __vec: number[] } {
  // __vec is test-only plumbing: the fake fetchVectors maps candidate id
  // back to a vector, so the suite never touches Qdrant or Gemini.
  return { id, score, text: id, __vec: [0, 0] } as RerankCandidate & {
    __vec: number[];
  };
}

function depsWith(vecById: Record<string, number[]>, queryVec = [1, 0]) {
  return {
    embedQuery: async (_text: string) => queryVec,
    fetchVectors: async (_userId: string, ids: string[]) => {
      const out = new Map<string, number[]>();
      for (const id of ids) {
        if (vecById[id]) out.set(id, vecById[id]);
      }
      return out;
    },
  };
}

describe("cosineSimilarity", () => {
  test("identical vectors score 1, orthogonal 0", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  test("zero-vector safe", () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
  });
});

describe("CosineReranker", () => {
  test("dense precision outranks first-stage order", async () => {
    const candidates = [candidate("d:0", 0.9), candidate("d:1", 0.1)];
    const r = new CosineReranker(
      depsWith({ "d:0": [0, 1], "d:1": [1, 0] }),
      0.7,
    );

    const hits = await r.rerank("q", candidates, { userId: "u" });

    // d:1 matches the query vector exactly despite the lower RRF score.
    expect(hits.map((h) => h.id)).toEqual(["d:1", "d:0"]);
  });

  test("alpha=0 reproduces first-stage order", async () => {
    const candidates = [candidate("d:0", 0.9), candidate("d:1", 0.1)];
    const r = new CosineReranker(
      depsWith({ "d:0": [0, 1], "d:1": [1, 0] }),
      0,
    );

    const hits = await r.rerank("q", candidates, { userId: "u" });

    expect(hits.map((h) => h.id)).toEqual(["d:0", "d:1"]);
  });

  test("missing vectors keep RRF-relative standing", async () => {
    const candidates = [candidate("d:0", 0.9), candidate("d:1", 0.1)];
    const r = new CosineReranker(depsWith({}), 0.7);

    const hits = await r.rerank("q", candidates, { userId: "u" });

    expect(hits.map((h) => h.id)).toEqual(["d:0", "d:1"]);
  });

  test("fail-open: throwing deps and missing userId degrade to noop order", async () => {
    const candidates = [candidate("d:0", 0.2), candidate("d:1", 0.8)];
    const throwing = new CosineReranker({
      embedQuery: async () => {
        throw new Error("down");
      },
    });

    expect(
      (await throwing.rerank("q", candidates, { userId: "u" })).map((h) => h.id),
    ).toEqual(["d:1", "d:0"]);
    expect(
      (
        await new CosineReranker(depsWith({})).rerank("q", candidates)
      ).map((h) => h.id),
    ).toEqual(["d:1", "d:0"]);
  });

  test("empty candidates short-circuit", async () => {
    const r = new CosineReranker(depsWith({}));
    await expect(r.rerank("q", [], { userId: "u" })).resolves.toEqual([]);
  });
});

describe("CosineReranker variants", () => {
  test("component chunk is judged against its subquery, not the question", async () => {
    const candidates = [candidate("d:prose", 0.5), candidate("d:numbers", 0.5)];
    const vecById = { "d:prose": [1, 0], "d:numbers": [0, 1] };
    const r = new CosineReranker(
      {
        embedQuery: async (text: string) =>
          text === "current liabilities" ? [0, 1] : [1, 0],
        fetchVectors: async (_userId: string, ids: string[]) => {
          const out = new Map<string, number[]>();
          for (const id of ids) {
            if (vecById[id]) out.set(id, vecById[id]);
          }
          return out;
        },
      },
      1.0,
    );
    // Question-only: prose wins. With the variant: numbers win.
    const qOnly = await r.rerank("quick ratio", candidates, { userId: "u" });
    expect(qOnly.map((h) => h.id)[0]).toBe("d:prose");
    const withVar = await r.rerank("quick ratio", candidates, {
      userId: "u",
      variants: ["current liabilities"],
    });
    expect(withVar.map((h) => h.id)[0]).toBe("d:numbers");
  });

  test("no variants behaves exactly like before", async () => {
    const candidates = [candidate("d:0", 0.9), candidate("d:1", 0.1)];
    const r = new CosineReranker(depsWith({ "d:0": [0, 1], "d:1": [1, 0] }), 0.7);
    const hits = await r.rerank("q", candidates, { userId: "u" });
    expect(hits.map((h) => h.id)).toEqual(["d:1", "d:0"]);
  });
});

describe("CosineReranker MMR", () => {
  // a/b are near-duplicate overview chunks, c is the diverse value chunk.
  const vecs = { "d:a": [1, 0.1], "d:b": [1, 0.1], "d:c": [0, 1] };
  const cands = () => [candidate("d:a", 0.9), candidate("d:b", 0.8), candidate("d:c", 0.1)];

  test("lambda=1 reproduces score order", async () => {
    const r = new CosineReranker(depsWith(vecs), 1.0, 1.0);
    const hits = await r.rerank("q", cands(), { userId: "u" });
    expect(hits.map((h) => h.id)).toEqual(["d:a", "d:b", "d:c"]);
  });

  test("low lambda demotes the near-duplicate", async () => {
    const r = new CosineReranker(depsWith(vecs), 1.0, 0.1);
    const hits = await r.rerank("q", cands(), { userId: "u" });
    expect(hits.map((h) => h.id)).toEqual(["d:a", "d:c", "d:b"]);
  });
});
