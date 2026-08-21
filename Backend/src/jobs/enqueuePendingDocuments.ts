import prisma from "../db/dbConfig";
import { documentProcessorQueue } from "../queues/documentQueue";
import { JOB_NAMES } from "../queues/queueConstants";

const BATCH_SIZE = 100;

/**
 * Poll the database for documents that finished uploading but have not
 * yet been enqueued for processing, and push them into BullMQ.
 *
 * This is the "outbox relay" — the request path (complete-upload) only
 * records intent by setting status = UPLOAD_COMPLETED. This job owns all
 * enqueueing, so Redis being unavailable during an upload no longer fails
 * the upload or leaves a document stuck.
 */
export async function enqueuePendingDocuments(): Promise<number> {
  const docs = await prisma.document.findMany({
    where: { status: "UPLOAD_COMPLETED" },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  let enqueued = 0;

  for (const doc of docs) {
    // Enqueue first, then mark QUEUED.
    //
    // If the worker picks the job up before status is QUEUED, its claim
    // (WHERE status = 'QUEUED') fails and BullMQ retries with backoff —
    // rare, cheap, and self-healing. The reverse order (QUEUED first) would
    // leave a permanently stuck QUEUED document if this enqueue fails.
    await documentProcessorQueue.add(
      JOB_NAMES.PROCESS_DOCUMENT,
      { documentId: doc.id },
      {
        // jobId = documentId makes re-enqueueing idempotent: a duplicate
        // poll (or a crash between enqueue and the status write) is a no-op.
        jobId: doc.id,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      },
    );

    await prisma.document.update({
      where: { id: doc.id },
      data: { status: "QUEUED" },
    });

    enqueued++;
  }

  return enqueued;
}
