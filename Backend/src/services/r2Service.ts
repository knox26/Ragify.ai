
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommandOutput,
  HeadObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { r2Client } from "../libs/r2Client";

const BUCKET_NAME = Bun.env.R2_BUCKET_NAME!;
const PRESIGNED_URL_EXPIRY = 60 * 5; // 5 minutes

// ======================================================
// Create Multipart Upload
// ======================================================

export interface CreateMultipartUploadParams {
  r2Key: string;
  mimeType: string;
}

export async function createMultipartUpload({
  r2Key,
  mimeType,
}: CreateMultipartUploadParams): Promise<string> {
  const response = await r2Client.send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key,
      ContentType: mimeType,
    })
  );

  if (!response.UploadId) {
    throw new Error("Failed to create multipart upload.");
  }

  return response.UploadId;
}

// ======================================================
// Generate Presigned URLs
// ======================================================

export interface GeneratePresignedUrlsParams {
  r2Key: string;
  uploadId: string;
  totalChunks: number;
}

export interface PresignedPart {
  chunkNumber: number;
  url: string;
}

export async function generatePresignedUrls({
  r2Key,
  uploadId,
  totalChunks,
}: GeneratePresignedUrlsParams): Promise<PresignedPart[]> {
  return Promise.all(
    Array.from({ length: totalChunks }, async (_, index) => {
      const chunkNumber = index + 1;

      const command = new UploadPartCommand({
        Bucket: BUCKET_NAME,
        Key: r2Key,
        UploadId: uploadId,
        PartNumber: chunkNumber,
      });

      const url = await getSignedUrl(
        r2Client,
        command,
        {
          expiresIn: PRESIGNED_URL_EXPIRY,
        }
      );

      return {
        chunkNumber,
        url,
      };
    })
  );
}

// ======================================================
// Abort Multipart Upload
// ======================================================

export interface AbortMultipartUploadParams {
  r2Key: string;
  uploadId: string;
}

export async function abortMultipartUpload({
  r2Key,
  uploadId,
}: AbortMultipartUploadParams): Promise<void> {
  await r2Client.send(
    new AbortMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key,
      UploadId: uploadId,
    })
  );
}

// ======================================================
// Complete Multipart Upload
// ======================================================

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

export interface CompleteMultipartUploadParams {
  r2Key: string;
  uploadId: string;
  parts: UploadedPart[];
}

export async function completeMultipartUpload({
  r2Key,
  uploadId,
  parts,
}: CompleteMultipartUploadParams): Promise<CompleteMultipartUploadCommandOutput> {
  const sortedParts = [...parts].sort(
    (a, b) => a.partNumber - b.partNumber
  );

  const command = new CompleteMultipartUploadCommand({
    Bucket: BUCKET_NAME,
    Key: r2Key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: sortedParts.map((part) => ({
        ETag: part.etag,
        PartNumber: part.partNumber,
      })),
    },
  });

  return r2Client.send(command);
}

// ======================================================
// Object Existence Check
// ======================================================

export async function r2ObjectExists(r2Key: string): Promise<boolean> {
  try {
    await r2Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: r2Key,
      }),
    );

    return true;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    const httpStatusCode = (
      error as { $metadata?: { httpStatusCode?: number } }
    )?.$metadata?.httpStatusCode;

    // 404 / NotFound means the object does not exist yet.
    if (name === "NotFound" || httpStatusCode === 404) {
      return false;
    }

    // Any other error (network, auth, throttling) means we cannot determine
    // existence — propagate it so the caller can decide.
    throw error;
  }
}


// Backend → src/services/r2Service.ts

