import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { parsePdf } from "../parsers/pdfParser";
import { parseDocx } from "../parsers/docxParser";
import { createLlamaChunks } from "../services/llamaDocumentService";
import { PAGE_SEPARATOR } from "../services/llamaDocumentService";
import { MIME_TYPES } from "../parsers/mimeTypes";

describe("PDF parsing integration", () => {
  const fixturePath = new URL("./fixtures/unicode.pdf", import.meta.url);

  async function loadFixture() {
    return readFile(fixturePath);
  }

  test("should parse unicode.pdf into valid ParsedPage objects", async () => {
    const buffer = await loadFixture();

    const pages = await parsePdf({ buffer, mimeType: MIME_TYPES.PDF });

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

    const pages = await parsePdf({ buffer, mimeType: MIME_TYPES.PDF });

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

    const pages = await parsePdf({ buffer, mimeType: MIME_TYPES.PDF });

    for (const page of pages) {
      expect(page.text).toBe(page.text.trim());
    }
  });

  test("should create chunks from real parsed PDF pages", async () => {
    const buffer = await loadFixture();

    /*
     * Real parser output.
     *
     * No synthetic ParsedPage objects.
     * No mocks.
     */
    const pages = await parsePdf({ buffer, mimeType: MIME_TYPES.PDF });

    expect(pages.length).toBeGreaterThan(0);

    const chunks = await createLlamaChunks({
      pages,
      documentId: "unicode-test-id",
    });

    expect(chunks.length).toBeGreaterThan(0);

    const maxRealPage = Math.max(...pages.map((page) => page.pageNumber));

    for (const chunk of chunks) {
      /*
       * Character offsets must exist.
       */
      expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);

      /*
       * Page metadata must exist and reference real pages.
       */
      expect(chunk.pageStart).toBeGreaterThan(0);
      expect(chunk.pageEnd).toBeGreaterThanOrEqual(chunk.pageStart);
      expect(chunk.pageEnd).toBeLessThanOrEqual(maxRealPage);

      /*
       * Every chunk must contain actual text.
       */
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  test("should preserve Unicode text through the full PDF-to-LlamaIndex pipeline", async () => {
    const buffer = await loadFixture();

    const pages = await parsePdf({ buffer, mimeType: MIME_TYPES.PDF });

    const chunks = await createLlamaChunks({
      pages,
      documentId: "unicode-test-id",
    });

    expect(chunks.length).toBeGreaterThan(0);

    const chunkText = chunks.map((chunk) => chunk.text).join("\n");

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
     * ProcessedChunk[]
     *
     * We verify that Unicode survives the complete pipeline.
     */
    expect(chunkText).toContain("Café");
    expect(chunkText).toContain("日本語");
    expect(chunkText).toContain("😀");
    expect(chunkText).toContain("🚀");
  });

  test("should keep generated chunk offsets inside the real combined document", async () => {
    const buffer = await loadFixture();

    const pages = await parsePdf({ buffer, mimeType: MIME_TYPES.PDF });

    const chunks = await createLlamaChunks({
      pages,
      documentId: "unicode-test-id",
    });

    expect(chunks.length).toBeGreaterThan(0);

    /*
     * Reconstruct the same combined document representation used
     * by combinePages().
     *
     * PAGE_SEPARATOR is intentionally not imported here so this
     * integration test verifies the observable bounds rather than
     * coupling itself to the implementation constant.
     */
    const combinedText = pages.map((page) => page.text).join("\n\n");

    for (const chunk of chunks) {
      expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.endOffset).toBeLessThanOrEqual(combinedText.length);
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
    }
  });

  test("should return no pages and no chunks for a scanned PDF with no text layer", async () => {
    const fixturePath = new URL(
      "./fixtures/scanned-no-text.pdf",
      import.meta.url,
    );

    const buffer = await readFile(fixturePath);

    const pages = await parsePdf({ buffer, mimeType: MIME_TYPES.PDF });

    /*
     * The fixture contains only a rasterized image and no
     * extractable text layer.
     */
    expect(pages).toEqual([]);

    const chunks = await createLlamaChunks({
      pages,
      documentId: "scanned-test-id",
    });

    /*
     * With no parsed pages, there is nothing for LlamaIndex
     * to split into chunks.
     */
    expect(chunks).toEqual([]);
  });

  test("should preserve real page numbers when an image-only page is in the middle", async () => {
    const fixturePath = new URL(
      "./fixtures/partially-scanned.pdf",
      import.meta.url,
    );

    const buffer = await readFile(fixturePath);

    const pages = await parsePdf({ buffer, mimeType: MIME_TYPES.PDF });

    // Page 3 is image-only and should have no extracted text.
    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2, 4]);

    // Verify the correct content remained attached to the correct pages.
    expect(pages[0].text).toContain("Synthetic Dataset — Employee Records");
    expect(pages[1].text).toContain("Synthetic Dataset — Product Inventory");
    expect(pages[2].text).toContain("Synthetic Report — Customer Activity");

    const chunks = await createLlamaChunks({
      pages,
      documentId: "partial-scan-test-id",
    });

    expect(chunks.length).toBeGreaterThan(0);

    // No generated chunk should reference the image-only page 3.
    for (const chunk of chunks) {
      expect(chunk.pageStart).not.toBe(3);
      expect(chunk.pageEnd).not.toBe(3);
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

    const pages = await parseDocx({ buffer, mimeType: MIME_TYPES.DOCX });

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

  test("should create chunks from real parsed DOCX pages", async () => {
    const fixturePath = new URL(
      "./fixtures/synthetic-resume.docx",
      import.meta.url,
    );

    const buffer = await readFile(fixturePath);

    // Real DOCX parsing — no mocking.
    const pages = await parseDocx({ buffer, mimeType: MIME_TYPES.DOCX });

    expect(pages).toHaveLength(1);

    const combinedText = pages.map((page) => page.text).join(PAGE_SEPARATOR);

    const chunks = await createLlamaChunks({
      pages,
      documentId: "docx-integration-test",
    });

    /*
     * Phase 2: headings delimit sections, so the resume's headed sections
     * (PROFESSIONAL SUMMARY, per-skill groups, EXPERIENCE, PROJECTS,
     * EDUCATION, CERTIFICATIONS, LANGUAGES) chunk per-section instead of by
     * raw token budget — 14 chunks for this fixture. This exact count is
     * intentional and will fail loudly if chunking behavior changes again.
     */
    expect(chunks).toHaveLength(14);

    const combinedChunkText = chunks.map((chunk) => chunk.text).join("");

    // Known content must survive the full DOCX -> chunk pipeline. It may be
    // split across chunks (that is the point of chunking), so assert on the
    // concatenated chunk text, not per-chunk.
    expect(combinedChunkText).toContain("Jordan Ashworth");
    expect(combinedChunkText).toContain("PROFESSIONAL SUMMARY");
    expect(combinedChunkText).toContain("Senior Backend Engineer");
    expect(combinedChunkText).toContain("Northwind Systems");
    expect(combinedChunkText).toContain("Harborlight — Distributed Job Scheduler");
    expect(combinedChunkText).toContain("Fernwatch — Uptime Monitoring Dashboard");
    expect(combinedChunkText).toContain("EDUCATION");

    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);

      // DOCX currently produces one logical page.
      expect(chunk.pageStart).toBe(1);
      expect(chunk.pageEnd).toBe(1);

      // LlamaIndex must provide character offsets.
      expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.endOffset).toBeLessThanOrEqual(combinedText.length);
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);

      /*
       * Most important offset invariant (prefix-aware): Phase 2 prepends
       * section headings / repeated table headers, so the slice must be a
       * non-empty SUFFIX of the chunk text, never a mismatch.
       */
      const slice = combinedText.slice(chunk.startOffset, chunk.endOffset);
      expect(slice.trim().length).toBeGreaterThan(0);
      expect(chunk.text.endsWith(slice)).toBe(true);
    }
  });
});
