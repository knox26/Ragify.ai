import type { UploadStatus } from "@prisma/client";
import prisma from "../db/dbConfig";
import { abortMultipartUpload } from "../services/r2Service";

// Abandoned uploads have no advance path: the request path moves
// PENDING_UPLOAD -> UPLOAD_COMPLETED, and the scheduler enqueues from there.
// If the client vanishes mid-upload (closed tab, cancelled fetch, crash),
// nothing ever advances the row — it orphans forever and keeps the /statuses
// poll alive. Mark anything that has sat untouched past the window as FAILED
// and release its dangling R2 multipart upload.
//
// The window is generous: presigned part URLs expire in ~5m, so an upload
// older than the window was abandoned by construction.
const STALE_UPLOAD_MS = 6 * 60 * 60 * 1000; // 6h
const BATCH_SIZE = 100;

const STALE_STATUSES: UploadStatus[] = ["PENDING_UPLOAD", "UPLOAD_COMPLETED"];

/**
 * Mark stale PENDING_UPLOAD / UPLOAD_COMPLETED documents as FAILED and abort
 * their dangling R2 multipart uploads. Returns how many were reconciled.
 *
 * Staleness is measured by updatedAt, NOT createdAt: the PENDING_UPLOAD ->
 * UPLOAD_COMPLETED transition uses updateMany (which does not bump
 * @updatedAt), so for an upload that finished but was never enqueued,
 * updatedAt still tracks the init time — exactly when its multipart window
 * began. A row that both finished and is still younger than the window is one
 * the scheduler simply hasn't seen yet; the window gives it time to enqueue.
 *
 * QUEUED / PROCESSING are worker-owned and have BullMQ stalled-recovery —
 * never touch them here.
 *
 * The transition is a conditional claim: updateMany only matches rows that
 * are STILL in STALE_STATUSES, so a row the scheduler advanced between the
 * select above and the claim here (UPLOAD_COMPLETED -> QUEUED) is left alone.
 * The R2 abort runs only after the claim lands, never before.
 */
export async function reconcileStaleUploads(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_UPLOAD_MS);

  const stale = await prisma.document.findMany({
    where: {
      status: { in: STALE_STATUSES },
      updatedAt: { lt: cutoff },
    },
    select: { id: true, uploadId: true, r2Key: true },
    orderBy: { updatedAt: "asc" },
    take: BATCH_SIZE,
  });

  let reconciled = 0;

  for (const doc of stale) {
    // Claim atomically: only rows STILL stale are ours. If the scheduler
    // enqueued this row since the select, count is 0 and we walk away — no
    // clobbering a QUEUED row back to FAILED.
    const claim = await prisma.document.updateMany({
      where: { id: doc.id, status: { in: STALE_STATUSES } },
      data: {
        status: "FAILED",
        errorMessage: "Upload abandoned — never completed",
      },
    });

    if (claim.count === 0) {
      continue;
    }

    // Claimed, so the dangling R2 upload is ours to release. Best-effort —
    // it may already be gone, or the parts may have completed despite the DB
    // never recording it.
    if (doc.uploadId) {
      try {
        await abortMultipartUpload({ r2Key: doc.r2Key, uploadId: doc.uploadId });
      } catch (error) {
        console.error("[reconcile] failed to abort multipart:", error);
      }
    }

    reconciled++;
  }

  return reconciled;
}
