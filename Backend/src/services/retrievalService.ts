import { qdrantClient } from "../db/qdrantClient";
import { generateEmbedding } from "./embeddingService";
import type { QdrantChunkPayload } from "./qdrantCollectionService";
import {
  SPARSE_VECTOR_NAME,
  sparseVectorFor,
  type SparseVector,
} from "./sparseVectorService";

const QDRANT_COLLECTION = Bun.env.QDRANT_COLLECTION;

if (!QDRANT_COLLECTION) {
  throw new Error("QDRANT_COLLECTION is not configured");
}

const collectionName = QDRANT_COLLECTION;

export const CHAT_TOP_K = Number(Bun.env.CHAT_TOP_K ?? 8);

export type RetrievedChunk = {
  documentId: string;
  fileName: string;
  chunkIndex: number;
  text: string;
  pageStart: number;
  pageEnd: number;
  score: number;
  /** Section context from payload (Fix B1). Absent on pre-Phase-2 points. */
  parentText?: string;
};

/**
 * Multi-tenancy boundary for every retrieval. The userId condition is ALWAYS
 * present — a documentId alone never grants access. Adding a documentId scopes
 * the query to one document (global chat leaves it unset).
 */
export function buildRetrievalFilter(
  userId: string,
  documentId?: string | null,
) {
  const must: Array<
    | { key: "userId"; match: { value: string } }
    | { key: "documentId"; match: { value: string } }
  > = [
    {
      key: "userId",
      match: { value: userId },
    },
  ];

  if (documentId) {
    must.push({
      key: "documentId",
      match: { value: documentId },
    });
  }

  return { must };
}

/**
 * Defensive payload cast. Qdrant payloads are untyped JSON; a malformed point
 * (missing text/documentId) is filtered out rather than crashing the stream.
 */
export function toRetrievedChunk(
  point: { score?: number; payload?: unknown },
  userId: string,
): RetrievedChunk | null {
  const payload = point.payload as Partial<QdrantChunkPayload> | null;

  if (!payload) {
    return null;
  }

  const { documentId, chunkIndex, text, pageStart, pageEnd } = payload;

  if (
    typeof documentId !== "string" ||
    typeof chunkIndex !== "number" ||
    typeof text !== "string" ||
    !text.trim() ||
    typeof pageStart !== "number" ||
    typeof pageEnd !== "number"
  ) {
    return null;
  }

  const chunk: RetrievedChunk = {
    documentId,
    // Old points (ingested before fileName was added) lack the field — fall
    // back to the generic label so sources keep a sane name instead of "undefined".
    fileName:
      typeof payload.fileName === "string" ? payload.fileName : "Document",
    chunkIndex,
    text,
    pageStart,
    pageEnd,
    score: typeof point.score === "number" ? point.score : 0,
  };

  // Pre-Phase-2 points lack parent context — leave absent (Fix B1 degrades
  // to child-only text for them instead of crashing or fabricating).
  if (typeof payload.parentText === "string" && payload.parentText.trim()) {
    chunk.parentText = payload.parentText;
  }

  return chunk;
}

/**
 * Pure hybrid-query builder — extracted for testability. One round-trip:
 * Qdrant runs the dense and sparse prefetches in parallel (each over-scoped
 * 3x), then fuses them with reciprocal rank fusion. The fused `score` is a
 * rank signal, not a cosine similarity — informational only.
 */
export function buildHybridQuery({
  vector,
  sparse,
  filter,
  topK,
}: {
  vector: number[];
  sparse: SparseVector;
  filter: ReturnType<typeof buildRetrievalFilter>;
  topK: number;
}) {
  return {
    prefetch: [
      { query: vector, limit: topK * 3, filter },
      { query: sparse, limit: topK * 3, filter, using: SPARSE_VECTOR_NAME },
    ],
    query: { fusion: "rrf" },
    limit: topK,
    filter,
    with_payload: true,
  };
}

export async function retrieveChunks({
  userId,
  query,
  documentId,
  topK = CHAT_TOP_K,
}: {
  userId: string;
  query: string;
  documentId?: string | null;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const vector = await generateEmbedding({
    text: query,
    taskType: "RETRIEVAL_QUERY",
  });

  const sparse = sparseVectorFor(query);

  const filter = buildRetrievalFilter(userId, documentId);

  const result = await qdrantClient.query(
    collectionName,
    buildHybridQuery({ vector, sparse, filter, topK }),
  );

  const chunks: RetrievedChunk[] = [];

  for (const point of result.points) {
    const chunk = toRetrievedChunk(point, userId);

    if (chunk) {
      chunks.push(chunk);
    }
  }

  return chunks;
}
