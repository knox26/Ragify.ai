import type { Job } from "bullmq";
import type { ProcessDocumentJob } from "../queues/documentQueue";
import prisma from "../db/dbConfig";
import { downloadDocument } from "../services/downloadDocumentService";
import { parseDocument } from "../parsers/documentParser";
import { combinePages, createLlamaChunks } from "../services/llamaDocumentService";
import { generateEmbeddings } from "../services/embeddingService";
import { sparseVectorFor } from "../services/sparseVectorService";
import { computeContentHash } from "../services/chunking/chunkPipeline";
import { SEMANTIC_CHUNKING_ENABLED } from "../services/chunking/constants";
import { chunkToPoint } from "../services/chunking/payloadMapper";
import {
  upsertDocumentChunks,
  deleteStaleChunks,
} from "../services/qdrantCollectionService";

/**
 * Process one document end-to-end: download from R2, parse to pages, chunk
 * (Phase 2 structure-aware chunking via createLlamaChunks), embed, upsert to
 * Qdrant, mark COMPLETED.
 *
 * Extracted from the BullMQ handler so the eval ingest path (and any batch
 * tooling) can drive the exact same pipeline directly, without a queue.
 *
 * Idempotency:
 * - A COMPLETED document whose stored contentHash matches the recomputed
 *   hash is a no-op (no embedding cost, no Qdrant writes, no status change).
 * - Point IDs are deterministic UUIDv5(documentId:chunkIndex), so
 *   reprocessing overwrites in place; trailing stale chunks are deleted
 *   AFTER the upsert, never before — a failed re-ingest keeps the last
 *   known-good searchable version (no delete-first empty window).
 * On failure it marks FAILED and rethrows.
 */
export async function processDocumentById(
  documentId: string,
): Promise<void> {
  const document = await prisma.document.findUnique({
    where: {
      id: documentId,
    },
  });

  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }

  // 1-2. Download + parse first (read-only): the content hash needs the
  // parsed text, and a hash-match no-op must not touch the status row.
  const fileBuffer = await downloadDocument({
    r2Key: document.r2Key,
  });

  const pages = await parseDocument({
    buffer: fileBuffer,
    mimeType: document.mimeType,
  });

  const contentHash = computeContentHash(combinePages(pages).text);

  if (document.status === "COMPLETED" && document.contentHash === contentHash) {
    console.log(`[ingest] ${documentId}: unchanged contentHash, skipping re-ingest`);
    return;
  }

  // Claim atomically. Accept QUEUED (normal path), PROCESSING (stalled
  // re-run after a crash mid-job), and COMPLETED (explicit re-ingest with a
  // changed hash — the UUIDv5 point IDs make the re-run idempotent).
  const claimed = await prisma.document.updateMany({
    where: { id: documentId, status: { in: ["QUEUED", "PROCESSING", "COMPLETED"] } },
    data: { status: "PROCESSING" },
  });

  if (claimed.count === 0) {
    const current = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (current?.status === "COMPLETED") {
      return; // already done — idempotent no-op
    }

    throw new Error(
      `Document ${documentId} not claimable (status=${current?.status})`,
    );
  }

  try {
    // 3. Create Phase-2 chunks (heading sections, row-aligned tables with
    // sticky headers, parent context, statement tags). Returns:
    //
    // {
    //   chunkIndex,
    //   text,
    //   startOffset,
    //   endOffset,
    //   pageStart,
    //   pageEnd
    // }
    //
    // (plus section/parent/statement metadata carried into the payload).
    const processedChunks = await createLlamaChunks({
      pages,
      documentId: document.id,
      semanticEnabled: SEMANTIC_CHUNKING_ENABLED,
    });

    // 4. No searchable content
    //
    // Do not modify existing Qdrant vectors here.
    // A failed reprocessing attempt should not destroy
    // the last known-good searchable version.
    if (processedChunks.length === 0) {
      await prisma.document.update({
        where: {
          id: documentId,
        },
        data: {
          status: "FAILED",
          failureReason: "EMPTY_DOCUMENT",
          errorMessage:
            "No extractable text content was found in this document.",
        },
      });

      return;
    }

    // 5. Extract chunk text for embedding.
    //
    // IMPORTANT:
    //
    // processedChunks[0] -> embeddings[0]
    // processedChunks[1] -> embeddings[1]
    // processedChunks[2] -> embeddings[2]
    //
    // The order must remain unchanged. Chunk text is the ONLY embed source —
    // parentText/sectionPath/statement tags ride as payload, never embedded.
    const texts = processedChunks.map((chunk) => chunk.text);

    // 6. Generate document embeddings.
    //
    // generateEmbeddings() internally batches requests
    // to Gemini, so we do NOT make one API request per chunk.
    const embeddings = await generateEmbeddings({
      texts,
      taskType: "RETRIEVAL_DOCUMENT",
      label: document.id,
    });

    // Safety check: make sure every chunk received an embedding.
    if (embeddings.length !== processedChunks.length) {
      throw new Error(
        `Embedding count mismatch: expected ${processedChunks.length}, received ${embeddings.length}`,
      );
    }

    const qdrantPoints = processedChunks.map((chunk, index) => {
      const embedding = embeddings[index];

      if (!embedding) {
        throw new Error(`Missing embedding for chunk ${chunk.chunkIndex}`);
      }

      return chunkToPoint(
        {
          chunkIndex: chunk.chunkIndex,
          kind: chunk.kind ?? "prose",
          text: chunk.text,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          sectionPath: chunk.sectionPath ?? [],
          parentId: chunk.parentId ?? null,
          parentText: chunk.parentText ?? "",
          statementType:
            (chunk.statementType as
              | "balance_sheet"
              | "income_statement"
              | "cash_flow"
              | "equity"
              | "notes"
              | "mdna"
              | "other") ?? "other",
          consolidationScope:
            (chunk.consolidationScope as
              | "consolidated"
              | "parent_company"
              | "unspecified") ?? "unspecified",
        },
        { id: document.id, userId: document.userId, fileName: document.fileName },
        embedding,
        sparseVectorFor(chunk.text),
        contentHash,
      );
    });

    // 7. Upsert first, THEN delete trailing stale chunks. Never delete-first:
    // Qdrant has no atomic swap, so delete-then-upsert would leave an empty
    // (or half old / half new) document visible on failure.
    await upsertDocumentChunks(qdrantPoints);

    await deleteStaleChunks(document.id, processedChunks.length);

    // 8. Mark processing as successfully completed + record the hash so the
    // next identical re-ingest is a no-op.
    await prisma.document.update({
      where: {
        id: documentId,
      },
      data: {
        status: "COMPLETED",
        contentHash,
      },
    });
  } catch (error) {
    // Unwrap the error chain — pipeline stages wrap failures (e.g.
    // embeddingService wraps the raw Gemini error in a batch message), so
    // log message + cause together or the real reason stays hidden.
    const unwrapped =
      error instanceof Error
        ? error.cause instanceof Error
          ? `${error.message} — cause: ${error.cause.message}`
          : error.message
        : String(error);

    console.error(`[ingest] ${documentId}: FAILED`, unwrapped);

    await prisma.document.update({
      where: {
        id: documentId,
      },
      data: {
        status: "FAILED",
        failureReason: "PROCESSING_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Unknown processing error",
      },
    });

    throw error;
  }
}

/**
 * BullMQ worker handler. The queue adds retry/backoff; the attempt-count log
 * stays here (processDocumentById has no job context).
 */
export async function processDocument(
  job: Job<ProcessDocumentJob>,
): Promise<void> {
  const { documentId } = job.data;

  try {
    await processDocumentById(documentId);
  } catch (error) {
    const unwrapped =
      error instanceof Error
        ? error.cause instanceof Error
          ? `${error.message} — cause: ${error.cause.message}`
          : error.message
        : String(error);

    console.error(
      `[ingest] worker ${documentId}: FAILED (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1})`,
      unwrapped,
    );

    throw error;
  }
}
