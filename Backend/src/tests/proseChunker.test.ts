import { describe, expect, test } from "bun:test";
import { chunkProseRun } from "../services/chunking/proseChunker";

describe("proseChunker", () => {
  test("short prose: sentence-aligned, exact slice", () => {
    const run = "The Company operates in one segment. It sells widgets worldwide. Revenue grew 10%.";
    const pieces = chunkProseRun(run);
    expect(pieces.length).toBeGreaterThan(0);
    for (const p of pieces) {
      expect(run.slice(p.startOffset, p.endOffset)).toBe(p.text);
    }
    // Coverage: every sentence start appears in some piece.
    for (const sentence of ["one segment", "widgets worldwide", "grew 10%"]) {
      expect(pieces.some((p) => p.text.includes(sentence))).toBe(true);
    }
  });

  test("empty run → []", () => {
    expect(chunkProseRun("   ")).toEqual([]);
  });

  test("long prose splits under the token cap with monotonic offsets", () => {
    const run = Array.from(
      { length: 60 },
      (_, i) => `Sentence number ${i} carries a complete financial thought about quarter ${i}.`,
    ).join(" ");
    const pieces = chunkProseRun(run);
    expect(pieces.length).toBeGreaterThan(1);
    let prev = -1;
    for (const p of pieces) {
      expect(run.slice(p.startOffset, p.endOffset)).toBe(p.text);
      expect(p.startOffset).toBeGreaterThanOrEqual(prev);
      prev = p.startOffset;
    }
  });

  test("unicode offsets exact-slice (₹, 日本語, emoji)", () => {
    const run = "Revenue was ₹13,420 crore. 日本語の開示があります. Growth 📈 continued.";
    for (const p of chunkProseRun(run)) {
      expect(run.slice(p.startOffset, p.endOffset)).toBe(p.text);
    }
  });
});
