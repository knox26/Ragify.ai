import { describe, expect, test } from "bun:test";
import {
  hashDim,
  sparseVectorFor,
  SPARSE_DIM,
  SPARSE_VECTOR_NAME,
  tokenize,
} from "../services/sparseVectorService";

describe("tokenize", () => {
  test("keeps dotted tickers and hyphenated tokens intact", () => {
    expect(tokenize("How did TCS.NS and HDFC perform in Q1-FY27?")).toContain(
      "tcs.ns",
    );
    expect(tokenize("How did TCS.NS and HDFC perform in Q1-FY27?")).toContain(
      "hdfc",
    );
    expect(
      tokenize("How did TCS.NS and HDFC perform in Q1-FY27?"),
    ).toContain("q1-fy27");
  });

  test("lowercases, splits punctuation, drops stopwords", () => {
    const tokens = tokenize("The Revenue and Profit of 2026 increased.");

    expect(tokens).toContain("revenue");
    expect(tokens).toContain("profit");
    expect(tokens).toContain("2026");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("and");
    expect(tokens).not.toContain("of");
  });

  test("drops single chars and punctuation-only tokens", () => {
    expect(tokenize("a . ... ---")).toEqual([]);
  });

  test("numbers survive (year matching matters)", () => {
    expect(tokenize("year 2026 vs 2025")).toEqual(["year", "2026", "vs", "2025"]);
  });

  test("empty text yields no tokens", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("hashDim", () => {
  test("returns a dimension inside the configured range", () => {
    expect(hashDim("tcs")).toBeGreaterThanOrEqual(0);
    expect(hashDim("tcs")).toBeLessThan(SPARSE_DIM);
  });

  test("is deterministic across calls", () => {
    expect(hashDim("consolidated")).toBe(hashDim("consolidated"));
  });
});

describe("sparseVectorFor", () => {
  test("is deterministic and returns sorted indices", () => {
    const a = sparseVectorFor("TCS consolidated profit");
    const b = sparseVectorFor("TCS consolidated profit");

    expect(a.indices).toEqual(b.indices);
    expect(a.values).toEqual(b.values);
    expect([...a.indices]).toEqual([...a.indices].sort((x, y) => x - y));
  });

  test("a repeated term produces sqrt(tf) weighting", () => {
    const vec = sparseVectorFor("TCS TCS TCS revenue");

    // Each distinct token maps to exactly one dimension here.
    const tcsDim = hashDim("tcs");
    const tcsValue = vec.values[vec.indices.indexOf(tcsDim)];

    expect(tcsValue).toBeCloseTo(Math.sqrt(3), 5);

    const revDim = hashDim("revenue");
    const revValue = vec.values[vec.indices.indexOf(revDim)];

    expect(revValue).toBeCloseTo(1, 5);
  });

  test("stopword-only text yields an empty vector", () => {
    expect(sparseVectorFor("the and of for")).toEqual({
      indices: [],
      values: [],
    });
  });

  test("empty text yields an empty vector", () => {
    expect(sparseVectorFor("")).toEqual({ indices: [], values: [] });
  });

  test("SPARSE_VECTOR_NAME defaults to a sane value", () => {
    expect(SPARSE_VECTOR_NAME).toBe("text");
  });
});
