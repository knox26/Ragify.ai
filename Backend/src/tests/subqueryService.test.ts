import { describe, expect, test, spyOn } from "bun:test";
import * as chatService from "../services/chatService";
import { CHAT_TOP_K, type RetrievedChunk } from "../services/retrievalService";
import {
  SUB_QUERY_MAX,
  augmentCollectionSubqueries,
  mergeSubqueryChunks,
  parseSubqueries,
} from "../services/subqueryService";

describe("parseSubqueries", () => {
  const fallback = "original question";

  test("parses a clean JSON object", () => {
    const result = parseSubqueries(
      '{"subqueries": ["consolidated profit FY27", "standalone profit FY27"]}',
      fallback,
    );

    expect(result).toEqual([
      "consolidated profit FY27",
      "standalone profit FY27",
    ]);
  });

  test("strips code fences before parsing", () => {
    const result = parseSubqueries(
      '```json\n{"subqueries": ["profit"]}\n```',
      fallback,
    );

    expect(result).toEqual(["profit"]);
  });

  test("caps the number of subqueries", () => {
    const many = Array.from(
      { length: 10 },
      (_, i) => `query number ${i + 1}`,
    );

    const result = parseSubqueries(JSON.stringify({ subqueries: many }), fallback);

    expect(result.length).toBe(SUB_QUERY_MAX);
  });

  test("dedupes repeated subqueries", () => {
    const result = parseSubqueries(
      '{"subqueries": ["profit", "profit", "revenue"]}',
      fallback,
    );

    expect(result).toEqual(["profit", "revenue"]);
  });

  test("drops empty and non-string entries", () => {
    const result = parseSubqueries(
      '{"subqueries": ["profit", "", 42, null, "  "]}',
      fallback,
    );

    expect(result).toEqual(["profit"]);
  });

  test("falls back when there is no JSON object", () => {
    expect(parseSubqueries("Sorry, here are my thoughts...", fallback)).toEqual([
      fallback,
    ]);
  });

  test("falls back on malformed JSON", () => {
    expect(parseSubqueries('{"subqueries": [', fallback)).toEqual([fallback]);
  });

  test("falls back when subqueries is not an array", () => {
    expect(parseSubqueries('{"subqueries": "profit"}', fallback)).toEqual([
      fallback,
    ]);
  });

  test("falls back when subqueries array is empty", () => {
    expect(parseSubqueries('{"subqueries": []}', fallback)).toEqual([fallback]);
  });
});

describe("mergeSubqueryChunks", () => {
  function chunk(
    documentId: string,
    chunkIndex: number,
    score: number,
    text = "chunk text",
  ): RetrievedChunk {
    return {
      documentId,
      fileName: "doc.pdf",
      chunkIndex,
      text,
      pageStart: 1,
      pageEnd: 1,
      score,
    };
  }

  test("dedupes the same chunk surfaced by multiple subqueries, keeping max score", () => {
    const groups = [
      [chunk("doc-1", 0, 0.5), chunk("doc-1", 1, 0.4)],
      [chunk("doc-1", 0, 0.9), chunk("doc-2", 0, 0.3)],
    ];

    const merged = mergeSubqueryChunks(groups);

    expect(merged).toHaveLength(3);

    const doc1c0 = merged.find(
      (c) => c.documentId === "doc-1" && c.chunkIndex === 0,
    );

    expect(doc1c0?.score).toBe(0.9);
  });

  test("sorts by score descending", () => {
    const merged = mergeSubqueryChunks([
      [
        chunk("doc-a", 0, 0.2),
        chunk("doc-b", 0, 0.8),
        chunk("doc-c", 0, 0.5),
      ],
    ]);

    const scores = merged.map((c) => c.score);

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test("caps merged results", () => {
    const manyGroups = Array.from({ length: 5 }, (_, g) =>
      Array.from({ length: 4 }, (_, i) => chunk(`doc-${g}`, i, 1 - g * 0.1)),
    );

    const merged = mergeSubqueryChunks(manyGroups);

    expect(merged.length).toBeLessThanOrEqual(CHAT_TOP_K);
  });

  test("returns empty for empty input", () => {
    expect(mergeSubqueryChunks([])).toEqual([]);
  });
});

describe("decomposeQuery (via mocked generateText)", () => {
  test("returns parsed subqueries on success", async () => {
    const spy = spyOn(chatService, "generateText").mockResolvedValue(
      '{"subqueries": ["consolidated profit", "standalone profit"]}',
    );

    try {
      const { decomposeQuery } = await import("../services/subqueryService");
      const result = await decomposeQuery("Compare consolidated and standalone profit.");

      expect(result).toEqual(["consolidated profit", "standalone profit"]);
    } finally {
      spy.mockRestore();
    }
  });

  test("falls back to the original question when the LLM call throws", async () => {
    const spy = spyOn(chatService, "generateText").mockRejectedValue(
      new Error("Gemini down"),
    );

    try {
      const { decomposeQuery } = await import("../services/subqueryService");
      const result = await decomposeQuery("Original question");

      expect(result).toEqual(["Original question"]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("augmentCollectionSubqueries", () => {
  test("adds collection variant to how-annotated questions", () => {
    const out = augmentCollectionSubqueries("How is intent annotated?", [
      "How is intent annotated?",
    ]);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatch(/platform/);
  });

  test("skips when a collect variant already exists", () => {
    const subs = ["How is intent annotated?", "How was data collected?"];
    expect(augmentCollectionSubqueries("How is intent annotated?", subs)).toEqual(subs);
  });

  test("skips non-collection questions and full lists", () => {
    expect(augmentCollectionSubqueries("What was revenue?", ["What was revenue?"])).toEqual([
      "What was revenue?",
    ]);
    const full = ["a", "b", "c"].slice(0, SUB_QUERY_MAX);
    expect(augmentCollectionSubqueries("How is intent annotated?", full)).toEqual(full);
  });
});
