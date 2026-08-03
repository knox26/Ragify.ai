import axios from "axios";
import pMap from "p-map";

import type { uploadChunk } from "../utils/createUploadChunks";

const MAX_CONCURRENT_UPLOADS = 5;

interface UploadDocumentChunksResult {
  uploadedChunks: UploadedPart[];
  failedChunks: uploadChunk[];
}

interface UploadedPart {
  chunkNumber: number;
  etag: string;
}

// Upload a single part

async function uploadChunk(
  chunk: uploadChunk,
): Promise<UploadedPart> {
  const response = await axios.put(
    chunk.presignedUrl,
    chunk.blob,
    {
      headers: {
        "Content-Type": "application/octet-stream",
      },
    },
  );

  const etag = response.headers.etag;

  if (!etag) {
    throw new Error(
      `Missing ETag for chunk ${chunk.chunkNumber}`,
    );
  }

  return {
    chunkNumber: chunk.chunkNumber,
    etag: etag.replace(/"/g, ""),
  };
}

// uses uploadPart function to upload all parts parallely (5 at a times)
export async function uploadDocumentChunks(
  uploadChunks: uploadChunk[],
): Promise<UploadDocumentChunksResult> {
  const uploadedChunks: UploadedPart[] = [];
  const failedChunks: uploadChunk[] = [];

  const results = await pMap(
    uploadChunks,
    async (chunk) => {
      try {
        return await uploadChunk(chunk);
      } catch (error) {
        return error;
      }
    },
    {
      concurrency: MAX_CONCURRENT_UPLOADS,
    },
  );

  results.forEach((result, index) => {
    if (result instanceof Error) {
      console.error(
        `Failed to upload chunk ${uploadChunks[index].chunkNumber}`,
        result,
      );

      failedChunks.push(uploadChunks[index]);
    } else {
      uploadedChunks.push(result);
    }
  });

  return {
    uploadedChunks,
    failedChunks,
  };
}