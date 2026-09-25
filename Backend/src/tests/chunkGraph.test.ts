import { describe, expect, test } from "bun:test";
import { PARENT_TEXT_CAP } from "../services/chunking/constants";
import { buildParents } from "../services/chunking/chunkGraph";
import type { Chunk } from "../services/chunking/types";

function chunk(over: Partial<Chunk> = {}): Chunk {
  return {
    chunkIndex: 0,
    kind: "prose",
    text: "body",
    startOffset: 0,
    endOffset: 4,
    pageStart: 1,
    pageEnd: 1,
    sectionPath: ["A"],
    parentId: null,
    parentText: "",
    statementType: "other",
    consolidationScope: "unspecified",
    ...over,
  };
}

describe("chunkGraph", () => {
  test("ordinal parentIds group sections; identical titles stay unique", () => {
    const flat = [
      chunk({ text: "a1", sectionPath: ["Notes"] }),
      chunk({ text: "a2", sectionPath: ["Notes"] }),
      chunk({ text: "b1", sectionPath: ["Other", "Notes"] }),
    ];
    const out = buildParents(flat, "doc1");
    expect(out[0]!.parentId).toBe("doc1:section:0");
    expect(out[1]!.parentId).toBe("doc1:section:0");
    expect(out[2]!.parentId).toBe("doc1:section:1");
    expect(out[0]!.parentText).toBe("a1\na2");
    expect(out[2]!.parentText).toBe("b1");
  });

  test("long sections capped; single oversized child keeps full text", () => {
    const big = "x".repeat(PARENT_TEXT_CAP + 100);
    const flat = [
      chunk({ text: "a", sectionPath: ["S"] }),
      chunk({ text: big, sectionPath: ["S"] }),
    ];
    const out = buildParents(flat, "doc1", { parentTextCap: 10, sectionBudgetChars: 10 });
    expect(out[0]!.parentText.length).toBeLessThanOrEqual(10);

    const solo = buildParents([chunk({ text: big, sectionPath: ["S"] })], "doc1", {
      parentTextCap: 10,
      sectionBudgetChars: 10,
    });
    expect(solo[0]!.parentText).toBe(big);
  });

  test("table chunks join the preceding chunk's parent (balance-sheet triple)", () => {
    const flat = [
      chunk({ text: "Consolidated Balance Sheets", sectionPath: ["Consolidated Balance Sheets"] }),
      chunk({
        kind: "table",
        text: "Cash and cash equivalents $ 2,605",
        sectionPath: ["Current assets"],
      }),
      chunk({
        kind: "table",
        text: "Debt maturing within one year $ 9,963",
        sectionPath: ["Current liabilities"],
      }),
    ];
    const out = buildParents(flat, "doc1");
    expect(out[0]!.parentId).toBe(out[1]!.parentId);
    expect(out[1]!.parentId).toBe(out[2]!.parentId);
    for (const n of ["2,605", "9,963", "Consolidated Balance Sheets"]) {
      expect(out[0]!.parentText).toContain(n);
    }
  });

  test("table chunk opening a document keeps its own parent", () => {
    const flat = [chunk({ kind: "table", text: "Cash $ 1", sectionPath: ["Assets"] })];
    const out = buildParents(flat, "doc1");
    expect(out[0]!.parentId).toBe("doc1:section:0");
    expect(out[0]!.parentText).toBe("Cash $ 1");
  });

  test("deterministic across runs", () => {
    const flat = [chunk({ text: "a", sectionPath: ["S"] }), chunk({ text: "b", sectionPath: ["T"] })];
    expect(buildParents(flat, "doc1")).toEqual(buildParents(flat, "doc1"));
  });
});
