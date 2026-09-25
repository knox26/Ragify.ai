/**
 * Row-aligned table chunking. Pure. Cuts only between rows (never mid-row);
 * an over-budget single row is emitted whole. Sticky headers: the region's
 * header rows are prepended to the first chunk AND re-prepended to each
 * subsequent chunk so no chunk loses its column meaning.
 *
 * Offset contract: `startOffset`/`endOffset` always exact-slice the ROWS
 * portion (`pageText.slice(startOffset, endOffset)` reconstructs the rows
 * verbatim). When a chunk carries a repeated header prefix, `headerText`
 * holds it and `text = headerText + rowsText` — the rows suffix still
 * exact-slices. Callers must use `text` for embedding and the row slice for
 * offset verification.
 */

import { CHUNK_TABLE_BUDGET } from "./constants";

export interface TableChunkPart {
  /** Full chunk text (header prefix + rows). This is what gets embedded. */
  text: string;
  /** Prepended header prefix ("" when the region has no headers). */
  headerText: string;
  /** Rows portion = pageText.slice(startOffset, endOffset). */
  startOffset: number;
  endOffset: number;
}

export function chunkTableRegion(
  regionText: string,
  headerRows: string[],
  baseOffset = 0,
): TableChunkPart[] {
  const headerText = headerRows.length > 0 ? `${headerRows.join("\n")}\n` : "";
  // Offset of each line start within regionText.
  const lines = regionText.split("\n");
  const lineStart: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    lineStart.push(cursor);
    cursor += line.length + 1; // + "\n"
  }

  const bodyStart = headerRows.length; // rows below the header block
  const parts: TableChunkPart[] = [];
  let current: string[] = [];
  let currentLength = 0;
  let chunkStart = bodyStart < lines.length ? (lineStart[bodyStart] ?? regionText.length) : regionText.length;

  const flush = (endOffset: number, isLast: boolean) => {
    if (current.length === 0) return;
    // Trailing "\n" (the separator before the next chunk) belongs to
    // non-final chunks so concatenation reconstructs the region exactly;
    // the final chunk has no trailing newline (same rule as chunkTablePage).
    // Invariant: text === headerText + rows slice exactly, for every chunk.
    const rowsText = isLast ? current.join("\n") : `${current.join("\n")}\n`;
    parts.push({
      text: `${headerText}${rowsText}`,
      headerText,
      startOffset: baseOffset + chunkStart,
      endOffset: baseOffset + endOffset,
    });
  };

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const addition = current.length > 0 ? line.length + 1 : line.length;

    if (current.length > 0 && currentLength + addition > CHUNK_TABLE_BUDGET) {
      flush(lineStart[i] ?? 0, false);
      current = [line];
      currentLength = line.length;
      chunkStart = lineStart[i] ?? 0;
    } else {
      current.push(line);
      currentLength += addition;
    }
  }

  if (current.length > 0) {
    const lastIdx = lines.length - 1;
    flush((lineStart[lastIdx] ?? 0) + (lines[lastIdx]?.length ?? 0), true);
  }

  // Degenerate region (only headers, no rows): emit the header block whole.
  if (parts.length === 0 && headerText) {
    parts.push({
      text: headerText.trimEnd(),
      headerText: "",
      startOffset: baseOffset,
      endOffset: baseOffset + regionText.length,
    });
  }

  return parts;
}
