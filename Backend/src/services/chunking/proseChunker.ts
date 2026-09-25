/**
 * Prose chunking: sentence-aligned splits via the existing llamaindex
 * SentenceSplitter, with the locate-in-page repair so offsets stay exact
 * and tokenizer corruption never leaks into chunks. Chunks never cross the
 * run boundary handed in (callers keep them page-local).
 */

import { Document, SentenceSplitter } from "llamaindex";
import { locateInPage } from "../llamaDocumentService";
import { CHILD_TOKEN_MAX, PROSE_OVERLAP } from "./constants";

export interface ProsePiece {
  text: string;
  /** Offset into the run text passed in. */
  startOffset: number;
  endOffset: number;
}

/**
 * Split a prose run into sentence-aligned pieces. Throws with a clear
 * message on empty nodes or unlocatable text — callers treat a throw as
 * "skip this block, keep the rest of the document".
 */
export function chunkProseRun(
  runText: string,
  opts?: { tokenMax?: number; tokenOverlap?: number },
): ProsePiece[] {
  if (!runText.trim()) return [];

  const splitter = new SentenceSplitter({
    chunkSize: opts?.tokenMax ?? CHILD_TOKEN_MAX,
    chunkOverlap: opts?.tokenOverlap ?? PROSE_OVERLAP,
  });

  const pieces: ProsePiece[] = [];
  let cursor = 0;

  // Each run is its own LlamaIndex document so nodes never cross runs.
  const llamaDocument = new Document({ text: runText, id_: `prose:${runText.length}` });

  for (const node of splitter.getNodesFromDocuments([llamaDocument])) {
    const chunkText = node.getContent();
    if (!chunkText.trim()) {
      throw new Error("LlamaIndex node contains empty text");
    }

    const located = locateInPage(runText, chunkText, cursor);
    if (!located) {
      throw new Error("LlamaIndex node could not be located within its run");
    }

    cursor = located.index + 1;
    pieces.push({
      text: located.text,
      startOffset: located.index,
      endOffset: located.index + located.text.length,
    });
  }

  return pieces;
}
