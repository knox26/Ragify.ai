import { describe, expect, test, spyOn } from "bun:test";

import { createLlamaChunks, PAGE_SEPARATOR } from "../services/llamaDocumentService";
import type { ParsedPage } from "../parsers/parserTypes";
import { SentenceSplitter } from "llamaindex";

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

  test("should create a chunk that genuinely spans page 1 and page 2", async () => {
    const page1Prefix = Array.from(
      { length: 35 },
      (_, i) =>
        `Page one supporting sentence ${i + 1} contains information about distributed systems and database architecture.`,
    ).join(" ");

    const boundarySentence =
      "PostgreSQL provides strong consistency guarantees through its transaction system which ensures that committed changes remain durable and correctly ordered across concurrent operations.";

    const page1Text = `${page1Prefix} ${boundarySentence}`;

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

    const spanningChunks = chunks.filter(
      (chunk) => chunk.pageStart === 1 && chunk.pageEnd === 2,
    );

    expect(spanningChunks.length).toBeGreaterThan(0);

    const spanningChunk = spanningChunks[0];

    expect(spanningChunk.startOffset).toBeLessThan(page1Text.length);
    expect(spanningChunk.endOffset).toBeGreaterThan(page1Text.length + 2);
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

  test("should create a chunk that genuinely spans three pages", async () => {
    const page1Filler = Array.from(
      { length: 26 },
      (_, i) =>
        `Page one background paragraph ${i + 1} explains distributed systems, databases, caching, and indexing in detail.`,
    ).join(" ");

    const page3Filler = Array.from(
      { length: 26 },
      (_, i) =>
        `Page three background paragraph ${i + 1} explains how retrieved context is provided to the model for generation.`,
    ).join(" ");

    const frag1 =
      "PostgreSQL provides transactional guarantees across the retrieval pipeline, which is important because";

    const frag2 =
      "the system must remain consistent even under concurrent load and partial failures, and further,";

    const frag3 =
      "this same guarantee extends to how the language model consumes the retrieved context to produce grounded answers.";

    const pages: ParsedPage[] = [
      { pageNumber: 1, text: `${page1Filler} ${frag1}` },
      { pageNumber: 2, text: frag2 },
      { pageNumber: 3, text: `${frag3} ${page3Filler}` },
    ];

    const chunks = await createLlamaChunks({
      pages,
      documentId: "three-page-document",
    });

    expect(chunks.length).toBeGreaterThan(1);

    const spanningChunks = chunks.filter(
      (chunk) => chunk.pageStart === 1 && chunk.pageEnd === 3,
    );

    expect(spanningChunks.length).toBeGreaterThan(0);

    const spanningChunk = spanningChunks[0];

    expect(spanningChunk.pageStart).toBe(1);
    expect(spanningChunk.pageEnd).toBe(3);
    expect(spanningChunk.text.length).toBeGreaterThan(0);
    expect(spanningChunk.endOffset).toBeGreaterThan(spanningChunk.startOffset);
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
