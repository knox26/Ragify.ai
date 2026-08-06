import { Context } from "hono";
import prisma from "../db/dbConfig";
import {
  documentInitSchema,
  completeUploadSchema,
} from "../validators/documentValidators";
import { calculateMultipartInfo } from "../utils/calculateChunks";
import { generateR2Key } from "../utils/r2Key";

import {
  createMultipartUpload,
  generatePresignedUrls,
  abortMultipartUpload,
  completeMultipartUpload,
} from "../services/r2Service";

import { JOB_NAMES } from "../queues/queueConstants";

import { documentProcessorQueue } from "../queues/documentQueue";

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

    const { fileName, fileSize, mimeType } = result.data;

    const { chunkSize, totalChunks } = calculateMultipartInfo(fileSize);

    const documentId = crypto.randomUUID();

    const r2Key = generateR2Key(userId, documentId);

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
      return c.json(
        {
          success: false,
          message: "Document is not in PENDING_UPLOAD state",
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
      const completeUploadResponse = await completeMultipartUpload({
        r2Key: document.r2Key,
        uploadId: document.uploadId,
        parts: chunks.map(({ chunkNumber, etag }) => ({
          partNumber: chunkNumber,
          etag,
        })),
      });

      // if complete upload fails, then abort the upload

      if (completeUploadResponse.$metadata.httpStatusCode !== 200) {
        throw new Error("Failed to complete multipart upload");
      }
    } catch (error) {
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

    console.log("upload completed successfully");

    //add job to the queue
    try {
      await documentProcessorQueue.add(
        JOB_NAMES.PROCESS_DOCUMENT,
        {
          documentId,
        },
        {
          jobId: documentId,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
        },
      );
    } catch (error) {
      console.error("Failed to enqueue document", error);

      await prisma.document.update({
        where: { id: documentId },
        data: {
          errorMessage: "Failed to queue document for processing",
        },
      });

      throw error;
    }

    console.log("job added to the queue");

    //if complete upload successfull, then update the document status to QUEUED

    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "QUEUED",
      },
    });

    return c.json(
      {
        success: true,
        message: "Upload completed successfully",
        data: {
          documentId: updatedDocument.id,
          status: updatedDocument.status,
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

export const getDocumentsController = async (c: Context) => {
  try {
    const userId = c.get("userId");

    const documents = await prisma.document.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedDocuments = documents.map((doc) => ({
      ...doc,
      fileSize: Number(doc.fileSize),
    }));

    return c.json({
      success: true,
      data: formattedDocuments,
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
