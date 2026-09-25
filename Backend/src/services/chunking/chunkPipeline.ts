/**
 * Phase 2 chunk orchestrator: ParsedPage[] → ordered Chunk[] (+parents).
 *
 * Per-page order (contract): TABLE DETECTION FIRST, then heading
 * classification on non-table lines only — an ALL-CAPS table row must never
 * reach isHeadingLine. A block failure skips that block with a warning and
 * never crashes the document. Offsets are absolute into combinePages() output.
 */

import { createHash } from "node:crypto";
import type { ParsedPage } from "../../parsers/parserTypes";
import { combinePages } from "../llamaDocumentService";
import { CHILD_TOKEN_MAX, PROCESSING_VERSION } from "./constants";
import { chunkProseRun } from "./proseChunker";
import { extractHeaderRows, findTableRegions, type TableRegion } from "./tableDetector";
import { chunkTableRegion } from "./tableChunker";
import { buildParents } from "./chunkGraph";
import {
  dehyphenateText,
  isHeadingLine,
  normalizeHeadingLine,
  splitIntoLines,
} from "./headingDetector";

// A line that is only an image (`![alt](src)`): carries the depicted
// section's name as signal but is never standalone prose.
const IMAGE_ONLY_RE = /^!\[[^\]]*\]\([^)]*\)\s*$/;
const ATX_LEVEL_RE = /^(#{1,6})\s+\S/;

function headingLevel(line: string): number {
  const m = ATX_LEVEL_RE.exec(line.trim());
  return m ? m[1]!.length : 0;
}
import { detectConsolidation, detectStatementType } from "./statementDetector";
import { semanticSplitRun, type EmbedTexts } from "./semanticChunker";
import type { Chunk, ChunkKind } from "./types";

export type ChunkPipelineDeps = {
  semanticEnabled?: boolean;
  embedTexts?: EmbedTexts;
};

/** SHA-256 over normalized combined text + chunker version + config. */
export function computeContentHash(combinedText: string): string {
  return createHash("sha256")
    .update(combinedText.trim().replace(/\s+/g, " "))
    .update(`|v${PROCESSING_VERSION}|table${process.env.CHUNK_TABLE_BUDGET ?? "1500"}`)
    .digest("hex");
}

interface PendingChunk extends Omit<Chunk, "chunkIndex" | "parentId" | "parentText"> {
  /**
   * Non-slice prefix ("" when none): unconsumed heading lines and/or repeated
   * table headers prepended so no source line is ever dropped. Invariant:
   * text === prefixText + combinedText.slice(startOffset, endOffset).
   */
  prefixText: string;
}

interface PendingHeading {
  line: string;
  startAbs: number;
  endAbs: number;
  page: number;
}

function lineStarts(pageText: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < pageText.length; i++) {
    if (pageText[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function pushHeading(path: string[], title: string): string[] {
  const atx = title.match(/^(#{1,4})\s+/);
  if (atx) {
    const depth = Math.min(atx[1]?.length ?? 1, 4);
    return [...path.slice(0, depth - 1), title.replace(/^#{1,6}\s+/, "")];
  }
  if (path.length === 0) return [title];
  return [...path.slice(0, -1), title];
}

async function chunkProseBlock(
  runText: string,
  runStartAbs: number,
  deps: ChunkPipelineDeps,
  makeBase: (kind: ChunkKind, text: string, start: number, end: number) => PendingChunk,
): Promise<PendingChunk[]> {
  let pieces: Array<{ text: string; startOffset: number; endOffset: number }>;
  try {
    pieces = chunkProseRun(runText);
  } catch (error) {
    console.warn(`[chunk] prose block skipped: ${error instanceof Error ? error.message : error}`);
    return [];
  }

  // Default OFF: the library path stays pure/deterministic with no network.
  // Production opts in explicitly (processDocumentById passes the
  // SEMANTIC_CHUNKING_ENABLED env flag); the env flag remains the kill switch
  // inside shouldSemanticSplit either way.
  const semanticOn = deps.semanticEnabled ?? false;
  if (semanticOn && pieces.length > 1) {
    try {
      const split = await semanticSplitRun(runText, { embedTexts: deps.embedTexts });
      if (split && split.length > 1) {
        // Map semantic pieces back to run offsets; fall back on any mismatch.
        const mapped: typeof pieces = [];
        let cursor = 0;
        let ok = true;
        for (const piece of split) {
          const idx = runText.indexOf(piece, cursor);
          if (idx < 0) {
            ok = false;
            break;
          }
          mapped.push({ text: piece, startOffset: idx, endOffset: idx + piece.length });
          cursor = idx + 1;
        }
        if (ok && mapped.length > 0) {
          // Re-split oversized semantic pieces by token boundaries.
          const capped: typeof pieces = [];
          for (const m of mapped) {
            if (m.text.length > CHILD_TOKEN_MAX * 4) {
              try {
                for (const p of chunkProseRun(m.text)) {
                  capped.push({
                    text: p.text,
                    startOffset: m.startOffset + p.startOffset,
                    endOffset: m.startOffset + p.endOffset,
                  });
                }
              } catch {
                capped.push(m);
              }
            } else {
              capped.push(m);
            }
          }
          pieces = capped;
        }
      }
    } catch {
      // Fail-open: keep token-boundary pieces.
    }
  }

  return pieces.map((p) =>
    makeBase("prose", p.text, runStartAbs + p.startOffset, runStartAbs + p.endOffset),
  );
}

export async function chunkDocument(
  rawPages: ParsedPage[],
  documentId: string,
  deps: ChunkPipelineDeps = {},
): Promise<Chunk[]> {
  // Dehyphenate BEFORE offsets are assigned so chunk text, cursor
  // accounting, and the combinePages() validation slice share one space.
  const pages = rawPages.map((p) => ({ ...p, text: dehyphenateText(p.text) }));
  const pending: PendingChunk[] = [];
  let sectionPath: string[] = [];
  // Headers of a table region ending the previous page: re-attached to a
  // table region opening the next page (page-break-split tables).
  let carriedHeaders: string[] = [];
  let carriedTableOpen = false;
  // Unconsumed heading lines (verbatim, cross-page): the next emitted chunk
  // carries them as its prefix. Never dropped — a trailing remainder becomes
  // its own chunk at the end.
  let pendingHeadings: PendingHeading[] = [];

  let cursor = 0;

  for (const page of pages) {
    if (cursor > 0) cursor += 2; // PAGE_SEPARATOR.length
    const base = cursor;
    cursor += page.text.length;
    if (!page.text.trim()) continue;

    const lines = splitIntoLines(page.text);
    const starts = lineStarts(page.text);
    // 1. Table detection FIRST.
    const regions = findTableRegions(lines);
    const tableLine = new Set<number>();
    for (const r of regions) for (let i = r.start; i < r.end; i++) tableLine.add(i);

    // Carry headers across a page-break-split table.
    let pageHeaders = carriedTableOpen ? carriedHeaders : [];
    carriedHeaders = [];
    carriedTableOpen = false;
    if (regions.length > 0) {
      const last: TableRegion = regions[regions.length - 1]!;
      if (last.end === lines.length || lines.slice(last.end).every((l) => !l.trim())) {
        carriedHeaders = extractHeaderRows(lines.slice(last.start, last.end));
        carriedTableOpen = true;
      }
    }

    const regionByStart = new Map(regions.map((r) => [r.start, r]));
    // Take the accumulated heading prefix for a block that is about to
    // emit `count` chunks; applied to the block's first chunk. A block that
    // ends up emitting nothing must NOT consume the prefix (restore it).
    const takeHeadingPrefix = (willEmit: boolean): string => {
      if (!willEmit || pendingHeadings.length === 0) return "";
      const prefix = `${pendingHeadings.map((h) => h.line).join("\n")}\n`;
      pendingHeadings = [];
      return prefix;
    };
    const makeBase = (
      kind: ChunkKind,
      text: string,
      startAbs: number,
      endAbs: number,
      section: string[],
      prefixText = "",
    ): PendingChunk => ({
      kind,
      text: `${prefixText}${text}`,
      startOffset: startAbs,
      endOffset: endAbs,
      pageStart: page.pageNumber,
      pageEnd: page.pageNumber,
      sectionPath: [...section],
      statementType: detectStatementType(section[section.length - 1] ?? null, []),
      consolidationScope: detectConsolidation(section[section.length - 1] ?? null, []),
      prefixText,
    });

    // 2. Walk lines: headings (non-table only) delimit prose runs; table
    // regions chunk as units.
    let proseStart = -1;
    const flushProse = async (endIdx: number) => {
      if (proseStart < 0 || endIdx <= proseStart) {
        proseStart = -1;
        return;
      }
      const runStart = starts[proseStart] ?? 0;
      const runEnd =
        endIdx < lines.length
          ? ((starts[endIdx] ?? page.text.length) - 1)
          : page.text.length;
      const runText = page.text.slice(runStart, Math.max(runEnd, runStart));
      const runLines = splitIntoLines(runText);
      const hasContent = runLines.some((l) => l.trim());
      const bodyLess =
        hasContent && runLines.every((l) => !l.trim() || IMAGE_ONLY_RE.test(l.trim()));
      if (bodyLess) {
        // Body-less run (bare icons between headings): carry its lines with
        // the heading prefix instead of emitting a stub chunk. Never consumes
        // the prefix — a later prose block or level-up flush takes it.
        let off = base + runStart;
        for (const rl of runLines) {
          if (rl.trim()) {
            pendingHeadings.push({
              line: rl,
              startAbs: off,
              endAbs: off + rl.length,
              page: page.pageNumber,
            });
          }
          off += rl.length + (page.text[off + rl.length] === "\r" ? 2 : 1);
        }
        proseStart = -1;
        return;
      }
      if (runText.trim()) {
        const section = sectionPath;
        const chunks = await chunkProseBlock(
          runText,
          base + runStart,
          deps,
          (kind, text, s, e) => makeBase(kind, text, s, e, section),
        );
        // The block's first chunk carries any accumulated heading lines.
        const prefix = takeHeadingPrefix(chunks.length > 0);
        if (prefix && chunks.length > 0) {
          const first = chunks[0]!;
          first.text = `${prefix}${first.text}`;
          first.prefixText = `${prefix}${first.prefixText}`;
        }
        pending.push(...chunks);
      }
      proseStart = -1;
    };

    let i = 0;
    while (i <= lines.length) {
      const region = regionByStart.get(i);
      if (region) {
        await flushProse(i);
        const regionLines = lines.slice(region.start, region.end);
        const headers = extractHeaderRows(regionLines);
        const effectiveHeaders = headers.length > 0 ? headers : pageHeaders;
        pageHeaders = [];
        const regionStart = starts[region.start] ?? 0;
        const lastEnd =
          (starts[region.end - 1] ?? 0) + (lines[region.end - 1]?.length ?? 0);
        const regionText = page.text.slice(regionStart, lastEnd);
        try {
          const stmtTitle = sectionPath[sectionPath.length - 1] ?? null;
          const statementType = detectStatementType(stmtTitle, regionLines);
          const consolidationScope = detectConsolidation(stmtTitle, regionLines);
          const parts = chunkTableRegion(regionText, effectiveHeaders, base + regionStart);
          const headingPrefix = takeHeadingPrefix(parts.length > 0);
          parts.forEach((part, partIdx) => {
            // part.text already starts with part.headerText; pass the rows
            // slice as the text and carry heading+header in the prefix so
            // text === prefixText + slice holds exactly.
            const rowsText = part.text.slice(part.headerText.length);
            const prefix = partIdx === 0 ? `${headingPrefix}${part.headerText}` : part.headerText;
            pending.push({
              ...makeBase(
                "table",
                rowsText,
                part.startOffset,
                part.endOffset,
                sectionPath,
                prefix,
              ),
              statementType,
              consolidationScope,
            });
          });
        } catch (error) {
          console.warn(
            `[chunk] table block skipped: ${error instanceof Error ? error.message : error}`,
          );
        }
        i = region.end;
        continue;
      }

      if (i >= lines.length) break;
      const line = lines[i] ?? "";
      // Heading classification ONLY for non-table lines (table set excludes
      // region lines; blank lines never headings).
      if (!tableLine.has(i) && line.trim() && isHeadingLine(line)) {
        await flushProse(i);
        // A heading that steps back UP past accumulated body-less headings
        // ends a headword list (icon + heading runs with no prose): emit the
        // group as one exact-slice chunk instead of scattering stubs.
        const incomingLevel = headingLevel(line);
        if (incomingLevel > 0 && pendingHeadings.length > 1) {
          let lastLevel = 0;
          for (let k = pendingHeadings.length - 1; k >= 0; k--) {
            const lv = headingLevel(pendingHeadings[k]!.line);
            if (lv > 0) {
              lastLevel = lv;
              break;
            }
          }
          const samePage = pendingHeadings.every((h) => h.page === page.pageNumber);
          if (lastLevel > incomingLevel && samePage) {
            const first = pendingHeadings[0]!;
            const last = pendingHeadings[pendingHeadings.length - 1]!;
            pending.push(
              makeBase(
                "prose",
                page.text.slice(first.startAbs - base, last.endAbs - base),
                first.startAbs,
                last.endAbs,
                sectionPath,
              ),
            );
            pendingHeadings = [];
          }
        }
        // Accumulate verbatim: the next emitted chunk carries this line as
        // its prefix (headings are never dropped).
        const lineStart = starts[i] ?? 0;
        pendingHeadings.push({
          line,
          startAbs: base + lineStart,
          endAbs: base + lineStart + line.length,
          page: page.pageNumber,
        });
        sectionPath = pushHeading(sectionPath, normalizeHeadingLine(line));
        i += 1;
        continue;
      }
      if (proseStart < 0) proseStart = i;
      i += 1;
    }
    await flushProse(lines.length);
  }

  // 2b. Trailing headings with no following block become one exact chunk
  // each (single-line slices are trivially contiguous) rather than dropped
  // content.
  for (const heading of pendingHeadings) {
    pending.push({
      kind: "prose",
      text: heading.line,
      startOffset: heading.startAbs,
      endOffset: heading.endAbs,
      pageStart: heading.page,
      pageEnd: heading.page,
      sectionPath: [...sectionPath],
      statementType: detectStatementType(sectionPath[sectionPath.length - 1] ?? null, []),
      consolidationScope: detectConsolidation(sectionPath[sectionPath.length - 1] ?? null, []),
      prefixText: "",
    });
  }
  pendingHeadings = [];

  // 3. Parents + statement already stamped per section above.
  const flat: Chunk[] = pending.map((p, idx) => {
    const { prefixText: _prefix, ...rest } = p;
    void _prefix;
    return { ...rest, chunkIndex: idx, parentId: null, parentText: "" };
  });
  const withParents = buildParents(flat, documentId);

  // 4. Offset validation: text === prefixText + exact slice, strictly.
  // Mismatch → drop that chunk + warn, keep the rest.
  const combined = combinePages(pages).text;
  const valid: Chunk[] = [];
  for (const chunk of withParents) {
    if (
      !Number.isInteger(chunk.startOffset) ||
      !Number.isInteger(chunk.endOffset) ||
      chunk.startOffset < 0 ||
      chunk.endOffset <= chunk.startOffset ||
      chunk.endOffset > combined.length ||
      chunk.pageStart > chunk.pageEnd
    ) {
      console.warn(
        `[chunk] dropped chunk ${chunk.chunkIndex}: invalid offsets/pages ` +
          JSON.stringify({
            s: chunk.startOffset,
            e: chunk.endOffset,
            ps: chunk.pageStart,
            pe: chunk.pageEnd,
            len: combined.length,
          }),
      );
      continue;
    }
    const slice = combined.slice(chunk.startOffset, chunk.endOffset);
    const original = pending[chunk.chunkIndex];
    const prefix = original?.prefixText ?? "";
    if (slice.trim().length === 0 || chunk.text !== `${prefix}${slice}`) {
      console.warn(`[chunk] dropped chunk ${chunk.chunkIndex}: offset slice mismatch`);
      continue;
    }
    valid.push(chunk);
  }

  // Re-number after drops so chunkIndex stays sequential.
  return valid.map((c, idx) => ({ ...c, chunkIndex: idx }));
}
