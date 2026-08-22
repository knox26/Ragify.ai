import { v5 as uuidv5 } from "uuid";
import { qdrantClient } from "../db/qdrantClient";

const QDRANT_COLLECTION = Bun.env.QDRANT_COLLECTION;
const EMBEDDING_DIMENSION = Number(Bun.env.EMBEDDING_DIMENSION);

if (!QDRANT_COLLECTION) {
  throw new Error("QDRANT_COLLECTION is not configured");
}

if (!Number.isInteger(EMBEDDING_DIMENSION) || EMBEDDING_DIMENSION <= 0) {
  throw new Error("EMBEDDING_DIMENSION must be a positive integer");
}

const collectionName = QDRANT_COLLECTION;

/**
 * Fixed namespace used to generate deterministic UUIDv5
 * point IDs for Qdrant.
 *
 * IMPORTANT:
 * This value must NEVER change.
 *
 * UUIDv5 generates the same UUID when given the same
 * namespace + name.
 *
 * Therefore:
 *
 * documentId + chunkIndex
 *
 * will always produce the same Qdrant point ID.
 */
const QDRANT_POINT_NAMESPACE = "9b1f9c9c-8e3b-4f0e-8a6b-3f7a2b6c9d10";

/**
 * Generate a deterministic UUID for a document chunk.
 *
 * Qdrant accepts UUIDs as point IDs.
 *
 * Example:
 *
 * documentId = "5240e586-6547-4bf4-892a-07bdb73db30f"
 * chunkIndex = 0
 *
 * -> UUIDv5
 *
 * Repeating the same input produces the same UUID.
 */
export function buildChunkPointId(
  documentId: string,
  chunkIndex: number,
): string {
  if (!documentId) {
    throw new Error("documentId is required");
  }

  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw new Error("chunkIndex must be a non-negative integer");
  }

  return uuidv5(`${documentId}:${chunkIndex}`, QDRANT_POINT_NAMESPACE);
}

/**
 * Lightweight chunk representation produced by
 * llamaDocumentService.ts.
 */
export type ProcessedChunk = {
  chunkIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  pageStart: number;
  pageEnd: number;
};

/**
 * Payload stored alongside every Qdrant vector.
 */
export type QdrantChunkPayload = {
  documentId: string;
  userId: string;
  chunkIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  pageStart: number;
  pageEnd: number;
};

/**
 * Point that will be stored in Qdrant.
 */
export type QdrantPoint = {
  id: string;
  vector: number[];
  payload: QdrantChunkPayload & Record<string, unknown>;
};

/**
 * Verify that:
 *
 * 1. The collection exists.
 * 2. The collection has vector configuration.
 * 3. The configured vector dimension matches
 *    the embedding dimension.
 *
 * This catches configuration problems before
 * document processing begins.
 */
export async function verifyQdrantCollection(): Promise<void> {
  let collectionInfo;

  try {
    collectionInfo = await qdrantClient.getCollection(collectionName);
  } catch (error) {
    throw new Error(`Failed to verify Qdrant collection "${collectionName}"`, {
      cause: error,
    });
  }

  const vectors = collectionInfo.config.params.vectors;

  if (!vectors) {
    throw new Error(
      `Qdrant collection "${collectionName}" has no vector configuration`,
    );
  }

  const configuredSize = vectors.size;

  if (configuredSize !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Qdrant collection "${collectionName}" has vector dimension ${configuredSize}, expected ${EMBEDDING_DIMENSION}`,
    );
  }

  console.log(
    `Qdrant collection "${collectionName}" verified successfully (${configuredSize} dimensions)`,
  );
}

/**
 * Convert processed chunks + embeddings into Qdrant points
 * and store them.
 *
 * Mapping:
 *
 * chunks[0] + embeddings[0] -> point[0]
 * chunks[1] + embeddings[1] -> point[1]
 * ...
 *
 * The order between chunks and embeddings must therefore
 * remain unchanged.
 *
 * This function also guarantees that every embedding has
 * the expected dimension before sending it to Qdrant.
 */
export async function indexDocumentInQdrant({
  documentId,
  userId,
  chunks,
  embeddings,
}: {
  documentId: string;
  userId: string;
  chunks: ProcessedChunk[];
  embeddings: number[][];
}): Promise<void> {
  if (!documentId) {
    throw new Error("documentId is required");
  }

  if (!userId) {
    throw new Error("userId is required");
  }

  if (chunks.length === 0) {
    return;
  }

  /**
   * Every chunk must have exactly one corresponding embedding.
   */
  if (chunks.length !== embeddings.length) {
    throw new Error(
      `Qdrant indexing mismatch for document "${documentId}": ` +
        `received ${chunks.length} chunks but ${embeddings.length} embeddings`,
    );
  }

  const points: QdrantPoint[] = chunks.map((chunk, index) => {
    const embedding = embeddings[index];

    if (!embedding) {
      throw new Error(
        `Missing embedding for chunk ${chunk.chunkIndex} of document "${documentId}"`,
      );
    }

    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Invalid embedding dimension for chunk ${chunk.chunkIndex} ` +
          `of document "${documentId}": expected ${EMBEDDING_DIMENSION}, ` +
          `received ${embedding.length}`,
      );
    }

    return {
      /**
       * Qdrant does not accept arbitrary strings such as:
       *
       * documentId:chunkIndex
       *
       * UUIDv5 converts that deterministic identity into
       * a valid UUID accepted by Qdrant.
       */
      id: buildChunkPointId(documentId, chunk.chunkIndex),

      vector: embedding,

      payload: {
        documentId,
        userId,
        ...chunk,
      },
    };
  });

  await upsertDocumentChunks(points);
}

/**
 * Insert or replace document chunks in Qdrant.
 *
 * Qdrant upsert semantics:
 *
 * - ID doesn't exist -> create point
 * - ID already exists -> replace point
 *
 * Because our point IDs are deterministic UUIDv5 values,
 * processing the same document/chunk again produces the
 * same point ID.
 *
 * Therefore reprocessing is idempotent.
 *
 * Reprocessing strategy:
 *
 * 1. Generate new chunks.
 * 2. Generate embeddings.
 * 3. Upsert new chunks.
 * 4. Delete stale trailing chunks.
 *
 * We intentionally do NOT delete the entire document
 * before upserting the new version.
 */
export async function upsertDocumentChunks(
  points: QdrantPoint[],
): Promise<void> {
  if (points.length === 0) {
    return;
  }

  try {
    await qdrantClient.upsert(collectionName, {
      wait: true,
      points,
    });
  } catch (error) {
    throw new Error(
      `Failed to upsert ${points.length} chunk(s) to Qdrant collection "${collectionName}"`,
      {
        cause: error,
      },
    );
  }
}

/**
 * Delete every Qdrant chunk belonging to a document.
 *
 * Use this ONLY when permanently deleting the document.
 *
 * Do NOT use this during normal reprocessing.
 */
export async function deleteDocumentChunks(documentId: string): Promise<void> {
  if (!documentId) {
    throw new Error("documentId is required");
  }

  try {
    await qdrantClient.delete(collectionName, {
      wait: true,

      filter: {
        must: [
          {
            key: "documentId",
            match: {
              value: documentId,
            },
          },
        ],
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to delete Qdrant chunks for document "${documentId}"`,
      {
        cause: error,
      },
    );
  }
}

/**
 * Delete stale trailing chunks after successful reprocessing.
 *
 * Example:
 *
 * Previous version:
 *
 *   0 1 2 3 4
 *
 * New version:
 *
 *   0 1 2
 *
 * First:
 *
 *   upsert 0, 1, 2
 *
 * Then:
 *
 *   deleteStaleChunks(documentId, 3)
 *
 * removes:
 *
 *   3 and 4
 *
 * This prevents the temporary "no searchable content"
 * window that would happen if we deleted everything first.
 */
export async function deleteStaleChunks(
  documentId: string,
  fromChunkIndex: number,
): Promise<void> {
  if (!documentId) {
    throw new Error("documentId is required");
  }

  if (!Number.isInteger(fromChunkIndex) || fromChunkIndex < 0) {
    throw new Error("fromChunkIndex must be a non-negative integer");
  }

  try {
    await qdrantClient.delete(collectionName, {
      wait: true,

      filter: {
        must: [
          {
            key: "documentId",
            match: {
              value: documentId,
            },
          },
          {
            key: "chunkIndex",
            range: {
              gte: fromChunkIndex,
            },
          },
        ],
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to delete stale Qdrant chunks for document "${documentId}" ` +
        `from chunk index ${fromChunkIndex}`,
      {
        cause: error,
      },
    );
  }
}

/**
 * Ensure the payload index that range filters need.
 *
 * Qdrant requires a payload index for RANGE filters (match filters can
 * full-scan). Without an index on chunkIndex, deleteStaleChunks fails with
 * "Index required but not found". Recreating an existing index is a no-op,
 * so this is safe to call at every worker boot.
 */
export async function ensurePayloadIndexes(): Promise<void> {
  await qdrantClient.createPayloadIndex(collectionName, {
    field_name: "chunkIndex",
    field_schema: "integer",
  });
}
