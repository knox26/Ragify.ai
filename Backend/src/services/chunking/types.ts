/**
 * Phase 2 chunking shared types. No runtime dependencies.
 *
 * Each document produces a flat, reading-ordered list of Chunk objects.
 * Child chunks are the embedded + retrievable units; parent sections are NOT
 * stored as Qdrant points — the parent's text rides on each child as
 * `parentText` payload so retrieval, rerank, dedupe, and citations keep
 * working on the same `(documentId, chunkIndex)` keys they use today.
 */

/** Retrievable chunk kind. Parents are never stored — no "parent" variant. */
export type ChunkKind = "table" | "prose";

export type StatementType =
  | "balance_sheet"
  | "income_statement"
  | "cash_flow"
  | "equity"
  | "notes"
  | "mdna"
  | "other";

export type ConsolidationScope = "consolidated" | "parent_company" | "unspecified";

export interface Chunk {
  chunkIndex: number;
  kind: ChunkKind;
  text: string;
  /** Absolute into the combined document text (see combinePages). */
  startOffset: number;
  endOffset: number;
  pageStart: number;
  /** A chunk spans pages ONLY for a table region split by a page break. */
  pageEnd: number;
  /** Heading path from the document root, e.g. ["Balance Sheets"]. */
  sectionPath: string[];
  /** `${documentId}:section:<n>` (ordinal, never title-based); null when unset. */
  parentId: string | null;
  /** Capped parent/section text for LLM context (payload only, never embedded). */
  parentText: string;
  statementType: StatementType;
  consolidationScope: ConsolidationScope;
}

/** A table region's sticky header lines, carried alongside row text. */
export interface TableHeader {
  /** Verbatim header lines, joined with "\n" ("" when the region has none). */
  headerText: string;
}
