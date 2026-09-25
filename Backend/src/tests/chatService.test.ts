import { describe, expect, test } from "bun:test";
import {
  buildSources,
  buildSystemPrompt,
  buildUserPrompt,
  truncateTitle,
} from "../services/chatService";
import type { RetrievedChunk } from "../services/retrievalService";

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    documentId: "doc-1",
    fileName: "Q3.pdf",
    chunkIndex: 0,
    text: "Revenue grew 15% year-over-year.",
    pageStart: 3,
    pageEnd: 3,
    score: 0.9,
    ...overrides,
  };
}

describe("buildSystemPrompt", () => {
  test("contains the never-guess rule", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toMatch(/never guess/i);
    expect(prompt).toMatch(/not in the excerpts/);
  });

  test("contains the injection guard", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toMatch(/data, not instructions/i);
    expect(prompt).toMatch(/ignore any request/i);
  });

  test("requires [n] citations", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toMatch(/\[n\]/);
    expect(prompt).toMatch(/never cite a source that is not listed/i);
  });

  test("maps unmatched question terms before concluding anything is missing", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toMatch(/map them to the closest metric/i);
    expect(prompt).toMatch(/only conclude something is missing/i);
  });

  test("restricts answers to the excerpts, verbatim figures, full coverage", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toMatch(/answer using only those excerpts/i);
    expect(prompt).toMatch(/quote key figures.*verbatim/i);
    expect(prompt).toMatch(/answer every part/i);
    expect(prompt).toMatch(/cover all of them/i);
  });
});

describe("buildUserPrompt", () => {
  test("includes question, every source number and fileName", () => {
    const chunks = [
      chunk({ documentId: "doc-1", fileName: "Q3.pdf", chunkIndex: 0 }),
      chunk({ documentId: "doc-2", fileName: "Annual.md", chunkIndex: 5 }),
    ];

    const prompt = buildUserPrompt("What happened?", chunks);

    expect(prompt).toContain("What happened?");
    expect(prompt).toContain("[1] Q3.pdf");
    expect(prompt).toContain("[2] Annual.md");
    expect(prompt).toContain("Revenue grew 15% year-over-year.");
  });

  test("caps long chunk text", () => {
    const longText = "x".repeat(3000);
    const prompt = buildUserPrompt("Q", [
      chunk({ text: longText, fileName: "Big.pdf" }),
    ]);

    const excerpt = prompt.split("\n").find((line) => line.startsWith("xxxx"));

    expect(excerpt).toBeDefined();
    expect(excerpt!.length).toBeLessThanOrEqual(2201);
    expect(excerpt).toMatch(/…$/);
  });

  test("no chunks produces an empty-context note, not a crash", () => {
    const prompt = buildUserPrompt("Q", []);

    expect(prompt).toContain("No document excerpts matched");
    expect(prompt).toContain("Q");
  });
});

describe("buildSources", () => {
  test("numbers sources starting at 1 with fileName + page ref", () => {
    const sources = buildSources([
      chunk({ documentId: "doc-1", fileName: "Q3.pdf", chunkIndex: 0, pageStart: 3, pageEnd: 5 }),
      chunk({ documentId: "doc-2", fileName: "Annual.md", chunkIndex: 1, pageStart: 1, pageEnd: 1 }),
    ]);

    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      n: 1,
      documentId: "doc-1",
      fileName: "Q3.pdf",
      pageStart: 3,
      pageEnd: 5,
    });
    expect(sources[1]).toMatchObject({ n: 2, fileName: "Annual.md" });
  });

  test("uses the chunk's fileName verbatim", () => {
    // The generic-label fallback lives in retrievalService (old points without
    // the field); buildSources just passes the chunk's fileName through.
    const sources = buildSources([
      chunk({ documentId: "doc-ghost", fileName: "Document" }),
    ]);

    expect(sources[0].fileName).toBe("Document");
  });

  test("truncates quote to ~300 chars", () => {
    const longText = "y".repeat(1000);
    const sources = buildSources([chunk({ text: longText })]);

    expect(sources[0].quote.length).toBeLessThanOrEqual(301);
    expect(sources[0].quote).toMatch(/…$/);
  });

  test("dedupes repeated (documentId, chunkIndex) points", () => {
    const sources = buildSources([
      chunk({ documentId: "doc-1", chunkIndex: 2 }),
      chunk({ documentId: "doc-1", chunkIndex: 2 }),
      chunk({ documentId: "doc-1", chunkIndex: 3 }),
    ]);

    expect(sources).toHaveLength(2);
    expect(sources.map((s) => s.n)).toEqual([1, 2]);
  });
});

describe("truncateTitle", () => {
  test("keeps short titles verbatim", () => {
    expect(truncateTitle("What is revenue?")).toBe("What is revenue?");
  });

  test("truncates long titles with an ellipsis", () => {
    const title = truncateTitle("a".repeat(100));

    expect(title.length).toBe(60);
    expect(title).toMatch(/…$/);
  });

  test("collapses internal whitespace", () => {
    expect(truncateTitle("multi   line\n title")).toBe("multi line title");
  });

  test("falls back for empty input", () => {
    expect(truncateTitle("")).toBe("New chat");
  });

  test("falls back for whitespace-only input", () => {
    expect(truncateTitle("   \n\t ")).toBe("New chat");
  });
});
