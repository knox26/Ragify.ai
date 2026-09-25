import { describe, expect, test } from "bun:test";
import { CHUNK_TABLE_BUDGET } from "../services/chunking/constants";
import { chunkTableRegion } from "../services/chunking/tableChunker";

const HEADER = ["Particulars      Consolidated   Standalone"];
const ROWS = [
  "Revenue                13,420   12,100",
  "Expenses               11,020   10,300",
  "Net income              2,400    1,800",
];
const REGION = [...HEADER, ...ROWS].join("\n");

describe("tableChunker", () => {
  test("single region, one chunk, exact rows slice", () => {
    const parts = chunkTableRegion(REGION, HEADER);
    expect(parts.length).toBe(1);
    const part = parts[0]!;
    // First chunk: no duplication marker; rows slice reconstructs the body.
    expect(part.headerText).toBe(`${HEADER.join("\n")}\n`);
    expect(REGION.slice(part.startOffset, part.endOffset)).toBe(ROWS.join("\n"));
    expect(part.text).toBe(`${HEADER.join("\n")}\n${ROWS.join("\n")}`);
  });

  test("over-budget splits are row-aligned with sticky headers", () => {
    const manyRows = Array.from({ length: 200 }, (_, i) => `Line item ${i}      1,00${i % 10}   2,00${i % 10}`);
    const region = [...HEADER, ...manyRows].join("\n");
    const parts = chunkTableRegion(region, HEADER);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.text.length).toBeLessThanOrEqual(CHUNK_TABLE_BUDGET + HEADER.join("\n").length + 1);
      // text === header + rows slice exactly (header duplication is explicit).
      const slice = region.slice(part.startOffset, part.endOffset);
      expect(slice.length).toBeGreaterThan(0);
      expect(part.text).toBe(`${part.headerText}${slice}`);
      // No mid-row cut: slice covers whole lines only.
      expect(
        slice
          .split("\n")
          .filter((l) => l.length > 0)
          .every((l) => manyRows.includes(l)),
      ).toBe(true);
    }
    // Later chunks re-carry the header.
    expect(parts[1]!.headerText).toBe(`${HEADER.join("\n")}\n`);
    expect(parts[1]!.text.startsWith(HEADER[0]!)).toBe(true);
    // Concatenated rows reconstruct the full row block.
    const rows = parts.map((p) => region.slice(p.startOffset, p.endOffset)).join("");
    expect(rows).toBe(manyRows.join("\n"));
  });

  test("over-budget single row emitted whole", () => {
    const bigRow = `X  ${"9".repeat(CHUNK_TABLE_BUDGET + 500)}`;
    const parts = chunkTableRegion([HEADER[0]!, bigRow].join("\n"), HEADER);
    expect(parts.length).toBe(1);
    expect(parts[0]!.text).toContain(bigRow);
  });
});
