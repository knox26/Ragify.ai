/**
 * Chunk → Qdrant point mapping. Pure. Every Phase-2-written point carries
 * the full metadata set; validation throws with a clear message on any
 * malformed chunk or document reference. Chunk text is the ONLY embedded
 * source — parentText/sectionPath/statement tags ride as payload only.
 */

import { PROCESSING_VERSION } from "./constants";
import type { Chunk } from "./types";
import {
  buildChunkPointId,
  type QdrantPoint,
} from "../qdrantCollectionService";
import { SPARSE_VECTOR_NAME, type SparseVector } from "../sparseVectorService";

export type ChunkDocument = {
  id: string;
  userId: string;
  fileName: string;
};

function fail(message: string): never {
  throw new Error(`[payloadMapper] ${message}`);
}

export function chunkToPoint(
  chunk: Chunk,
  document: ChunkDocument,
  embedding: number[],
  sparse: SparseVector,
  contentHash: string,
): QdrantPoint {
  if (!document.id) fail("document.id is required");
  if (!document.userId) fail("document.userId is required (multi-tenant isolation)");
  if (!document.fileName) fail("document.fileName is required");
  if (!chunk.text || !chunk.text.trim()) fail(`chunk ${chunk.chunkIndex}: empty text`);
  if (!Number.isInteger(chunk.chunkIndex) || chunk.chunkIndex < 0) {
    fail(`chunk has invalid chunkIndex ${chunk.chunkIndex}`);
  }
  if (
    !Number.isInteger(chunk.startOffset) ||
    !Number.isInteger(chunk.endOffset) ||
    chunk.startOffset < 0 ||
    chunk.endOffset <= chunk.startOffset
  ) {
    fail(`chunk ${chunk.chunkIndex}: bad offsets ${chunk.startOffset}/${chunk.endOffset}`);
  }
  if (
    !Number.isInteger(chunk.pageStart) ||
    !Number.isInteger(chunk.pageEnd) ||
    chunk.pageStart > chunk.pageEnd
  ) {
    fail(`chunk ${chunk.chunkIndex}: bad pages ${chunk.pageStart}/${chunk.pageEnd}`);
  }
  if (!Array.isArray(embedding) || embedding.length === 0 || embedding.some((n) => !Number.isFinite(n))) {
    fail(`chunk ${chunk.chunkIndex}: invalid dense embedding`);
  }
  if (!contentHash) fail("contentHash is required");

  return {
    id: buildChunkPointId(document.id, chunk.chunkIndex),
    // Dense (unnamed) + sparse (named) coexist in one point for hybrid query.
    vector: {
      "": embedding,
      [SPARSE_VECTOR_NAME]: sparse,
    },
    payload: {
      documentId: document.id,
      userId: document.userId,
      fileName: document.fileName,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      chunkType: chunk.kind,
      statementType: chunk.statementType,
      consolidationScope: chunk.consolidationScope,
      sectionPath: chunk.sectionPath,
      parentId: chunk.parentId,
      parentText: chunk.parentText,
      contentHash,
      processingVersion: PROCESSING_VERSION,
    },
  };
}
