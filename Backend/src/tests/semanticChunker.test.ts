import { describe, expect, test } from "bun:test";
import {
  boundariesFromSimilarities,
  estimateTokens,
  semanticSplitRun,
  shouldSemanticSplit,
  splitSentences,
} from "../services/chunking/semanticChunker";

function fakeEmbed(topics: number[]): (texts: string[]) => Promise<number[][]> {
  // Deterministic 2-D vectors: topic 0 → [1,0], topic 1 → [0,1].
  return async (texts) =>
    texts.map((_, i) => {
      const t = topics[Math.min(i, topics.length - 1)] ?? 0;
      return t === 0 ? [1, 0] : [0, 1];
    });
}

const SENT_A =
  "Revenue recognition follows standard policy, with sales recorded on delivery, returns estimated monthly, controls reviewed quarterly, and disclosures checked annually";
const SENT_B =
  "Liquidity depends on operating cash flow, with credit lines remaining undrawn, covenants met comfortably, maturities laddered prudently, and buffers stress-tested yearly";
// ~40 tokens/sentence × 36+36 sentences: the similarity break accumulates past
// the CHILD_TOKEN_TARGET floor so the boundary fires deterministically.
const RUN = `${Array.from({ length: 36 }, () => `${SENT_A}.`).join(" ")} ${Array.from({ length: 36 }, () => `${SENT_B}.`).join(" ")}`;

describe("semanticChunker", () => {
  test("helpers: sentences, tokens, gate", () => {
    expect(splitSentences("A. B! C?").length).toBe(3);
    expect(estimateTokens("abcd")).toBe(1);
    expect(shouldSemanticSplit("short", 2)).toBe(false);
    expect(shouldSemanticSplit(RUN, splitSentences(RUN).length)).toBe(true);
  });

  test("boundary below threshold with target floor", () => {
    const sentences = Array.from({ length: 10 }, (_, i) => `Sentence ${i} with enough words to count.`);
    // Similar then a sharp topic break at gap 5.
    const sims = [0.95, 0.93, 0.96, 0.94, 0.2, 0.95, 0.94, 0.93];
    const boundaries = boundariesFromSimilarities(sims, sentences, {
      tokenTarget: 1,
      threshold: 0.75,
    });
    expect(boundaries).toContain(5);
  });

  test("no boundary when all similar", () => {
    const sentences = Array.from({ length: 8 }, (_, i) => `Sentence ${i} steady topic.`);
    expect(
      boundariesFromSimilarities(Array(7).fill(0.95), sentences, { tokenTarget: 1 }),
    ).toEqual([]);
  });

  test("split with injected embed; windows batched in one call", () => {
    let calls = 0;
    let batchSizes: number[] = [];
    const embed = async (texts: string[]) => {
      calls += 1;
      batchSizes.push(texts.length);
      // Topic break at window 12 — past the token-target floor.
      return fakeEmbed([...Array(12).fill(0), ...Array(24).fill(1)])(texts);
    };
    return semanticSplitRun(RUN, { embedTexts: embed }).then((pieces) => {
      expect(pieces).not.toBeNull();
      expect(pieces!.length).toBeGreaterThan(1);
      // One batched call, not one per window.
      expect(calls).toBe(1);
      expect(batchSizes[0]!).toBeGreaterThan(2);
      // Pieces partition the run sentences.
      const joined = pieces!.join(" ");
      expect(joined.length).toBeGreaterThan(RUN.length / 2);
    });
  });

  test("fail-open: embed throw → null", () => {
    return semanticSplitRun(RUN, {
      embedTexts: async () => {
        throw new Error("429");
      },
    }).then((pieces) => expect(pieces).toBeNull());
  });

  test("short run → null (token path owns it)", () => {
    return semanticSplitRun("Too short. Really.", {}).then((pieces) =>
      expect(pieces).toBeNull(),
    );
  });
});
