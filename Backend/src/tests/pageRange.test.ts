import { describe, expect, test } from "bun:test";
import { getPageRange } from "../services/llamaDocumentService";

interface PageOffset {
  page: number;
  startOffset: number;
  endOffset: number;
}

describe("getPageRange", () => {
  /*
   * Page layout:
   *
   * Page 1: [0, 10)
   * Separator: [10, 12)
   * Page 2: [12, 22)
   * Separator: [22, 24)
   * Page 3: [24, 34)
   *
   * The endOffset is exclusive.
   */
  const pageOffsets: PageOffset[] = [
    {
      page: 1,
      startOffset: 0,
      endOffset: 10,
    },
    {
      page: 2,
      startOffset: 12,
      endOffset: 22,
    },
    {
      page: 3,
      startOffset: 24,
      endOffset: 34,
    },
  ];

  test("should map a chunk entirely inside one page", () => {
    const result = getPageRange(2, 8, pageOffsets);

    expect(result).toEqual({
      pageStart: 1,
      pageEnd: 1,
    });
  });

  test("should map a chunk entirely inside page 2", () => {
    const result = getPageRange(14, 20, pageOffsets);

    expect(result).toEqual({
      pageStart: 2,
      pageEnd: 2,
    });
  });

  test("should map a chunk entirely inside page 3", () => {
    const result = getPageRange(26, 32, pageOffsets);

    expect(result).toEqual({
      pageStart: 3,
      pageEnd: 3,
    });
  });

  test("should map a chunk spanning page 1 and page 2", () => {
    const result = getPageRange(7, 15, pageOffsets);

    expect(result).toEqual({
      pageStart: 1,
      pageEnd: 2,
    });
  });

  test("should preserve real page numbers when page numbers are non-contiguous", () => {
    const nonContiguousPageOffsets: PageOffset[] = [
      {
        page: 1,
        startOffset: 0,
        endOffset: 10,
      },
      {
        page: 3,
        startOffset: 12,
        endOffset: 22,
      },
      {
        page: 4,
        startOffset: 24,
        endOffset: 34,
      },
    ];

    const result = getPageRange(14, 20, nonContiguousPageOffsets);

    expect(result).toEqual({
      pageStart: 3,
      pageEnd: 3,
    });
  });

  test("should correctly handle a chunk crossing an exact page boundary", () => {
    /*
     * Page 1 ends at offset 10 (exclusive).
     * Page 2 starts at offset 12.
     *
     * Offset 9 is the final character belonging to page 1.
     * Offset 12 is the first character belonging to page 2.
     *
     * [9, 13) therefore overlaps both pages.
     */
    const result = getPageRange(9, 13, pageOffsets);

    expect(result).toEqual({
      pageStart: 1,
      pageEnd: 2,
    });
  });

  test("should throw when chunk falls entirely inside a page separator", () => {
    /*
     * Page 1 ends at 10.
     * Page 2 starts at 12.
     *
     * [10, 12) contains only the separator.
     */
    expect(() => {
      getPageRange(10, 12, pageOffsets);
    }).toThrow();
  });

  test("should throw when chunk does not overlap any page", () => {
    /*
     * [22, 24) is the separator between page 2 and page 3.
     */
    expect(() => {
      getPageRange(22, 24, pageOffsets);
    }).toThrow();
  });

  test("should correctly handle a chunk touching a page boundary", () => {
    /*
     * [8, 10) contains only the final characters of page 1.
     * Because endOffset is exclusive, it does NOT overlap page 2.
     */
    const result = getPageRange(8, 10, pageOffsets);

    expect(result).toEqual({
      pageStart: 1,
      pageEnd: 1,
    });
  });

  test("should throw when chunk range is invalid", () => {
    /*
     * start > end.
     *
     * This range happens to fall inside page 2, so without
     * explicit validation the implementation could incorrectly
     * return page 2.
     */
    expect(() => {
      getPageRange(15, 13, pageOffsets);
    }).toThrow();
  });

  test("should throw when chunk range has zero length", () => {
    expect(() => {
      getPageRange(15, 15, pageOffsets);
    }).toThrow();
  });

  test("should throw when page offsets are empty", () => {
    expect(() => {
      getPageRange(0, 10, []);
    }).toThrow();
  });
});
