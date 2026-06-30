import { Context } from "hono";
import prisma from "../db/dbConfig";
import { documentInitSchema } from "../validators/documentValidators";
import { calculateMultipartInfo } from "../utils/calculateChunks";
import { generateR2Key } from "../utils/r2Key";

import {
  createMultipartUpload,
  generatePresignedUrls,
  abortMultipartUpload,
} from "../services/r2Service";

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
        400
      );
    }

    const userId = c.get("userId");

    const { fileName, fileSize, mimeType } = result.data;

    const { chunkSize, totalParts } = calculateMultipartInfo(fileSize);

    const documentId = crypto.randomUUID();

    const r2Key = generateR2Key(userId,documentId);

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
      uploadId = await createMultipartUpload({r2Key,mimeType,});

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
      const presignedUrls =
        await generatePresignedUrls({
          r2Key,
          uploadId,
          totalParts,
        });

      return c.json(
        {
          success: true,
          message:
            "Document initialized successfully",
          data: {
            documentId,
            uploadId,
            chunkSize,
            totalParts,
            presignedUrls,
          },
        },
        200
      );
    } catch (error) {
      console.error(
        "Failed to initialize multipart upload:",
        error
      );

      // Cleanup multipart upload if it exists
      if (uploadId) {
        try {
          await abortMultipartUpload({
            r2Key,
            uploadId,
          });
        } catch (abortError) {
          console.error(
            "Failed to abort multipart upload:",
            abortError
          );
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
    console.error(
      "Upload initialization failed:",
      error
    );

    return c.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      500
    );
  }
};