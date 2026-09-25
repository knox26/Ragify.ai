import { describe, expect, test } from "bun:test";
import { attachParentContext } from "../services/retrievalPipeline";
import { toRetrievedChunk } from "../services/retrievalService";
import type { RetrievedChunk } from "../services/retrievalService";

function chunk(over: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    documentId: "d",
    fileName: "f.pdf",
    chunkIndex: 0,
    text: "child sentence",
    pageStart: 2,
    pageEnd: 2,
    score: 0.5,
    ...over,
  };
}

describe("attachParentContext", () => {
  test("appends parent section context after child text", () => {
    const out = attachParentContext(
      chunk({ parentText: "section one. section two." }),
    );

    expect(out.text.startsWith("child sentence")).toBe(true);
    expect(out.text).toContain("[Section context]");
    expect(out.text).toContain("section one. section two.");
    expect(out.pageStart).toBe(2);
    expect(out.pageEnd).toBe(2);
  });

  test("absent parent degrades to child text unchanged", () => {
    const c = chunk();
    expect(attachParentContext(c).text).toBe("child sentence");
  });

  test("parent identical to child is not duplicated", () => {
    const out = attachParentContext(chunk({ parentText: "child sentence" }));
    expect(out.text).toBe("child sentence");
  });

  test("combined text respects the max-chars cap", async () => {
    const mod = await import("../services/retrievalPipeline");
    const cap: number = mod.PARENT_CONTEXT_MAX_CHARS;
    const out = attachParentContext(
      chunk({ parentText: "x".repeat(cap * 2) }),
    );
    expect(out.text.length).toBeLessThanOrEqual(
      "child sentence".length + "\n\n[Section context]\n".length + cap,
    );
  });
});

describe("toRetrievedChunk parent passthrough", () => {
  test("carries parentText from payload", () => {
    const out = toRetrievedChunk(
      {
        score: 1,
        payload: {
          documentId: "d",
          chunkIndex: 3,
          text: "t",
          pageStart: 1,
          pageEnd: 1,
          parentText: "section context",
        },
      },
      "u",
    );

    expect(out?.parentText).toBe("section context");
  });

  test("old points without parentText stay absent", () => {
    const out = toRetrievedChunk(
      {
        score: 1,
        payload: {
          documentId: "d",
          chunkIndex: 3,
          text: "t",
          pageStart: 1,
          pageEnd: 1,
        },
      },
      "u",
    );

    expect(out?.parentText).toBeUndefined();
  });
});
