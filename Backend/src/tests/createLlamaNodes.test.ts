import { describe, expect, test, spyOn } from "bun:test";

import { createLlamaNodes } from "../services/llamaDocumentService";
import type { ParsedPage } from "../parsers/parserTypes";
import { PAGE_SEPARATOR } from "../services/llamaDocumentService";
import { SentenceSplitter, TextNode } from "llamaindex";

describe("createLlamaNodes", () => {
  test("should create valid LlamaIndex nodes with accurate offsets and metadata", async () => {
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

    const nodes = await createLlamaNodes({
      pages,
      documentId: "test-document-id",
      userId: "test-user-id",
      fileName: "ragify-test.pdf",
    });

    expect(nodes.length).toBeGreaterThan(1);

    for (const node of nodes) {
      const textNode = node as TextNode;

      expect(textNode.startCharIdx).toBeDefined();
      expect(textNode.endCharIdx).toBeDefined();

      if (
        textNode.startCharIdx === undefined ||
        textNode.endCharIdx === undefined
      ) {
        throw new Error("LlamaIndex did not provide character offsets");
      }

      expect(textNode.startCharIdx).toBeGreaterThanOrEqual(0);
      expect(textNode.endCharIdx).toBeGreaterThan(textNode.startCharIdx);

      expect(textNode.metadata.documentId).toBe("test-document-id");
      expect(textNode.metadata.userId).toBe("test-user-id");
      expect(textNode.metadata.fileName).toBe("ragify-test.pdf");

      expect(textNode.metadata.pageStart).toBeGreaterThanOrEqual(1);
      expect(textNode.metadata.pageEnd).toBeGreaterThanOrEqual(
        textNode.metadata.pageStart,
      );
    }
  });

  test("should create a node that genuinely spans page 1 and page 2", async () => {
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
      {
        pageNumber: 1,
        text: page1Text,
      },
      {
        pageNumber: 2,
        text: page2Text,
      },
    ];

    const nodes = await createLlamaNodes({
      pages,
      documentId: "spanning-document",
      userId: "spanning-user",
      fileName: "spanning-test.pdf",
    });

    expect(nodes.length).toBeGreaterThan(1);

    const spanningNodes = nodes.filter(
      (node) => node.metadata.pageStart === 1 && node.metadata.pageEnd === 2,
    );

    expect(spanningNodes.length).toBeGreaterThan(0);

    const spanningNode = spanningNodes[0];

    expect(spanningNode.startCharIdx).toBeDefined();
    expect(spanningNode.endCharIdx).toBeDefined();

    if (
      spanningNode.startCharIdx === undefined ||
      spanningNode.endCharIdx === undefined
    ) {
      throw new Error("Spanning node does not contain character offsets");
    }

    expect(spanningNode.startCharIdx).toBeLessThan(page1Text.length);

    const page2StartOffset = page1Text.length + 2;

    expect(spanningNode.endCharIdx).toBeGreaterThan(page2StartOffset);

    expect(spanningNode.metadata.pageStart).toBe(1);
    expect(spanningNode.metadata.pageEnd).toBe(2);
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

    const nodes = await createLlamaNodes({
      pages,
      documentId: "non-contiguous-document",
      userId: "test-user",
      fileName: "non-contiguous.pdf",
    });

    expect(nodes.length).toBeGreaterThan(3);

    const pageNumbers = new Set<number>();

    for (const node of nodes) {
      pageNumbers.add(node.metadata.pageStart);
      pageNumbers.add(node.metadata.pageEnd);
    }

    expect(pageNumbers.has(1)).toBe(true);

    // Page 2 was intentionally removed upstream.
    expect(pageNumbers.has(2)).toBe(false);

    // Real page number 3 must remain 3.
    expect(pageNumbers.has(3)).toBe(true);

    // Real page number 4 must remain 4.
    expect(pageNumbers.has(4)).toBe(true);
  });

  test("should return no nodes for empty pages", async () => {
    const pages: ParsedPage[] = [];

    const nodes = await createLlamaNodes({
      pages,
      documentId: "empty-document",
      userId: "test-user",
      fileName: "empty.pdf",
    });

    expect(nodes).toEqual([]);
  });

  test("should produce nodes with monotonically increasing character offsets", async () => {
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

    const nodes = await createLlamaNodes({
      pages,
      documentId: "ordering-document",
      userId: "test-user",
      fileName: "ordering.pdf",
    });

    expect(nodes.length).toBeGreaterThan(1);

    let previousStart = -1;

    for (const node of nodes) {
      expect(node.startCharIdx).toBeDefined();
      expect(node.endCharIdx).toBeDefined();

      if (node.startCharIdx === undefined || node.endCharIdx === undefined) {
        throw new Error("Missing character offsets");
      }

      expect(node.startCharIdx).toBeGreaterThanOrEqual(previousStart);

      expect(node.endCharIdx).toBeGreaterThan(node.startCharIdx);

      previousStart = node.startCharIdx;
    }
  });

  test("should preserve accurate offsets and page metadata with Unicode text", async () => {
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

    const documentId = "unicode-test-document";
    const userId = "unicode-test-user";
    const fileName = "unicode-document.pdf";

    const nodes = await createLlamaNodes({
      pages,
      documentId,
      userId,
      fileName,
    });

    expect(nodes.length).toBeGreaterThan(1);

    for (const node of nodes) {
      const { startCharIdx, endCharIdx } = node;

      expect(startCharIdx).toBeDefined();
      expect(endCharIdx).toBeDefined();

      if (startCharIdx === undefined || endCharIdx === undefined) {
        throw new Error("LlamaIndex did not provide character offsets");
      }

      expect(startCharIdx).toBeGreaterThanOrEqual(0);
      expect(endCharIdx).toBeGreaterThan(startCharIdx);

      expect(node.text.length).toBeGreaterThan(0);

      expect(node.metadata.documentId).toBe(documentId);
      expect(node.metadata.userId).toBe(userId);
      expect(node.metadata.fileName).toBe(fileName);

      expect(node.metadata.pageStart).toBeGreaterThanOrEqual(1);
      expect(node.metadata.pageEnd).toBeGreaterThanOrEqual(
        node.metadata.pageStart,
      );
    }

    // At least one node should contain Unicode content.
    const unicodeNode = nodes.find(
      (node) =>
        node.text.includes("日本語") ||
        node.text.includes("中文") ||
        node.text.includes("😀") ||
        node.text.includes("🚀") ||
        node.text.includes("Café"),
    );

    expect(unicodeNode).toBeDefined();

    // The Unicode node must still have valid page metadata.
    if (unicodeNode === undefined) {
      throw new Error("Expected a node containing Unicode text");
    }

    expect(unicodeNode.metadata.pageStart).toBeGreaterThanOrEqual(1);
    expect(unicodeNode.metadata.pageEnd).toBeGreaterThanOrEqual(
      unicodeNode.metadata.pageStart,
    );
  });

  test("should preserve accurate offsets and page metadata with Unicode text", async () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: `
        Introduction to Ragify 🚀.
        Ragify processes documents containing Café, 日本語, 中文, and emojis 😀.
        The system uses embeddings to represent semantic meaning.
      `.repeat(8),
      },
      {
        pageNumber: 2,
        text: `
        Retrieval-Augmented Generation combines retrieval with language models.
        Documents can contain Unicode characters such as ₹, €, Ω, 中文, 日本語,
        and emoji sequences 🚀🔥😀.
        These characters must not corrupt character-offset calculations.
      `.repeat(8),
      },
    ];

    const nodes = await createLlamaNodes({
      pages,
      documentId: "unicode-document",
      userId: "user-123",
      fileName: "unicode.pdf",
    });

    expect(nodes.length).toBeGreaterThan(1);

    for (const node of nodes) {
      const { startCharIdx, endCharIdx } = node;

      expect(startCharIdx).toBeDefined();
      expect(endCharIdx).toBeDefined();

      if (startCharIdx === undefined || endCharIdx === undefined) {
        throw new Error(
          `LlamaIndex did not provide offsets for node ${node.id_}`,
        );
      }

      /*
       * Critical invariant:
       *
       * LlamaIndex's character offsets must refer to the exact
       * JavaScript string range that produced node.text.
       */
      const combinedText = pages.map((page) => page.text).join(PAGE_SEPARATOR);

      expect(combinedText.slice(startCharIdx, endCharIdx)).toBe(node.text);

      // Basic offset validity.
      expect(startCharIdx).toBeGreaterThanOrEqual(0);
      expect(endCharIdx).toBeGreaterThan(startCharIdx);
      expect(endCharIdx).toBeLessThanOrEqual(combinedText.length);

      // Metadata must still identify the correct document.
      expect(node.metadata.documentId).toBe("unicode-document");
      expect(node.metadata.userId).toBe("user-123");
      expect(node.metadata.fileName).toBe("unicode.pdf");

      // Page metadata must be valid.
      expect(node.metadata.pageStart).toBeGreaterThanOrEqual(1);
      expect(node.metadata.pageEnd).toBeGreaterThanOrEqual(
        node.metadata.pageStart,
      );
    }
  });

  test("should create a node that genuinely spans page 1, page 2, and page 3", async () => {
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

    /*
     * One real sentence deliberately crosses all three page boundaries.
     *
     * None of these fragments is a complete sentence by itself.
     * Therefore SentenceSplitter has to treat them as one logical sentence
     * after the pages are combined.
     */
    const frag1 =
      "PostgreSQL provides transactional guarantees across the retrieval pipeline, which is important because";

    const frag2 =
      "the system must remain consistent even under concurrent load and partial failures, and further,";

    const frag3 =
      "this same guarantee extends to how the language model consumes the retrieved context to produce grounded answers.";

    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: `${page1Filler} ${frag1}`,
      },
      {
        pageNumber: 2,
        text: frag2,
      },
      {
        pageNumber: 3,
        text: `${frag3} ${page3Filler}`,
      },
    ];

    const nodes = await createLlamaNodes({
      pages,
      documentId: "three-page-document",
      userId: "user-123",
      fileName: "three-page.pdf",
    });

    /*
     * Make sure this is genuinely a multi-node document.
     * Otherwise a single node containing the entire document would
     * trivially span all three pages.
     */
    expect(nodes.length).toBeGreaterThan(1);

    const spanningNodes = nodes.filter(
      (node) => node.metadata.pageStart === 1 && node.metadata.pageEnd === 3,
    );

    /*
     * At least one actual chunk must span all three pages.
     */
    expect(spanningNodes.length).toBeGreaterThan(0);

    const spanningNode = spanningNodes[0];

    expect(spanningNode.metadata.documentId).toBe("three-page-document");

    expect(spanningNode.metadata.userId).toBe("user-123");

    expect(spanningNode.metadata.fileName).toBe("three-page.pdf");

    expect(spanningNode.metadata.pageStart).toBe(1);
    expect(spanningNode.metadata.pageEnd).toBe(3);

    expect(spanningNode.text.length).toBeGreaterThan(0);

    /*
     * The spanning node must have valid character offsets.
     */
    expect(spanningNode.startCharIdx).toBeDefined();
    expect(spanningNode.endCharIdx).toBeDefined();

    if (
      spanningNode.startCharIdx === undefined ||
      spanningNode.endCharIdx === undefined
    ) {
      throw new Error("Spanning node is missing character offsets");
    }

    expect(spanningNode.startCharIdx).toBeGreaterThanOrEqual(0);

    expect(spanningNode.endCharIdx).toBeGreaterThan(spanningNode.startCharIdx);
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
        createLlamaNodes({
          pages: [{ pageNumber: 1, text: "test document" }],
          documentId: "test-document-id",
          userId: "test-user-id",
          fileName: "test.pdf",
        }),
      ).rejects.toThrow(
        'Failed to create Llama nodes for document "test-document-id"',
      );
    } finally {
      spy.mockRestore();
    }
  });

  test("should preserve existing LlamaIndex node metadata when adding Ragify metadata", async () => {
    const existingMetadata = {
      source: "llamaindex",
      customField: "important-value",
      category: "technical",
    };

    const existingNode = new TextNode({
      text: "This is test content.",
      metadata: existingMetadata,
      endCharIdx: 21,
    });

    /*
     * llamaindex@0.12.1 does not retain startCharIdx when it is supplied
     * through the TextNode constructor options, so assign it explicitly.
     */
    existingNode.startCharIdx = 0;

    /*
     * NOTE: The real pipeline currently creates:
     *
     *   new Document({ text, id_ })
     *
     * without source-level metadata. Therefore, a real SentenceSplitter
     * call does not currently produce nodes with pre-existing metadata.
     *
     * This mocked node protects the metadata-merge behavior against future
     * changes where Document-level metadata is introduced.
     */
    const spy = spyOn(
      SentenceSplitter.prototype,
      "getNodesFromDocuments",
    ).mockReturnValue([existingNode]);

    try {
      const nodes = await createLlamaNodes({
        pages: [
          {
            pageNumber: 1,
            text: "This is test content.",
          },
        ],
        documentId: "document-123",
        userId: "user-123",
        fileName: "test.pdf",
      });

      expect(nodes).toHaveLength(1);

      const node = nodes[0];

      /*
       * Existing LlamaIndex metadata must survive.
       */
      expect(node.metadata).toMatchObject({
        source: "llamaindex",
        customField: "important-value",
        category: "technical",
      });

      /*
       * Ragify metadata must also be added.
       */
      expect(node.metadata).toMatchObject({
        documentId: "document-123",
        userId: "user-123",
        fileName: "test.pdf",
        pageStart: 1,
        pageEnd: 1,
      });

      /*
       * Character offsets must remain intact.
       */
      expect(node.startCharIdx).toBe(0);
      expect(node.endCharIdx).toBe(21);
    } finally {
      spy.mockRestore();
    }
  });
});
