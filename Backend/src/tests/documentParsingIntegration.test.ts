import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { parsePdf } from "../parsers/pdfParser";
import { parseDocx } from "../parsers/docxParser";
import { createLlamaNodes } from "../services/llamaDocumentService";
import { PAGE_SEPARATOR } from "../services/llamaDocumentService";

describe("PDF parsing integration", () => {
  const fixturePath = new URL("./fixtures/unicode.pdf", import.meta.url);

  async function loadFixture() {
    return readFile(fixturePath);
  }

  test("should parse unicode.pdf into valid ParsedPage objects", async () => {
    const buffer = await loadFixture();

    const pages = await parsePdf({ buffer });

    expect(pages.length).toBeGreaterThan(0);

    for (const page of pages) {
      // Every parsed page must have a valid real page number.
      expect(page.pageNumber).toBeGreaterThan(0);

      // parsePdf() filters out empty pages.
      expect(page.text.length).toBeGreaterThan(0);

      expect(typeof page.text).toBe("string");

      // Parser guarantees trimmed page text.
      expect(page.text).toBe(page.text.trim());
    }

    // Page numbers must remain in ascending order.
    for (let i = 1; i < pages.length; i++) {
      expect(pages[i].pageNumber).toBeGreaterThan(pages[i - 1].pageNumber);
    }
  });

  test("should preserve unicode text from the real PDF fixture", async () => {
    const buffer = await loadFixture();

    const pages = await parsePdf({ buffer });

    const combinedText = pages.map((page) => page.text).join("\n");

    /*
     * These assertions verify that the Unicode characters actually
     * survive PDF text extraction.
     *
     * If the emoji assertions fail while the PDF visually displays
     * the emoji, the fixture may contain the emoji as a rendered
     * glyph/image rather than as extractable text.
     */
    expect(combinedText).toContain("Café");
    expect(combinedText).toContain("日本語");
    expect(combinedText).toContain("😀");
    expect(combinedText).toContain("🚀");
  });

  test("should return trimmed page text", async () => {
    const buffer = await loadFixture();

    const pages = await parsePdf({ buffer });

    for (const page of pages) {
      expect(page.text).toBe(page.text.trim());
    }
  });

  test("should create LlamaIndex nodes from real parsed PDF pages", async () => {
    const buffer = await loadFixture();

    /*
     * Real parser output.
     *
     * No synthetic ParsedPage objects.
     * No mocks.
     */
    const pages = await parsePdf({ buffer });

    expect(pages.length).toBeGreaterThan(0);

    const nodes = await createLlamaNodes({
      pages,
      documentId: "unicode-test-id",
      userId: "test-user-id",
      fileName: "unicode.pdf",
    });

    expect(nodes.length).toBeGreaterThan(0);

    const maxRealPage = Math.max(...pages.map((page) => page.pageNumber));

    for (const node of nodes) {
      /*
       * Character offsets must exist.
       */
      expect(node.startCharIdx).toBeDefined();
      expect(node.endCharIdx).toBeDefined();

      if (node.startCharIdx === undefined || node.endCharIdx === undefined) {
        throw new Error("Generated node is missing character offsets");
      }

      expect(node.startCharIdx).toBeGreaterThanOrEqual(0);
      expect(node.endCharIdx).toBeGreaterThan(node.startCharIdx);

      /*
       * Page metadata must exist and reference real pages.
       */
      expect(node.metadata.pageStart).toBeGreaterThan(0);
      expect(node.metadata.pageEnd).toBeGreaterThanOrEqual(
        node.metadata.pageStart,
      );

      expect(node.metadata.pageEnd).toBeLessThanOrEqual(maxRealPage);

      /*
       * Ragify metadata must be attached correctly.
       */
      expect(node.metadata.documentId).toBe("unicode-test-id");
      expect(node.metadata.userId).toBe("test-user-id");
      expect(node.metadata.fileName).toBe("unicode.pdf");

      /*
       * Every node must contain actual text.
       */
      expect(node.text.length).toBeGreaterThan(0);
    }
  });

  test("should preserve Unicode text through the full PDF-to-LlamaIndex pipeline", async () => {
    const buffer = await loadFixture();

    const pages = await parsePdf({ buffer });

    const nodes = await createLlamaNodes({
      pages,
      documentId: "unicode-test-id",
      userId: "test-user-id",
      fileName: "unicode.pdf",
    });

    expect(nodes.length).toBeGreaterThan(0);

    const nodeText = nodes.map((node) => node.text).join("\n");

    /*
     * This is stronger than testing parsePdf alone:
     *
     * PDF
     *   ↓
     * parsePdf
     *   ↓
     * ParsedPage[]
     *   ↓
     * combinePages
     *   ↓
     * SentenceSplitter
     *   ↓
     * LlamaIndex nodes
     *
     * We verify that Unicode survives the complete pipeline.
     */
    expect(nodeText).toContain("Café");
    expect(nodeText).toContain("日本語");
    expect(nodeText).toContain("😀");
    expect(nodeText).toContain("🚀");
  });

  test("should keep generated node offsets inside the real combined document", async () => {
    const buffer = await loadFixture();

    const pages = await parsePdf({ buffer });

    const nodes = await createLlamaNodes({
      pages,
      documentId: "unicode-test-id",
      userId: "test-user-id",
      fileName: "unicode.pdf",
    });

    expect(nodes.length).toBeGreaterThan(0);

    /*
     * Reconstruct the same combined document representation used
     * by combinePages().
     *
     * PAGE_SEPARATOR is intentionally not imported here so this
     * integration test verifies the observable bounds rather than
     * coupling itself to the implementation constant.
     */
    const combinedText = pages.map((page) => page.text).join("\n\n");

    for (const node of nodes) {
      expect(node.startCharIdx).toBeDefined();
      expect(node.endCharIdx).toBeDefined();

      if (node.startCharIdx === undefined || node.endCharIdx === undefined) {
        throw new Error("Generated node is missing character offsets");
      }

      expect(node.startCharIdx).toBeGreaterThanOrEqual(0);
      expect(node.endCharIdx).toBeLessThanOrEqual(combinedText.length);
      expect(node.endCharIdx).toBeGreaterThan(node.startCharIdx);
    }
  });

  test("should return no pages and no LlamaIndex nodes for a scanned PDF with no text layer", async () => {
    const fixturePath = new URL(
      "./fixtures/scanned-no-text.pdf",
      import.meta.url,
    );

    const buffer = await readFile(fixturePath);

    const pages = await parsePdf({ buffer });

    /*
     * The fixture contains only a rasterized image and no
     * extractable text layer.
     */
    expect(pages).toEqual([]);

    const nodes = await createLlamaNodes({
      pages,
      documentId: "scanned-test-id",
      userId: "test-user-id",
      fileName: "scanned-no-text.pdf",
    });

    /*
     * With no parsed pages, there is nothing for LlamaIndex
     * to split into nodes.
     */
    expect(nodes).toEqual([]);
  });

  test("should preserve real page numbers when an image-only page is in the middle", async () => {
    const fixturePath = new URL(
      "./fixtures/partially-scanned.pdf",
      import.meta.url,
    );

    const buffer = await readFile(fixturePath);

    const pages = await parsePdf({ buffer });

    // Page 3 is image-only and should have no extracted text.
    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2, 4]);

    // Verify the correct content remained attached to the correct pages.
    expect(pages[0].text).toContain("Synthetic Dataset — Employee Records");
    expect(pages[1].text).toContain("Synthetic Dataset — Product Inventory");
    expect(pages[2].text).toContain("Synthetic Report — Customer Activity");

    const nodes = await createLlamaNodes({
      pages,
      documentId: "partial-scan-test-id",
      userId: "test-user-id",
      fileName: "partially-scanned.pdf",
    });

    expect(nodes.length).toBeGreaterThan(0);

    // No generated node should reference the image-only page 3.
    for (const node of nodes) {
      expect(node.metadata.pageStart).not.toBe(3);
      expect(node.metadata.pageEnd).not.toBe(3);
    }
  });
});

describe("DOCX parsing integration", () => {
  test("should parse a real DOCX fixture into a valid ParsedPage", async () => {
    const fixturePath = new URL(
      "./fixtures/synthetic-resume.docx",
      import.meta.url,
    );

    const buffer = await readFile(fixturePath);

    const pages = await parseDocx({ buffer });

    // parseDocx currently represents a DOCX as a single logical page.
    expect(pages).toHaveLength(1);

    const page = pages[0];

    expect(page.pageNumber).toBe(1);
    expect(typeof page.text).toBe("string");
    expect(page.text.length).toBeGreaterThan(0);

    // parseDocx should return trimmed text.
    expect(page.text).toBe(page.text.trim());

    /*
     * Verify that real, known content from the fixture was
     * extracted correctly by Mammoth.
     */
    expect(page.text).toContain("Jordan Ashworth");
    expect(page.text).toContain("PROFESSIONAL SUMMARY");
    expect(page.text).toContain("TECHNICAL SKILLS");
    expect(page.text).toContain("WORK EXPERIENCE");
    expect(page.text).toContain("PROJECTS");
    expect(page.text).toContain("EDUCATION");
    expect(page.text).toContain("CERTIFICATIONS");
    expect(page.text).toContain("LANGUAGES");

    /*
     * Verify content from different sections of the document,
     * rather than only checking that the output is non-empty.
     */
    expect(page.text).toContain("Mid-level backend engineer");
    expect(page.text).toContain("JavaScript, Go, SQL");
    expect(page.text).toContain("Senior Backend Engineer");
    expect(page.text).toContain("Northwind Systems");
    expect(page.text).toContain("Harborlight — Distributed Job Scheduler");
    expect(page.text).toContain("Fernwatch — Uptime Monitoring Dashboard");
    expect(page.text).toContain("PostgreSQL, Redis");
  });

  test("should create LlamaIndex nodes from real parsed DOCX pages", async () => {
    const fixturePath = new URL(
      "./fixtures/synthetic-resume.docx",
      import.meta.url,
    );

    const buffer = await readFile(fixturePath);

    // Real DOCX parsing — no mocking.
    const pages = await parseDocx({ buffer });

    expect(pages).toHaveLength(1);

    const combinedText = pages.map((page) => page.text).join(PAGE_SEPARATOR);

    const nodes = await createLlamaNodes({
      pages,
      documentId: "docx-integration-test",
      userId: "test-user-id",
      fileName: "synthetic-resume.docx",
    });

    /*
     * The current DOCX fixture produces exactly one node.
     * Keep this explicit so a change in chunking behavior is detected.
     */
    expect(nodes).toHaveLength(1);

    for (const node of nodes) {
      expect(node.text.length).toBeGreaterThan(0);

      // Verify known content survived the complete pipeline.
      expect(node.text).toContain("Jordan Ashworth");
      expect(node.text).toContain("PROFESSIONAL SUMMARY");
      expect(node.text).toContain("Senior Backend Engineer");
      expect(node.text).toContain("Northwind Systems");
      expect(node.text).toContain("Harborlight — Distributed Job Scheduler");

      // DOCX currently produces one logical page.
      expect(node.metadata.pageStart).toBe(1);
      expect(node.metadata.pageEnd).toBe(1);

      // Ragify metadata.
      expect(node.metadata.documentId).toBe("docx-integration-test");
      expect(node.metadata.userId).toBe("test-user-id");
      expect(node.metadata.fileName).toBe("synthetic-resume.docx");

      // LlamaIndex must provide character offsets.
      expect(node.startCharIdx).toBeDefined();
      expect(node.endCharIdx).toBeDefined();

      if (node.startCharIdx === undefined || node.endCharIdx === undefined) {
        throw new Error("Generated node is missing character offsets");
      }

      // Offset invariants.
      expect(node.startCharIdx).toBeGreaterThanOrEqual(0);
      expect(node.endCharIdx).toBeGreaterThan(node.startCharIdx);
      expect(node.endCharIdx).toBeLessThanOrEqual(combinedText.length);

      /*
       * Most important offset invariant:
       * the character range must reproduce the exact node text.
       */
      expect(combinedText.slice(node.startCharIdx, node.endCharIdx)).toBe(
        node.text,
      );
    }
  });
});
