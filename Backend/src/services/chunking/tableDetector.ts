/**
 * Table-region detection. Pure functions. Keeps the existing line-profile
 * `isTablePage` (>50% of non-empty lines end in a cell-value tail char) as
 * the primary detector and adds region/header granularity.
 *
 * Ordering contract: table detection runs BEFORE heading classification per
 * region — a line inside a table region is never passed to isHeadingLine.
 */

import { TABLE_HEADER_MAX_ROWS, TABLE_TAIL_CELL_RE } from "./constants";
import { splitIntoLines } from "./headingDetector";

export interface TableRegion {
  start: number;
  end: number; // exclusive line index
}

/** Compat with existing callers: whole-text line-profile check. */
export function isTablePage(text: string): boolean {
  return isTableRegion(splitIntoLines(text), 0, splitIntoLines(text).length);
}

function tailLines(lines: string[], startIdx: number, endIdx: number): string[] {
  const out: string[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    const line = lines[i]?.trim() ?? "";
    if (line.length > 0) out.push(line);
  }
  return out;
}

/** True when ≥50% of non-empty lines in [startIdx, endIdx) end in a cell tail. */
export function isTableRegion(lines: string[], startIdx: number, endIdx: number): boolean {
  const nonEmpty = tailLines(lines, startIdx, endIdx);
  if (nonEmpty.length === 0) return false;
  const tableLike = nonEmpty.filter((line) => TABLE_TAIL_CELL_RE.test(line));
  return tableLike.length / nonEmpty.length > 0.5;
}

const HEADER_TOKEN_RE =
  /\b(consolidated|standalone|quarter ended|year ended|quarter|year|q[1-4]|fy\d{2}|particulars|metric|total|assets|revenue|income|₹|cr|\$|%|202\d|201\d)\b/i;

const NUMERIC_TOKEN_RE = /^-?\(?[\d,]+(\.\d+)?[%₹$€£)]?$/;
const YEAR_TOKEN_RE = /^(19|20)\d{2}$/;

/**
 * A header row sits at the top of a table region: ≥2 cells/tokens, a
 * currency/unit/column token, at most ONE numeric token, and at least TWO
 * label tokens. Data rows carry figures in most cells
 * ("Segment 1 ... 12,340 ... 10.0%"), so the numeric cap is what keeps them
 * out; single-label-plus-figure lines ("Revenue 13,420") stay data rows.
 */
export function isHeaderRow(line: string): boolean {
  const cells = line.trim().split(/\s{2,}|\t|\|/).map((c) => c.trim()).filter(Boolean);
  if (cells.length < 2 && line.trim().split(/\s+/).length < 2) return false;
  if (!HEADER_TOKEN_RE.test(line)) return false;
  // Count figures as standalone whitespace tokens: multi-word cells hide
  // them from cell-level checks ("Quarterly revenue 12,340" is a data cell).
  const words = line.trim().split(/\s+/);
  const numeric = words.filter((t) => NUMERIC_TOKEN_RE.test(t) || YEAR_TOKEN_RE.test(t));
  if (numeric.length > 1) return false;
  return words.length - numeric.length >= 2;
}

/**
 * Contiguous runs of table-like lines (≥2 lines), each optionally absorbing
 * up to TABLE_HEADER_MAX_ROWS label-ish lines directly above it.
 */
export function findTableRegions(lines: string[]): TableRegion[] {
  const regions: TableRegion[] = [];
  let runStart = -1;

  const flush = (end: number) => {
    if (runStart < 0) return;
    if (end - runStart >= 2 && isTableRegion(lines, runStart, end)) {
      let start = runStart;
      let absorbed = 0;
      // Only absorb column-aligned label lines (wide gaps/tabs/pipes) — a
      // section heading directly above a table (single-spaced, e.g.
      // "CONSOLIDATED BALANCE SHEETS") must NOT be swallowed: headings own
      // sections, headers own tables.
      while (
        start > 0 &&
        absorbed < TABLE_HEADER_MAX_ROWS &&
        /(\s{2,}|\t|\|)/.test(lines[start - 1] ?? "") &&
        isHeaderRow(lines[start - 1] ?? "")
      ) {
        start -= 1;
        absorbed += 1;
      }
      regions.push({ start, end });
    }
    runStart = -1;
  };

  for (let i = 0; i <= lines.length; i++) {
    const line = i < lines.length ? (lines[i] ?? "") : "";
    if (i < lines.length && line.trim().length > 0 && TABLE_TAIL_CELL_RE.test(line.trim())) {
      if (runStart < 0) runStart = i;
    } else {
      flush(i);
    }
  }

  return regions;
}

/** Header rows at the top of a region (up to TABLE_HEADER_MAX_ROWS). */
export function extractHeaderRows(regionLines: string[]): string[] {
  const headers: string[] = [];
  for (const line of regionLines) {
    if (headers.length >= TABLE_HEADER_MAX_ROWS) break;
    if (isHeaderRow(line)) headers.push(line);
    else break;
  }
  return headers;
}
