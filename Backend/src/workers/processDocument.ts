import type { Job } from "bullmq";
import type { ProcessDocumentJob } from "../queues/documentQueue";
import prisma from "../db/dbConfig";
import { downloadDocument } from "../services/downloadDocumentService";
import { parseDocument } from "../parsers/documentParser";
import { createLlamaChunks } from "../services/llamaDocumentService";
import { generateEmbeddings } from "../services/embeddingService";
import {
  buildChunkPointId,
  upsertDocumentChunks,
  deleteStaleChunks,
} from "../services/qdrantCollectionService";

export async function processDocument(
  job: Job<ProcessDocumentJob>,
): Promise<void> {
  const { documentId } = job.data;

  const document = await prisma.document.findUnique({
    where: {
      id: documentId,
    },
  });

  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }

  // Claim atomically. Accept both QUEUED (normal path) and PROCESSING
  // (stalled re-run after a crash mid-job): if the worker died after
  // claiming but before marking COMPLETED, BullMQ's stalled-job recovery
  // re-runs this job while the document is still PROCESSING. It must be
  // re-claimable or the document would be stuck forever. The UUIDv5 point
  // IDs make the re-run idempotent, so re-processing is safe.
  const claimed = await prisma.document.updateMany({
    where: { id: documentId, status: { in: ["QUEUED", "PROCESSING"] } },
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
    // 1. Download original document from R2
    const fileBuffer = await downloadDocument({
      r2Key: document.r2Key,
    });

    // 2. Parse document into pages
    const pages = await parseDocument({
      buffer: fileBuffer,
      mimeType: document.mimeType,
    });

    // 3. Create lightweight semantic chunks using LlamaIndex.
    //
    // createLlamaChunks() returns:
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
    // We no longer carry LlamaIndex TextNode objects
    // through the rest of the pipeline.
    const processedChunks = await createLlamaChunks({
      pages,
      documentId: document.id,
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

      console.log(
        `Processed document ${documentId}: 0 chunks, existing vectors left untouched`,
      );

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
    // The order must remain unchanged.
    const texts = processedChunks.map((chunk) => chunk.text);

    // 6. Generate document embeddings.
    //
    // generateEmbeddings() internally batches requests
    // to Gemini, so we do NOT make one API request per chunk.
    const embeddings = await generateEmbeddings({
      texts,
      taskType: "RETRIEVAL_DOCUMENT",
    });

    // Safety check: make sure every chunk received an embedding.
    if (embeddings.length !== processedChunks.length) {
      throw new Error(
        `Embedding count mismatch: expected ${processedChunks.length}, received ${embeddings.length}`,
      );
    }

    console.log(
      `Generated ${embeddings.length} embeddings for document ${documentId}`,
    );

    const qdrantPoints = processedChunks.map((chunk, index) => {
      const embedding = embeddings[index];

      if (!embedding) {
        throw new Error(`Missing embedding for chunk ${chunk.chunkIndex}`);
      }

      return {
        id: buildChunkPointId(document.id, chunk.chunkIndex),

        vector: embedding,

        payload: {
          documentId: document.id,
          userId: document.userId,
          ...chunk,
        },
      };
    });

    await upsertDocumentChunks(qdrantPoints);

    await deleteStaleChunks(document.id, processedChunks.length);

    // 8. Mark processing as successfully completed.
    //
    // NOTE:
    // For the moment this happens after embedding generation.
    // Once Qdrant indexing is implemented, COMPLETED should
    // only happen after the Qdrant upsert + stale cleanup succeeds.
    await prisma.document.update({
      where: {
        id: documentId,
      },
      data: {
        status: "COMPLETED",
      },
    });

    console.log(
      `Processed document ${documentId}: ${processedChunks.length} chunks`,
    );
  } catch (error) {
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

    // Let BullMQ know the job failed so its retry/backoff
    // mechanism can handle it.
    throw error;
  }
}
