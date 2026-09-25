/**
 * Phase 2 chunking budgets and thresholds. All env-overridable; invalid
 * combinations throw at module load (same fail-fast pattern as chatService).
 */

function num(name: string, fallback: number): number {
  const raw = Bun.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number (got ${JSON.stringify(raw)})`);
  }
  return parsed;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = Bun.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw !== "false";
}

/** Target size for a child chunk, in tokens. */
export const CHILD_TOKEN_TARGET = num("CHILD_TOKEN_TARGET", 200);
/** Hard cap for a child chunk, in tokens. Mirrors CHUNK_SIZE. */
export const CHILD_TOKEN_MAX = num("CHILD_TOKEN_MAX", 400);
/** SentenceSplitter overlap for prose runs. Mirrors CHUNK_OVERLAP. */
export const PROSE_OVERLAP = num("PROSE_OVERLAP", 40);

/** Cap for parent/section context text, in chars. */
export const PARENT_TEXT_CAP = num("PARENT_TEXT_CAP", 6000);
/** Char budget above which a parent section is capped (same cap). */
export const SECTION_BUDGET_CHARS = num("SECTION_BUDGET_CHARS", 6000);

/** Char budget for a row-aligned table chunk. Reused from llamaDocumentService. */
export const CHUNK_TABLE_BUDGET = num("CHUNK_TABLE_BUDGET", 1500);

/** Max header rows recognized at the top of a table region. */
export const TABLE_HEADER_MAX_ROWS = num("TABLE_HEADER_MAX_ROWS", 2);

/**
 * A line counts as table-like when it ends in a digit/percentage/currency
 * (a cell value), NOT a period or comma. KEEP ₹ — tests + FinanceBench data
 * depend on it.
 */
export const TABLE_TAIL_CELL_RE = /[%₹$€£\d/-]\s*$/;

/** Semantic split: sentences per window. */
export const SEMANTIC_WINDOW_SENTENCES = num("SEMANTIC_WINDOW_SENTENCES", 3);
/** Semantic split: overlap between adjacent windows. */
export const SEMANTIC_WINDOW_OVERLAP = num("SEMANTIC_WINDOW_OVERLAP", 1);
/** Cosine below this marks a semantic boundary. Lower = more splitting. */
export const SEMANTIC_BOUNDARY_THRESHOLD = num("SEMANTIC_BOUNDARY_THRESHOLD", 0.75);
/** Prose runs shorter than this (chars) never trigger semantic splitting. */
export const SEMANTIC_MIN_RUN_CHARS = num("SEMANTIC_MIN_RUN_CHARS", 2000);
/** Kill-switch for the embedding-backed split (token fallback when off). */
export const SEMANTIC_CHUNKING_ENABLED = bool("SEMANTIC_CHUNKING_ENABLED", true);

/** Version stamp written on every Phase-2 point. Bumped on chunker changes. */
export const PROCESSING_VERSION = num("PROCESSING_VERSION", 5);

/**
 * chatService truncates excerpts at CHUNK_TEXT_CAP (default 2200). Table
 * children must never be silently truncated there.
 */
const CHUNK_TEXT_CAP = num("CHUNK_TEXT_CAP", 2200);

if (CHUNK_TABLE_BUDGET > CHUNK_TEXT_CAP) {
  throw new Error(
    `CHUNK_TABLE_BUDGET (${CHUNK_TABLE_BUDGET}) must stay ≤ CHUNK_TEXT_CAP (${CHUNK_TEXT_CAP}) or table chunks truncate silently`,
  );
}

if (CHILD_TOKEN_TARGET <= 0 || CHILD_TOKEN_MAX <= 0 || CHILD_TOKEN_TARGET > CHILD_TOKEN_MAX) {
  throw new Error(
    `Require 0 < CHILD_TOKEN_TARGET (${CHILD_TOKEN_TARGET}) ≤ CHILD_TOKEN_MAX (${CHILD_TOKEN_MAX})`,
  );
}

if (
  SEMANTIC_WINDOW_SENTENCES <= 0 ||
  SEMANTIC_WINDOW_OVERLAP < 0 ||
  SEMANTIC_WINDOW_OVERLAP >= SEMANTIC_WINDOW_SENTENCES
) {
  throw new Error(
    `Require 0 ≤ SEMANTIC_WINDOW_OVERLAP (${SEMANTIC_WINDOW_OVERLAP}) < SEMANTIC_WINDOW_SENTENCES (${SEMANTIC_WINDOW_SENTENCES})`,
  );
}
