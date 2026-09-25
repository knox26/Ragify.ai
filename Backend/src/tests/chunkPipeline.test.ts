import { describe, expect, test } from "bun:test";
import { computeContentHash } from "../services/chunking/chunkPipeline";
import { chunkDocument } from "../services/chunking/chunkPipeline";
import { combinePages } from "../services/llamaDocumentService";
import type { ParsedPage } from "../parsers/parserTypes";

const PAGES: ParsedPage[] = [
  {
    pageNumber: 1,
    text: [
      "CONSOLIDATED BALANCE SHEETS",
      "Particulars      Consolidated   Standalone",
      "Revenue                13,420   12,100",
      "Expenses               11,020   10,300",
    ].join("\n"),
  },
  {
    // Page-break-split table: continuation rows WITHOUT a printed header —
    // the pipeline must re-attach page 1's headers (edge #5).
    pageNumber: 2,
    text: [
      "Revenue                14,100   13,642",
      "Net income              2,400    1,800",
      "",
      "NOTES TO FINANCIAL STATEMENTS",
      "The Company operates in one segment. It sells widgets worldwide.",
      "The year was strong across regions.",
    ].join("\n"),
  },
];

describe("chunkPipeline", () => {
  test("multi-page doc: sections, tables, sequential indexes, exact slices", async () => {
    const chunks = await chunkDocument(PAGES, "doc1", { semanticEnabled: false });
    expect(chunks.length).toBeGreaterThan(0);

    const combined = combinePages(PAGES).text;
    const indexes = chunks.map((c) => c.chunkIndex);
    expect(indexes).toEqual(indexes.map((_, i) => i));

    for (const c of chunks) {
      const slice = combined.slice(c.startOffset, c.endOffset);
      // Prefix-aware: text === heading/table prefix + exact slice.
      expect(slice.trim().length).toBeGreaterThan(0);
      expect(c.text.endsWith(slice)).toBe(true);
      expect(c.pageStart).toBeLessThanOrEqual(c.pageEnd);
      expect(c.parentId).toMatch(/^doc1:section:\d+$/);
      expect(c.parentText.length).toBeGreaterThan(0);
    }

    // Table rows detected as tables; notes section tagged.
    expect(chunks.some((c) => c.kind === "table")).toBe(true);
    const notes = chunks.filter((c) => c.sectionPath.some((s) => /notes/i.test(s)));
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((c) => c.statementType === "notes")).toBe(true);

    // Page-2 continuation table re-carries headers.
    const page2Tables = chunks.filter((c) => c.kind === "table" && c.pageStart === 2);
    expect(page2Tables.length).toBeGreaterThan(0);
    expect(page2Tables[0]!.text).toContain("Particulars");

    // Determinism.
    const again = await chunkDocument(PAGES, "doc1", { semanticEnabled: false });
    expect(again).toEqual(chunks);
  });

  test("semanticEnabled:true with injected embed splits long runs", async () => {
    const run = `${Array.from({ length: 20 }, () => "Policy text about revenue recognition rules and controls, applied quarterly, reviewed annually, documented fully.").join(" ")} ${Array.from({ length: 20 }, () => "Cash flow depends on collections timing and credit terms, tracked weekly, forecasted monthly, reported quarterly.").join(" ")}`;
    const pages: ParsedPage[] = [{ pageNumber: 1, text: run }];
    const chunks = await chunkDocument(pages, "doc1", {
      semanticEnabled: true,
      embedTexts: async (texts) =>
        texts.map((_, i) => (i < texts.length / 2 ? [1, 0] : [0, 1])),
    });
    expect(chunks.length).toBeGreaterThan(1);
    const combined = combinePages(pages).text;
    for (const c of chunks) {
      expect(combined.slice(c.startOffset, c.endOffset) === c.text || c.text.endsWith(combined.slice(c.startOffset, c.endOffset))).toBe(true);
    }
  });

  test("single-page doc with no headings: one prose run", async () => {
    const pages: ParsedPage[] = [
      { pageNumber: 1, text: "Experienced engineer. Ships daily. Loves reviews." },
    ];
    const chunks = await chunkDocument(pages, "doc1", { semanticEnabled: false });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.kind === "prose")).toBe(true);
  });

  test("empty doc → []", async () => {
    expect(await chunkDocument([], "doc1", { semanticEnabled: false })).toEqual([]);
    expect(
      await chunkDocument([{ pageNumber: 1, text: "   " }], "doc1", {
        semanticEnabled: false,
      }),
    ).toEqual([]);
  });

  test("contentHash deterministic + version-sensitive", () => {
    const a = computeContentHash("hello world");
    expect(a).toBe(computeContentHash("  hello   world "));
    expect(a).not.toBe(computeContentHash("hello other"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test("body-less heading runs merge into one list chunk on level-up", async () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: [
          "### Values-based principles",
          "",
          "![Inclusive icon](a.svg)",
          "",
          "#### Alpha value",
          "",
          "![Beta icon](b.svg)",
          "",
          "#### Beta value",
          "",
          "### Next section",
          "",
          "Body prose here.",
        ].join("\n"),
      },
    ];
    const chunks = await chunkDocument(pages, "doc1", { semanticEnabled: false });
    const list = chunks.find(
      (c) => c.text.includes("Alpha value") && c.text.includes("Beta value"),
    );
    expect(list).toBeDefined();
    const body = chunks.find((c) => c.text.includes("Body prose here."));
    expect(body).toBeDefined();
    expect(body!.text).not.toContain("Alpha value");
    // text === prefix + exact slice for every chunk (validation contract).
    const combined = combinePages(pages).text;
    for (const c of chunks) {
      expect(c.text.endsWith(combined.slice(c.startOffset, c.endOffset))).toBe(true);
    }
  });
});
