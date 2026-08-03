
import type { PresignedPart } from "../lib/api";

export interface uploadChunk {
  chunkNumber: number;
  blob: Blob;
  presignedUrl: string;
}

interface CreateUploadChunksParams {
  file: File;
  chunkSize: number;
  presignedUrls: PresignedPart[];
}

export function createUploadChunks({
  file,
  chunkSize,
  presignedUrls,
}: CreateUploadChunksParams): uploadChunk[] {
  if (chunkSize <= 0) {
    throw new Error("Chunk size must be greater than zero.");
  }

  const expectedParts = Math.ceil(file.size / chunkSize);

  if (expectedParts !== presignedUrls.length) {
    throw new Error(
      `Expected ${expectedParts} presigned URLs but received ${presignedUrls.length}.`
    );
  }

  return presignedUrls.map(({ chunkNumber, url }) => {
    const start = (chunkNumber - 1) * chunkSize;
    const end = Math.min(start + chunkSize, file.size);

    return {
      chunkNumber,
      blob: file.slice(start, end),
      presignedUrl: url,
    };
  });
}