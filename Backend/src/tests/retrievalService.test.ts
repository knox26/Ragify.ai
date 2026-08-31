import { describe, expect, test } from "bun:test";
import {
  buildHybridQuery,
  buildRetrievalFilter,
  toRetrievedChunk,
} from "../services/retrievalService";
import { SPARSE_VECTOR_NAME } from "../services/sparseVectorService";

describe("buildRetrievalFilter", () => {
  test("global chat includes userId only", () => {
    const filter = buildRetrievalFilter("user-1");

    expect(filter).toEqual({
      must: [{ key: "userId", match: { value: "user-1" } }],
    });
  });

  test("document-scoped includes userId + documentId", () => {
    const filter = buildRetrievalFilter("user-1", "doc-1");

    expect(filter).toEqual({
      must: [
        { key: "userId", match: { value: "user-1" } },
        { key: "documentId", match: { value: "doc-1" } },
      ],
    });
  });

  test("null documentId behaves like global chat", () => {
    expect(buildRetrievalFilter("user-1", null)).toEqual({
      must: [{ key: "userId", match: { value: "user-1" } }],
    });
  });

  test("userId condition always comes first", () => {
    const filter = buildRetrievalFilter("user-1", "doc-1");

    expect(filter.must[0]).toEqual({
      key: "userId",
      match: { value: "user-1" },
    });
  });

  test("userId is required — documentId alone is never emitted", () => {
    const filter = buildRetrievalFilter("user-1", "doc-1");

    const userIdConditions = filter.must.filter(
      (condition) => condition.key === "userId",
    );

    expect(userIdConditions).toHaveLength(1);
  });
});

describe("toRetrievedChunk", () => {
  const validPayload = {
    documentId: "doc-1",
    userId: "user-1",
    fileName: "synthetic-resume.docx",
    chunkIndex: 2,
    text: "Jordan Ashworth, BS Computer Science",
    pageStart: 1,
    pageEnd: 1,
  };

  test("reads fileName from the payload", () => {
    const chunk = toRetrievedChunk({ payload: validPayload, score: 0.93 }, "user-1");

    expect(chunk).toEqual({
      documentId: "doc-1",
      fileName: "synthetic-resume.docx",
      chunkIndex: 2,
      text: "Jordan Ashworth, BS Computer Science",
      pageStart: 1,
      pageEnd: 1,
      score: 0.93,
    });
  });

  test("falls back to generic label when fileName is missing (old points)", () => {
    const { fileName: _fileName, ...legacyPayload } = validPayload;

    const chunk = toRetrievedChunk({ payload: legacyPayload }, "user-1");

    expect(chunk?.fileName).toBe("Document");
  });

  test("returns null for a null payload", () => {
    expect(toRetrievedChunk({ payload: null }, "user-1")).toBeNull();
  });

  test("returns null for a payload missing required fields", () => {
    expect(
      toRetrievedChunk({ payload: { documentId: "doc-1", text: "hi" } }, "user-1"),
    ).toBeNull();
  });

  test("returns null for an empty text", () => {
    expect(
      toRetrievedChunk(
        { payload: { ...validPayload, text: "   " } },
        "user-1",
      ),
    ).toBeNull();
  });

  test("defaults a missing score to 0", () => {
    const chunk = toRetrievedChunk({ payload: validPayload }, "user-1");

    expect(chunk?.score).toBe(0);
  });
});

describe("buildHybridQuery", () => {
  const filter = buildRetrievalFilter("user-1");
  const vector = [0.1, 0.2, 0.3];
  const sparse = { indices: [4, 17], values: [1, 1] };

  test("runs dense + sparse prefetches and fuses with rrf", () => {
    const query = buildHybridQuery({ vector, sparse, filter, topK: 8 });

    expect(query.prefetch).toHaveLength(2);
    expect(query.prefetch[0]).toEqual({
      query: vector,
      limit: 24,
      filter,
    });
    expect(query.prefetch[1]).toEqual({
      query: sparse,
      limit: 24,
      filter,
      using: SPARSE_VECTOR_NAME,
    });
    expect(query.query).toEqual({ fusion: "rrf" });
    expect(query.limit).toBe(8);
    expect(query.with_payload).toBe(true);
  });

  test("prefetch limits scale 3x and overall limit is the requested topK", () => {
    const query = buildHybridQuery({ vector, sparse, filter, topK: 5 });

    expect(query.prefetch[0].limit).toBe(15);
    expect(query.prefetch[1].limit).toBe(15);
    expect(query.limit).toBe(5);
  });

  test("carries the tenancy filter on both prefetches and the fusion", () => {
    const query = buildHybridQuery({ vector, sparse, filter, topK: 3 });

    expect(query.filter).toBe(filter);
    expect(query.prefetch[0].filter).toBe(filter);
    expect(query.prefetch[1].filter).toBe(filter);
  });
});
