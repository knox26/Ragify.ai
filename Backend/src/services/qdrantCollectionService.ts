import { v5 as uuidv5 } from "uuid";
import { qdrantClient } from "../db/qdrantClient";
import {
  SPARSE_VECTOR_NAME,
  sparseVectorFor,
  type SparseVector,
} from "./sparseVectorService";

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
 * Payload stored alongside every Qdrant vector.
 */
export type QdrantChunkPayload = {
  documentId: string;
  userId: string;
  fileName: string;
  chunkIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  pageStart: number;
  pageEnd: number;
};

/**
 * Point that will be stored in Qdrant.
 *
 * Hybrid points carry two vectors in one payload:
 *
 *   vector[""]                 -> dense embedding (unnamed = default)
 *   vector[SPARSE_VECTOR_NAME] -> sparse term vector
 */
export type QdrantPoint = {
  id: string;
  vector:
    | number[]
    | {
        "": number[];
        [name: string]: number[] | SparseVector;
      };
  payload: QdrantChunkPayload & Record<string, unknown>;
};

/**
 * Ensure the collection exists WITH the sparse vector config hybrid retrieval
 * needs. Sparse config is immutable once a collection is created, so an
 * existing collection without it (pre-hybrid data) must be recreated — fail
 * loudly rather than silently serving dense-only results.
 */
export async function ensureQdrantCollection(): Promise<void> {
  let exists = false;

  try {
    await qdrantClient.getCollection(collectionName);
    exists = true;
  } catch (error) {
    const status = (error as { status?: number })?.status;

    if (status !== 404) {
      throw new Error(
        `Failed to check Qdrant collection "${collectionName}"`,
        { cause: error },
      );
    }
  }

  if (!exists) {
    await qdrantClient.createCollection(collectionName, {
      vectors: { size: EMBEDDING_DIMENSION, distance: "Cosine" },
      sparse_vectors: {
        [SPARSE_VECTOR_NAME]: { modifier: "idf" },
      },
    });

    console.log(
      `Qdrant collection "${collectionName}" created ` +
        `(dense ${EMBEDDING_DIMENSION}d + sparse "${SPARSE_VECTOR_NAME}")`,
    );

    return;
  }

  const info = await qdrantClient.getCollection(collectionName);
  const sparse = info.config.params.sparse_vectors?.[SPARSE_VECTOR_NAME];

  if (sparse?.modifier !== "idf") {
    throw new Error(
      `Qdrant collection "${collectionName}" exists without sparse vector ` +
        `"${SPARSE_VECTOR_NAME}" (modifier idf). Hybrid search needs it — ` +
        `recreate the collection and re-ingest.`,
    );
  }
}

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

  const sparse = collectionInfo.config.params.sparse_vectors?.[SPARSE_VECTOR_NAME];

  if (sparse?.modifier !== "idf") {
    throw new Error(
      `Qdrant collection "${collectionName}" has no sparse vector ` +
        `"${SPARSE_VECTOR_NAME}" (modifier idf) — recreate the collection and re-ingest.`,
    );
  }

  console.log(
    `Qdrant collection "${collectionName}" verified successfully ` +
      `(${configuredSize} dimensions + sparse "${SPARSE_VECTOR_NAME}")`,
  );
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
 * Ensure the payload indexes Qdrant filters require.
 *
 * Qdrant needs an index on any key used in a RANGE filter, and — once any
 * index exists — a filtered DELETE also requires indexed MATCH keys
 * ("Index required but not found for documentId of [keyword, uuid]"). A
 * freshly created (or recreated) collection starts with none, so index the
 * three keys filters touch:
 *
 *   userId     — every retrieval match filter
 *   documentId — every retrieval match filter + deleteStaleChunks
 *   chunkIndex — deleteStaleChunks range filter
 *
 * Recreating an existing index is a no-op, so this is safe to call at every
 * worker boot.
 */
export async function ensurePayloadIndexes(): Promise<void> {
  await Promise.all([
    qdrantClient.createPayloadIndex(collectionName, {
      field_name: "userId",
      field_schema: "keyword",
    }),
    qdrantClient.createPayloadIndex(collectionName, {
      field_name: "documentId",
      field_schema: "keyword",
    }),
    qdrantClient.createPayloadIndex(collectionName, {
      field_name: "chunkIndex",
      field_schema: "integer",
    }),
  ]);
}
