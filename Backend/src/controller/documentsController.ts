import { Context } from "hono";
import { UploadStatus } from "@prisma/client";
import prisma from "../db/dbConfig";
import {
  documentInitSchema,
  completeUploadSchema,
} from "../validators/documentValidators";
import { calculateMultipartInfo } from "../utils/calculateChunks";
import { generateR2Key } from "../utils/r2Key";
import { buildPage, keysetWhere, readPagination } from "../utils/pagination";
import { isUuid } from "../utils/isUuid";

import {
  createMultipartUpload,
  generatePresignedUrls,
  abortMultipartUpload,
  completeMultipartUpload,
  r2ObjectExists,
} from "../services/r2Service";

/**
 * Shared `status` query filter for the list and count endpoints. An absent
 * param means "all statuses"; an invalid value is a client bug, so reject it
 * rather than silently returning every row.
 */
function readStatusFilter(
  query: Record<string, string | undefined>,
): { ok: true; status?: UploadStatus } | { ok: false } {
  const raw = query.status?.trim();
  if (!raw) return { ok: true };
  if (!(Object.values(UploadStatus) as string[]).includes(raw)) {
    return { ok: false };
  }
  return { ok: true, status: raw as UploadStatus };
}

export const initUploadController = async (c: Context) => {
  try {
    const body = await c.req.json();

    const result = documentInitSchema.safeParse(body);

    if (!result.success) {
      return c.json(
        {
          success: false,
          message: "Invalid request body",
          errors: result.error.flatten(),
        },
        400,
      );
    }

    const userId = c.get("userId");

    const { documentId, fileName, fileSize, mimeType } = result.data;

    const { chunkSize, totalChunks } = calculateMultipartInfo(fileSize);

    const r2Key = generateR2Key(userId, documentId);

    // Idempotency: the client-generated documentId doubles as the retry key.
    // A retry after a lost response (network drop / crash between the row
    // create and the R2 create) reuses the same documentId, so look it up
    // before creating anything new — otherwise every retry orphans the
    // previous PENDING_UPLOAD row and its R2 multipart upload.
    const existing = await prisma.document.findUnique({
      where: { id: documentId, userId },
    });

    if (existing) {
      // Already progressed past init — a prior complete-upload (or failure)
      // moved the state machine on. Report where things stand instead of
      // creating a duplicate.
      if (existing.status !== "PENDING_UPLOAD") {
        return c.json(
          {
            success: true,
            message: "Upload already initialized",
            data: {
              documentId,
              status: existing.status,
            },
          },
          200,
        );
      }

      let uploadId = existing.uploadId;

      if (!uploadId) {
        // Crash between row creation and multipart creation — recreate.
        uploadId = await createMultipartUpload({ r2Key, mimeType });

        await prisma.document.update({
          where: { id: documentId },
          data: { uploadId },
        });
      }

      // Reuse the SAME uploadId (a fresh multipart would orphan the old one)
      // and regenerate presigned URLs — the previous ones may have expired by
      // the time the client retries.
      const presignedUrls = await generatePresignedUrls({
        r2Key,
        uploadId,
        totalChunks,
      });

      return c.json(
        {
          success: true,
          message: "Upload already initialized",
          data: {
            documentId,
            chunkSize,
            presignedUrls,
          },
        },
        200,
      );
    }

    // Create document row first
    await prisma.document.create({
      data: {
        id: documentId,
        fileName,
        fileSize,
        mimeType,
        r2Key,
        userId,
        status: "PENDING_UPLOAD",
      },
    });

    let uploadId: string | undefined;

    try {
      // Create multipart upload on R2
      uploadId = await createMultipartUpload({ r2Key, mimeType });

      // Save uploadId
      await prisma.document.update({
        where: {
          id: documentId,
        },
        data: {
          uploadId,
        },
      });

      // Generate presigned URLs
      const presignedUrls = await generatePresignedUrls({
        r2Key,
        uploadId,
        totalChunks,
      });

      return c.json(
        {
          success: true,
          message: "Document initialized successfully",
          data: {
            documentId,
            chunkSize,
            presignedUrls,
          },
        },
        200,
      );
    } catch (error) {
      console.error("Failed to initialize multipart upload:", error);

      // Cleanup multipart upload if it exists
      if (uploadId) {
        try {
          await abortMultipartUpload({
            r2Key,
            uploadId,
          });
        } catch (abortError) {
          console.error("Failed to abort multipart upload:", abortError);
        }
      }

      // Mark document as failed
      await prisma.document.update({
        where: {
          id: documentId,
        },
        data: {
          status: "FAILED",
          errorMessage:
            error instanceof Error
              ? error.message
              : "Upload initialization failed",
        },
      });

      throw error;
    }
  } catch (error) {
    console.error("Upload initialization failed:", error);

    return c.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      500,
    );
  }
};

export const completeUploadController = async (c: Context) => {
  try {
    const body = await c.req.json();

    const result = completeUploadSchema.safeParse(body);

    if (!result.success) {
      return c.json(
        {
          success: false,
          message: "Invalid request body",
          errors: result.error.flatten(),
        },
        400,
      );
    }

    const { documentId, chunks } = result.data;

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return c.json(
        {
          success: false,
          message: "Document not found",
        },
        404,
      );
    }

    if (document.userId !== c.get("userId")) {
      return c.json(
        {
          success: false,
          message: "Unauthorized",
        },
        403,
      );
    }

    if (document.status !== "PENDING_UPLOAD") {
      // Idempotency: a duplicate complete-upload should not fail if the
      // document already progressed past PENDING_UPLOAD. Return its current
      // status instead. FAILED stays an error so the client re-inits.
      if (
        document.status === "UPLOAD_COMPLETED" ||
        document.status === "QUEUED" ||
        document.status === "PROCESSING" ||
        document.status === "COMPLETED"
      ) {
        return c.json(
          {
            success: true,
            message: "Upload already completed",
            data: {
              documentId,
              status: document.status,
            },
          },
          200,
        );
      }

      return c.json(
        {
          success: false,
          message: `Document is not in PENDING_UPLOAD state (current: ${document.status})`,
        },
        400,
      );
    }

    if (!document.uploadId) {
      return c.json(
        { success: false, message: "Upload session not found" },
        400,
      );
    }

    try {
      await completeMultipartUpload({
        r2Key: document.r2Key,
        uploadId: document.uploadId,
        parts: chunks.map(({ chunkNumber, etag }) => ({
          partNumber: chunkNumber,
          etag,
        })),
      });
    } catch (error) {
      // CompleteMultipartUpload is NOT idempotent. A retry after a lost
      // response (or a crash between the R2 call and the status write)
      // re-calls it and gets NoSuchUpload. Before declaring failure, check
      // whether the finished object already exists — if it does, the
      // previous attempt actually succeeded.
      let alreadyCompleted = false;

      try {
        alreadyCompleted = await r2ObjectExists(document.r2Key);
      } catch (headError) {
        // Could not determine object existence (network/auth error). Do NOT
        // mark FAILED — the document stays PENDING_UPLOAD so a later retry
        // can recover once R2 is reachable again.
        throw error;
      }

      if (!alreadyCompleted) {
        // Genuine failure: no object, so the upload never completed.
        try {
          await abortMultipartUpload({
            r2Key: document.r2Key,
            uploadId: document.uploadId,
          });
        } catch (abortError) {
          console.error(abortError);
        }

        await prisma.document.update({
          where: { id: documentId },
          data: {
            status: "FAILED",
            errorMessage:
              error instanceof Error ? error.message : "Upload failed",
          },
        });

        throw error;
      }

      // Object exists — the previous attempt completed successfully.
      // Fall through to the atomic claim below.
    }

    // Atomically move PENDING_UPLOAD -> UPLOAD_COMPLETED.
    //
    // No Redis call here: the request path only records that the upload is
    // done. The scheduler (src/jobs/scheduler.ts) polls for UPLOAD_COMPLETED
    // documents and enqueues them into BullMQ.
    //
    // This keeps uploads independent of Redis availability and closes the
    // "QUEUED but never enqueued" gap from enqueueing in the request path.
    const completed = await prisma.document.updateMany({
      where: { id: documentId, status: "PENDING_UPLOAD" },
      data: { status: "UPLOAD_COMPLETED" },
    });

    if (completed.count === 0) {
      // Another request already claimed this document — duplicate
      // complete-upload. Return its current status.
      const current = await prisma.document.findUnique({
        where: { id: documentId },
        select: { status: true },
      });

      return c.json(
        {
          success: true,
          message: "Upload already completed",
          data: {
            documentId,
            status: current?.status,
          },
        },
        200,
      );
    }

    return c.json(
      {
        success: true,
        message: "Upload completed successfully",
        data: {
          documentId,
          status: "UPLOAD_COMPLETED",
        },
      },
      200,
    );
  } catch (error) {
    console.error("Failed to complete upload:", error);

    return c.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      500,
    );
  }
};

// Settled documents (COMPLETED / FAILED) can never change, so they're not
// worth polling. The statuses endpoint only returns the rows a client could
// act on — keeps the poll payload tiny.
const NON_TERMINAL_STATUSES: UploadStatus[] = [
  "PENDING_UPLOAD",
  "UPLOAD_COMPLETED",
  "QUEUED",
  "PROCESSING",
];

export const getDocumentStatusesController = async (c: Context) => {
  try {
    const userId = c.get("userId");

    // The poll is a bounded snapshot, not a navigable list: take the newest
    // non-terminal rows (probe +1) and report whether more exist. That keeps
    // the every-3s tick cheap even while abandoned uploads accumulate, and
    // lets the frontend keep polling until the pile drains.
    const pageParams = readPagination(c.req.query());
    if (!pageParams.ok) {
      return c.json({ success: false, message: pageParams.message }, 400);
    }

    const docs = await prisma.document.findMany({
      where: { userId, status: { in: NON_TERMINAL_STATUSES } },
      select: { id: true, status: true, updatedAt: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: pageParams.limit + 1,
    });

    const { rows, pagination } = buildPage(
      docs,
      pageParams.limit,
      (doc) => ({ c: doc.updatedAt, i: doc.id }),
    );

    return c.json({ success: true, data: rows, pagination });
  } catch (error) {
    console.error("Failed to fetch document statuses:", error);

    return c.json({ success: false, message: "Internal Server Error" }, 500);
  }
};

export const getDocumentCountController = async (c: Context) => {
  try {
    const userId = c.get("userId");

    const statusFilter = readStatusFilter(c.req.query());
    if (!statusFilter.ok) {
      return c.json({ success: false, message: "Invalid status filter" }, 400);
    }

    const count = await prisma.document.count({
      where: {
        userId,
        ...(statusFilter.status ? { status: statusFilter.status } : {}),
      },
    });

    return c.json({ success: true, data: { count } });
  } catch (error) {
    console.error("Failed to count documents:", error);

    return c.json({ success: false, message: "Internal Server Error" }, 500);
  }
};

export const getDocumentController = async (c: Context) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id") ?? "";

    // Prisma would pass a non-UUID straight to Postgres and throw a 22P02
    // invalid-input-syntax error (500). Reject it as a missing resource
    // instead — same guard the chat controllers use.
    if (!isUuid(id)) {
      return c.json({ success: false, message: "Document not found" }, 404);
    }

    const doc = await prisma.document.findFirst({
      where: { id, userId },
      select: { id: true, fileName: true },
    });

    if (!doc) {
      return c.json({ success: false, message: "Document not found" }, 404);
    }

    return c.json({ success: true, data: doc });
  } catch (error) {
    console.error("Failed to fetch document:", error);

    return c.json({ success: false, message: "Internal Server Error" }, 500);
  }
};

export const getDocumentsController = async (c: Context) => {
  try {
    const userId = c.get("userId");

    const pageParams = readPagination(c.req.query());
    if (!pageParams.ok) {
      return c.json({ success: false, message: pageParams.message }, 400);
    }

    const statusFilter = readStatusFilter(c.req.query());
    if (!statusFilter.ok) {
      return c.json({ success: false, message: "Invalid status filter" }, 400);
    }

    // Case-insensitive name search, bounded to a sane length. The keyset
    // cursor keeps pagination itself indexed; the substring match is served
    // by the pg_trgm GIN index on "fileName" (add_file_name_trgm_index).
    const search = c.req.query("search")?.trim().slice(0, 200);

    const documents = await prisma.document.findMany({
      where: {
        userId,
        ...(statusFilter.status ? { status: statusFilter.status } : {}),
        ...(search
          ? { fileName: { contains: search, mode: "insensitive" } }
          : {}),
        ...keysetWhere("lt", pageParams.cursor, "createdAt"),
      },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        status: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageParams.limit + 1,
    });

    const { rows, pagination } = buildPage(
      documents,
      pageParams.limit,
      (doc) => ({ c: doc.createdAt, i: doc.id }),
    );

    return c.json({
      success: true,
      data: rows.map((doc) => ({
        ...doc,
        fileSize: Number(doc.fileSize),
      })),
      pagination,
    });
  } catch (error) {
    console.error("Failed to fetch documents:", error);

    return c.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      500,
    );
  }
};
