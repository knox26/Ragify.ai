import { describe, expect, test } from "bun:test";
import { combinePages, PAGE_SEPARATOR } from "../services/llamaDocumentService";
import type { ParsedPage } from "../parsers/parserTypes";

describe("combinePages", () => {
  test("single page: text is unchanged and offset spans the whole text", () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: "Hello world",
      },
    ];

    const { text, pageOffsets } = combinePages(pages);

    expect(text).toBe("Hello world");

    expect(pageOffsets).toEqual([
      {
        page: 1,
        startOffset: 0,
        endOffset: 11,
      },
    ]);
  });

  test("multiple pages: joined in order with exact separator accounting", () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: "ABCDE",
      },
      {
        pageNumber: 2,
        text: "FGHIJ",
      },
    ];

    const { text, pageOffsets } = combinePages(pages);

    expect(text).toBe(`ABCDE${PAGE_SEPARATOR}FGHIJ`);

    expect(pageOffsets).toEqual([
      {
        page: 1,
        startOffset: 0,
        endOffset: 5,
      },
      {
        page: 2,
        startOffset: 7,
        endOffset: 12,
      },
    ]);
  });

  test("exact offsets: slicing combined text returns each page's original text", () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: "The quick brown fox",
      },
      {
        pageNumber: 2,
        text: "jumps over the lazy dog",
      },
      {
        pageNumber: 3,
        text: "and then went home",
      },
    ];

    const { text, pageOffsets } = combinePages(pages);

    pageOffsets.forEach((offset, index) => {
      expect(text.slice(offset.startOffset, offset.endOffset)).toBe(
        pages[index].text,
      );
    });
  });

  test("non-contiguous page numbers: real page numbers are preserved", () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: "AAAAA",
      },
      {
        pageNumber: 3,
        text: "BBBBB",
      },
      {
        pageNumber: 4,
        text: "CCCCC",
      },
    ];

    const { pageOffsets } = combinePages(pages);

    expect(pageOffsets.map((offset) => offset.page)).toEqual([1, 3, 4]);
  });

  test("empty page text: produces a zero-width range and double separator", () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: "AAAAA",
      },
      {
        pageNumber: 2,
        text: "",
      },
      {
        pageNumber: 3,
        text: "CCCCC",
      },
    ];

    const { text, pageOffsets } = combinePages(pages);

    const page2Offset = pageOffsets.find((offset) => offset.page === 2);

    expect(page2Offset).toBeDefined();

    if (!page2Offset) {
      throw new Error("Page 2 offset was not generated");
    }

    expect(page2Offset.startOffset).toBe(page2Offset.endOffset);

    expect(text).toBe("AAAAA\n\n\n\nCCCCC");
  });

  test("unicode: combinePages offsets remain internally consistent", () => {
    // This verifies combinePages itself.
    //
    // It does NOT verify that LlamaIndex's startCharIdx/endCharIdx
    // align with JavaScript offsets for non-BMP Unicode characters.
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: "Café ☕ 日本語 test",
      },
      {
        pageNumber: 2,
        text: "Emoji test: 😀🚀",
      },
    ];

    const { text, pageOffsets } = combinePages(pages);

    pageOffsets.forEach((offset, index) => {
      expect(text.slice(offset.startOffset, offset.endOffset)).toBe(
        pages[index].text,
      );
    });
  });

  test("final offset: last page's endOffset equals combinedText.length", () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: "AAAAA",
      },
      {
        pageNumber: 2,
        text: "BBBBB",
      },
      {
        pageNumber: 3,
        text: "CCCCC",
      },
    ];

    const { text, pageOffsets } = combinePages(pages);

    expect(pageOffsets[pageOffsets.length - 1].endOffset).toBe(text.length);
  });

  test("offset gaps: separator characters are excluded from every page range", () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: "ABCDE",
      },
      {
        pageNumber: 2,
        text: "FGHIJ",
      },
      {
        pageNumber: 3,
        text: "KLMNO",
      },
    ];

    const { text, pageOffsets } = combinePages(pages);

    for (let i = 0; i < pageOffsets.length - 1; i++) {
      const gap = text.slice(
        pageOffsets[i].endOffset,
        pageOffsets[i + 1].startOffset,
      );

      expect(gap).toBe(PAGE_SEPARATOR);
    }
  });

  test("empty pages array: returns empty text and no offsets", () => {
    const { text, pageOffsets } = combinePages([]);

    expect(text).toBe("");
    expect(pageOffsets).toEqual([]);
  });

  test("empty first page: empty page contributes no text", () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: "",
      },
      {
        pageNumber: 2,
        text: "BBBBB",
      },
    ];

    const { text, pageOffsets } = combinePages(pages);

    expect(text).toBe("BBBBB");

    expect(pageOffsets).toEqual([
      {
        page: 1,
        startOffset: 0,
        endOffset: 0,
      },
      {
        page: 2,
        startOffset: 0,
        endOffset: 5,
      },
    ]);
  });

  test("empty last page: final offset invariant still holds", () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: "AAAAA",
      },
      {
        pageNumber: 2,
        text: "",
      },
    ];

    const { text, pageOffsets } = combinePages(pages);

    const lastOffset = pageOffsets[pageOffsets.length - 1];

    expect(lastOffset.startOffset).toBe(lastOffset.endOffset);

    expect(lastOffset.endOffset).toBe(text.length);
  });

  test("consecutive empty pages: each empty page gets its own zero-width range", () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: "AAAAA",
      },
      {
        pageNumber: 2,
        text: "",
      },
      {
        pageNumber: 3,
        text: "",
      },
      {
        pageNumber: 4,
        text: "DDDDD",
      },
    ];

    const { text, pageOffsets } = combinePages(pages);

    expect(text).toBe("AAAAA\n\n\n\n\n\nDDDDD");

    const page2Offset = pageOffsets.find((offset) => offset.page === 2);

    const page3Offset = pageOffsets.find((offset) => offset.page === 3);

    expect(page2Offset).toBeDefined();
    expect(page3Offset).toBeDefined();

    if (!page2Offset || !page3Offset) {
      throw new Error("Expected offsets for pages 2 and 3");
    }

    expect(page2Offset.startOffset).toBe(page2Offset.endOffset);

    expect(page3Offset.startOffset).toBe(page3Offset.endOffset);

    expect(page2Offset.startOffset).not.toBe(page3Offset.startOffset);
  });

  test("all pages empty: returns empty text with zero-width page ranges", () => {
    const pages: ParsedPage[] = [
      {
        pageNumber: 1,
        text: "",
      },
      {
        pageNumber: 2,
        text: "",
      },
      {
        pageNumber: 3,
        text: "",
      },
    ];

    const { text, pageOffsets } = combinePages(pages);

    expect(text).toBe("");

    expect(pageOffsets).toEqual([
      {
        page: 1,
        startOffset: 0,
        endOffset: 0,
      },
      {
        page: 2,
        startOffset: 0,
        endOffset: 0,
      },
      {
        page: 3,
        startOffset: 0,
        endOffset: 0,
      },
    ]);

    pageOffsets.forEach((offset) => {
      expect(offset.startOffset).toBe(offset.endOffset);
    });

    expect(pageOffsets[pageOffsets.length - 1].endOffset).toBe(text.length);
  });
});
