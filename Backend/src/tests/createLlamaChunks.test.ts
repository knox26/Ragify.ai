import { describe, expect, test, spyOn } from "bun:test";

import {
  chunkTablePage,
  CHUNK_TABLE_BUDGET,
  createLlamaChunks,
  isTablePage,
  PAGE_SEPARATOR,
} from "../services/llamaDocumentService";
import type { ParsedPage } from "../parsers/parserTypes";
import { SentenceSplitter } from "llamaindex";

describe("isTablePage", () => {
  test("flags pages whose lines are mostly cell values", () => {
    const table = [
      "Revenue (₹ Cr)  Consolidated  Standalone",
      "Quarter ended Jun 30, 2026  74,108  35,680",
      "Quarter ended Jun 30, 2025  63,750  30,512",
      "Percentage change  16.2%  17.0%",
    ].join("\n");

    expect(isTablePage(table)).toBe(true);
  });

  test("does not flag prose pages ending lines with periods", () => {
    const prose = [
      "The company reported strong results this quarter.",
      "Revenue grew across all major business segments.",
      "Management highlighted improved operating leverage.",
      "Guidance for the next fiscal year remains positive.",
    ].join("\n");

    expect(isTablePage(prose)).toBe(false);
  });

  test("returns false for empty or whitespace-only text", () => {
    expect(isTablePage("")).toBe(false);
    expect(isTablePage("   \n \n  ")).toBe(false);
  });

  test("small table page stays a single chunk", async () => {
    const table = [
      "Metric  Q1 FY27  Q1 FY26",
      "Revenue (₹ Cr)  74,108  63,750",
      "Net profit (₹ Cr)  12,380  10,431",
      "Operating margin (%)  24.2  22.8",
    ].join("\n");

    const chunks = await createLlamaChunks({
      pages: [{ pageNumber: 1, text: table }],
      documentId: "table-doc",
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(table);
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[0].pageEnd).toBe(1);
  });

  test("oversized table page splits at row boundaries, never mid-row", async () => {
    const rows = Array.from(
      { length: 60 },
      (_, i) =>
        `Segment ${i + 1}  Quarterly revenue 12,34${(i % 10).toString().padStart(2, "0")}  YoY growth 1${i % 10}.${i % 9}%  EBIT margin ${i % 25}.${i % 7}%`,
    );
    const table = rows.join("\n");

    const chunks = await createLlamaChunks({
      pages: [{ pageNumber: 1, text: table }],
      documentId: "big-table-doc",
    });

    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.pageStart).toBe(1);
      expect(chunk.pageEnd).toBe(1);
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
      // Every chunk is a concatenation of whole rows: the offset-slice of the
      // page text equals the chunk text exactly (no mid-row cut).
      expect(table.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.text);
    }

    // Concatenation reconstructs the page in order.
    expect(chunks.map((c) => c.text).join("")).toBe(table);

    // Chunk boundaries fall on line boundaries (char right before a chunk
    // start is "\n" for every chunk after the first).
    for (let i = 1; i < chunks.length; i++) {
      expect(table[chunks[i].startOffset - 1]).toBe("\n");
    }

    // Chunks stay under the excerpt cap so excerpts never truncate table rows.
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_TABLE_BUDGET);
    }
  });

  test("a single oversized table row is emitted whole, not broken", () => {
    const longRow = `Segment 42  `.padEnd(CHUNK_TABLE_BUDGET + 300, "7");

    const chunks = chunkTablePage(longRow);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(longRow);
    expect(chunks[0].startOffset).toBe(0);
    expect(chunks[0].endOffset).toBe(longRow.length);
  });

  test("chunkTablePage keeps offsets contiguous across chunks", () => {
    const rows = Array.from(
      { length: 40 },
      (_, i) => `Line ${i}  value ${i}2${i}4${i}  x${i}.${i}%  ₹${i}0${i}00`,
    );
    const text = rows.join("\n");

    const chunks = chunkTablePage(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].startOffset).toBe(0);
    expect(chunks.at(-1)!.endOffset).toBe(text.length);

    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        expect(chunks[i].startOffset).toBe(chunks[i - 1].endOffset);
      }
      expect(text.slice(chunks[i].startOffset, chunks[i].endOffset)).toBe(
        chunks[i].text,
      );
    }
  });
});

describe("createLlamaChunks", () => {
  test("should create valid chunks with accurate offsets and page metadata", async () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: Array.from(
          { length: 8 },
          (_, i) =>
            `Page one section ${i + 1} explains how distributed systems coordinate multiple services, maintain consistency, handle failures, and communicate reliably across network boundaries.`,
        ).join(" "),
      },
      {
        pageNumber: 2,
        text: Array.from(
          { length: 8 },
          (_, i) =>
            `Page two section ${i + 1} continues the discussion of distributed systems by explaining replication, transactions, caching, message queues, fault tolerance, and recovery strategies.`,
        ).join(" "),
      },
      {
        pageNumber: 3,
        text: Array.from(
          { length: 8 },
          (_, i) =>
            `Page three section ${i + 1} explains how vector databases support retrieval augmented generation by storing embeddings and searching for semantically relevant document chunks.`,
        ).join(" "),
      },
    ];

    const chunks = await createLlamaChunks({
      pages,
      documentId: "test-document-id",
    });

    expect(chunks.length).toBeGreaterThan(1);

    chunks.forEach((chunk, index) => {
      expect(chunk.chunkIndex).toBe(index);
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
      expect(chunk.pageStart).toBeGreaterThanOrEqual(1);
      expect(chunk.pageEnd).toBeGreaterThanOrEqual(chunk.pageStart);
    });
  });

  test("should never create a chunk that spans multiple pages", async () => {
    const page1Text = Array.from(
      { length: 35 },
      (_, i) =>
        `Page one supporting sentence ${i + 1} contains information about distributed systems and database architecture.`,
    ).join(" ");

    const page2Text = Array.from(
      { length: 35 },
      (_, i) =>
        `Page two supporting sentence ${i + 1} continues the technical explanation with information about replication, caching, queues, fault tolerance, and recovery.`,
    ).join(" ");

    const pages: ParsedPage[] = [
      { pageNumber: 1, text: page1Text },
      { pageNumber: 2, text: page2Text },
    ];

    const chunks = await createLlamaChunks({
      pages,
      documentId: "spanning-document",
    });

    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.pageStart).toBe(chunk.pageEnd);
    }
  });

  test("should preserve non-contiguous real page numbers", async () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: Array.from(
          { length: 40 },
          (_, i) =>
            `Page one sentence ${i + 1} discusses distributed systems, database architecture, consistency, reliability, and service communication.`,
        ).join(" "),
      },
      {
        pageNumber: 3,
        text: Array.from(
          { length: 40 },
          (_, i) =>
            `Page three sentence ${i + 1} discusses vector databases, embeddings, semantic search, retrieval, ranking, and relevant document chunks.`,
        ).join(" "),
      },
      {
        pageNumber: 4,
        text: Array.from(
          { length: 40 },
          (_, i) =>
            `Page four sentence ${i + 1} discusses language models, grounded answers, citations, context retrieval, and response generation.`,
        ).join(" "),
      },
    ];

    const chunks = await createLlamaChunks({
      pages,
      documentId: "non-contiguous-document",
    });

    expect(chunks.length).toBeGreaterThan(3);

    const pageNumbers = new Set<number>();

    for (const chunk of chunks) {
      pageNumbers.add(chunk.pageStart);
      pageNumbers.add(chunk.pageEnd);
    }

    expect(pageNumbers.has(1)).toBe(true);
    // Page 2 was intentionally removed upstream.
    expect(pageNumbers.has(2)).toBe(false);
    // Real page number 3 must remain 3.
    expect(pageNumbers.has(3)).toBe(true);
    // Real page number 4 must remain 4.
    expect(pageNumbers.has(4)).toBe(true);
  });

  test("should return no chunks for empty pages", async () => {
    const chunks = await createLlamaChunks({
      pages: [],
      documentId: "empty-document",
    });

    expect(chunks).toEqual([]);
  });

  test("should produce chunks with monotonically increasing character offsets", async () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: Array.from(
          { length: 30 },
          (_, i) =>
            `Sentence ${i + 1} discusses distributed systems, databases, queues, caching, and fault tolerance.`,
        ).join(" "),
      },
      {
        pageNumber: 2,
        text: Array.from(
          { length: 30 },
          (_, i) =>
            `Sentence ${i + 1} discusses embeddings, vector search, retrieval, ranking, and semantic similarity.`,
        ).join(" "),
      },
    ];

    const chunks = await createLlamaChunks({
      pages,
      documentId: "ordering-document",
    });

    expect(chunks.length).toBeGreaterThan(1);

    let previousStart = -1;

    for (const chunk of chunks) {
      expect(chunk.startOffset).toBeGreaterThanOrEqual(previousStart);
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
      previousStart = chunk.startOffset;
    }
  });

  test("should preserve accurate offsets with Unicode text", async () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: `
        Database systems such as PostgreSQL provide reliable transaction
        management and ACID guarantees. 日本語のテキストも含まれています。
        Café users can safely store documents. 😀🚀
      `.repeat(8),
      },
      {
        pageNumber: 2,
        text: `
        Vector databases are commonly used in modern RAG systems.
        中文文本用于测试 Unicode 字符处理。
        Embeddings represent semantic meaning of text. 🌍
      `.repeat(8),
      },
    ];

    const chunks = await createLlamaChunks({
      pages,
      documentId: "unicode-test-document",
    });

    expect(chunks.length).toBeGreaterThan(1);

    const combinedText = pages.map((page) => page.text).join(PAGE_SEPARATOR);

    for (const chunk of chunks) {
      expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
      expect(chunk.endOffset).toBeLessThanOrEqual(combinedText.length);
      expect(combinedText.slice(chunk.startOffset, chunk.endOffset)).toBe(
        chunk.text,
      );
    }

    const unicodeChunk = chunks.find(
      (chunk) =>
        chunk.text.includes("日本語") ||
        chunk.text.includes("中文") ||
        chunk.text.includes("😀") ||
        chunk.text.includes("🚀") ||
        chunk.text.includes("Café"),
    );

    expect(unicodeChunk).toBeDefined();
  });

  test("should keep chunks within their source page across three pages", async () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: Array.from(
          { length: 26 },
          (_, i) =>
            `Page one background paragraph ${i + 1} explains distributed systems, databases, caching, and indexing in detail.`,
        ).join(" "),
      },
      {
        pageNumber: 2,
        text: Array.from(
          { length: 26 },
          (_, i) =>
            `Page two background paragraph ${i + 1} explains the retrieval pipeline, embeddings, and vector search.`,
        ).join(" "),
      },
      {
        pageNumber: 3,
        text: Array.from(
          { length: 26 },
          (_, i) =>
            `Page three background paragraph ${i + 1} explains how retrieved context is provided to the model for generation.`,
        ).join(" "),
      },
    ];

    const chunks = await createLlamaChunks({
      pages,
      documentId: "three-page-document",
    });

    expect(chunks.length).toBeGreaterThan(1);

    const combinedText = pages.map((page) => page.text).join(PAGE_SEPARATOR);

    for (const chunk of chunks) {
      // Every chunk lives entirely inside one page.
      expect(chunk.pageStart).toBe(chunk.pageEnd);

      // Offsets still slice the combined document back to the exact chunk text.
      expect(combinedText.slice(chunk.startOffset, chunk.endOffset)).toBe(
        chunk.text,
      );
    }
  });

  test("should wrap LlamaIndex failures with domain context", async () => {
    const spy = spyOn(
      SentenceSplitter.prototype,
      "getNodesFromDocuments",
    ).mockImplementation(() => {
      throw new Error("simulated LlamaIndex failure");
    });

    try {
      await expect(
        createLlamaChunks({
          pages: [{ pageNumber: 1, text: "test document" }],
          documentId: "test-document-id",
        }),
      ).rejects.toThrow(
        'Failed to create chunks for document "test-document-id"',
      );
    } finally {
      spy.mockRestore();
    }
  });
});
