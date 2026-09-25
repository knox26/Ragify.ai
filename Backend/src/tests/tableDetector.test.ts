import { describe, expect, test } from "bun:test";
import {
  extractHeaderRows,
  findTableRegions,
  isHeaderRow,
  isTablePage,
  isTableRegion,
} from "../services/chunking/tableDetector";

const TABLE_PAGE = [
  "Revenue                13,420   12,100",
  "Expenses               11,020   10,300",
  "Net income              2,400    1,800%",
].join("\n");

describe("tableDetector", () => {
  test("compat isTablePage line-profile", () => {
    expect(isTablePage(TABLE_PAGE)).toBe(true);
    expect(isTablePage("The Company operates in one segment.\nIt sells widgets.")).toBe(false);
    expect(isTablePage("")).toBe(false);
  });

  test("isTableRegion on slices", () => {
    const lines = TABLE_PAGE.split("\n");
    expect(isTableRegion(lines, 0, 3)).toBe(true);
    expect(isTableRegion(["a.", "b."], 0, 2)).toBe(false);
    expect(isTableRegion([], 0, 0)).toBe(false);
  });

  test("header rows: labels + column words", () => {
    expect(isHeaderRow("Particulars      Consolidated   Standalone")).toBe(true);
    expect(isHeaderRow("Revenue (₹ Cr)  Consolidated  Standalone")).toBe(true);
    expect(isHeaderRow("Metric  Q1 FY27  Q1 FY26")).toBe(true);
    expect(isHeaderRow("Revenue  13,420")).toBe(false);
    expect(isHeaderRow("Segment 1  Quarterly revenue 12,340  YoY growth 10.0%")).toBe(false);
    expect(isHeaderRow("single")).toBe(false);
  });

  test("findTableRegions absorbs headers, skips prose", () => {
    const lines = [
      "Some intro prose.",
      "Particulars      Consolidated   Standalone",
      "Revenue                13,420   12,100",
      "Expenses               11,020   10,300",
      "Closing prose line.",
    ];
    const regions = findTableRegions(lines);
    expect(regions.length).toBe(1);
    expect(regions[0]).toEqual({ start: 1, end: 4 });
  });

  test("extractHeaderRows takes leading headers only", () => {
    expect(extractHeaderRows(["Particulars  Consolidated", "Revenue  100", "Cost  50"])).toEqual([
      "Particulars  Consolidated",
    ]);
  });
});
