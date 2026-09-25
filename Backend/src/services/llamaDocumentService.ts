import type { ParsedPage } from "../parsers/parserTypes";
import { chunkDocument } from "./chunking/chunkPipeline";

// Chunk size in TOKENS (~4 chars/token). Applied per page — chunks never
// cross page boundaries. Env-overridable so a page-aware chunk budget can be
// tuned without a code change. chatService.CHUNK_TEXT_CAP must stay above the
// largest page-derived chunk (see comment there).
export const CHUNK_SIZE = Number(Bun.env.CHUNK_SIZE ?? 400);
export const CHUNK_OVERLAP = Number(Bun.env.CHUNK_OVERLAP ?? 40);

// Character budget for a row-aligned table chunk. Kept under CHUNK_TEXT_CAP
// (1700) so whole table chunks never get excerpt-truncated; a single row
// longer than this is emitted whole rather than broken.
export const CHUNK_TABLE_BUDGET = Number(Bun.env.CHUNK_TABLE_BUDGET ?? 1500);

// A line counts as table-like when it ends in a digit/percentage/currency
// (i.e. a cell value), NOT a period or comma. Anchored on the final char so
// ordinary prose lines ending in "." are never misdetected.
const TABLE_LINE_TAIL = /[%₹$€£\d/-]\s*$/;

interface CreateLlamaChunksParams {
  pages: ParsedPage[];
  documentId: string;
  /**
   * Opt into embedding-backed semantic splitting (one batched call per long
   * prose run). Defaults OFF so the library path stays pure, deterministic,
   * and network-free; production passes the SEMANTIC_CHUNKING_ENABLED flag.
   */
  semanticEnabled?: boolean;
}

export interface ProcessedChunk {
  chunkIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  pageStart: number;
  pageEnd: number;
  // Phase 2 metadata (populated by the chunkPipeline delegate; optional so
  // pre-Phase-2 callers/tests keep compiling).
  kind?: "table" | "prose";
  sectionPath?: string[];
  parentId?: string | null;
  parentText?: string;
  statementType?: string;
  consolidationScope?: string;
}

interface PageOffset {
  page: number;
  startOffset: number;
  endOffset: number;
}

export const PAGE_SEPARATOR = "\n\n";

// natural's sentence tokenizer temporarily replaces abbreviations, numbers,
// and URIs with {{CODE_n}} placeholders and can, on nested re-splits, drop
// characters (e.g. a comma after "Inc."). Both corrupt the node text so that
// LlamaIndex's indexOf-based offset derivation fails and leaked codes would
// reach Qdrant. Match the node within its page, returning the REAL page
// slice so offsets stay exact and both corruptions are repaired.
export interface LocatedText {
  index: number;
  text: string;
}

export function locateInPage(
  pageText: string,
  content: string,
  from: number,
): LocatedText | null {
  const exact = pageText.indexOf(content, from);

  if (exact >= 0) {
    return { index: exact, text: content };
  }

  // Overlapping chunks can start at the same offset (the next chunk re-includes
  // the previous one's tail, or the first node is a short prefix of the second).
  // When the cursor has already advanced past that shared start, the from-index
  // search above misses a legitimate match at the page head. Fall back to a
  // from-zero search before the lossy fuzzy walk.
  const fromZero = pageText.indexOf(content);

  if (fromZero >= 0) {
    return { index: fromZero, text: content };
  }

  // Fuzzy fallback: walk both strings forward. Equal chars consume both;
  // a mismatch consumes the page char (the tokenizer dropped it), and a
  // {{CODE_n}} placeholder in the node text is skipped (the page chars it
  // stands for are consumed by the mismatch rule until the next literal
  // aligns). Linear time, no backtracking.
  let i = from;
  let j = 0;
  let start = -1;
  const pageLen = pageText.length;
  const contentLen = content.length;

  while (j < contentLen && i < pageLen) {
    if (content.startsWith("{{", j)) {
      const close = content.indexOf("}}", j);

      if (close < 0) {
        return null;
      }

      j = close + 2;
      continue;
    }

    if (pageText[i] === content[j]) {
      if (start < 0) {
        start = i;
      }

      i++;
      j++;
    } else {
      i++;
    }
  }

  if (j < contentLen || start < 0) {
    return null;
  }

  return {
    index: start,
    text: pageText.slice(start, i),
  };
}

export function combinePages(pages: ParsedPage[]): {
  text: string;
  pageOffsets: PageOffset[];
} {
  let combinedText = "";
  const pageOffsets: PageOffset[] = [];

  for (const page of pages) {
    if (combinedText.length > 0) {
      combinedText += PAGE_SEPARATOR;
    }

    const startOffset = combinedText.length;

    combinedText += page.text;

    const endOffset = combinedText.length;

    pageOffsets.push({
      page: page.pageNumber,
      startOffset,
      endOffset,
    });
  }

  return {
    text: combinedText,
    pageOffsets,
  };
}

/**
 * A page whose lines are mostly cell values (rows of numbers, currency,
 * percentages) is a table. Tables are split at ROW boundaries (never
 * mid-row — a mid-row cut produced dangling fragments like a chunk ending
 * "27,") and kept row-aligned so each chunk stays a coherent unit under the
 * excerpt cap. Anything else is split per page with SentenceSplitter, so
 * prose chunks never cross page boundaries either.
 */
export function isTablePage(text: string): boolean {
  const nonEmptyLines = text
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (nonEmptyLines.length === 0) {
    return false;
  }

  const tableLikeLines = nonEmptyLines.filter((line) =>
    TABLE_LINE_TAIL.test(line.trim()),
  );

  return tableLikeLines.length / nonEmptyLines.length > 0.5;
}

export interface TableChunk {
  text: string;
  startOffset: number;
  endOffset: number;
}

/**
 * Split a table page into row-aligned chunks of at most CHUNK_TABLE_BUDGET
 * chars. Rows are joined with "\n" and only cut between lines, so a table row
 * (a line of cell values) is never split. Oversized single lines (one giant
 * row) are emitted whole rather than broken. Offsets are relative to the page
 * text so callers can shift them to absolute document positions.
 */
export function chunkTablePage(text: string): TableChunk[] {
  const lines = text.split("\n");
  const chunks: TableChunk[] = [];
  let current: string[] = [];
  let currentLength = 0;
  let chunkStart = 0;
  let cursor = 0;

  for (const line of lines) {
    const addition = current.length > 0 ? line.length + 1 : line.length;

    if (current.length > 0 && currentLength + addition > CHUNK_TABLE_BUDGET) {
      // The trailing "\n" (the separator before `line`) belongs to this chunk,
      // so its text and offsets stay contiguous with the next chunk and the
      // concatenation reconstructs the page exactly.
      chunks.push({
        text: current.join("\n") + "\n",
        startOffset: chunkStart,
        endOffset: cursor + 1,
      });
      current = [line];
      currentLength = line.length;
      chunkStart = cursor + 1;
    } else {
      current.push(line);
      currentLength += addition;
    }

    cursor += addition;
  }

  if (current.length > 0) {
    chunks.push({
      text: current.join("\n"),
      startOffset: chunkStart,
      endOffset: cursor,
    });
  }

  return chunks;
}

/**
 * Create lightweight application-level chunks from a document.
 *
 * Phase 2: delegates to the structure-aware chunkPipeline (heading sections,
 * row-aligned tables with sticky headers, parent context, statement tags)
 * and maps back to ProcessedChunk[] — the fields the worker + tests read.
 * Sentence splitting still uses llamaindex SentenceSplitter per page/run
 * (chunks never cross pages except a page-break-split table, which stays
 * page-local with re-attached headers), and the locate-in-page offset repair
 * now lives in chunking/proseChunker.
 */
export async function createLlamaChunks({
  pages,
  documentId,
  semanticEnabled = false,
}: CreateLlamaChunksParams): Promise<ProcessedChunk[]> {
  if (pages.length === 0) {
    return [];
  }

  try {
    const chunks = await chunkDocument(pages, documentId, { semanticEnabled });

    return chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      kind: chunk.kind,
      sectionPath: chunk.sectionPath,
      parentId: chunk.parentId,
      parentText: chunk.parentText,
      statementType: chunk.statementType,
      consolidationScope: chunk.consolidationScope,
    }));
  } catch (error) {
    throw new Error(`Failed to create chunks for document "${documentId}"`, {
      cause: error,
    });
  }
}
