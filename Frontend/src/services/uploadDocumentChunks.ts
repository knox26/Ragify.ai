import axios from "axios";
import pMap from "p-map";

import type { uploadChunk } from "../utils/createUploadChunks";

const MAX_CONCURRENT_UPLOADS = 5;
const DEFAULT_PART_RETRIES = 3;
const RETRY_BACKOFF_MS = 300;
// A silent connection stall (dropped packets, no RST) would otherwise hang a
// part forever. Axios rejects with ECONNABORTED (no response) -> classified as
// "transient" -> retried by the existing backoff.
const PART_UPLOAD_TIMEOUT_MS = 30_000;

interface UploadDocumentChunksResult {
  uploadedChunks: UploadedPart[];
  failedChunks: uploadChunk[];
  // True when at least one part failed because its presigned URL was rejected
  // (HTTP 403). Retrying the same URL won't help — the caller should re-init
  // with the same documentId (idempotent, server regenerates URLs) and retry.
  urlExpired: boolean;
  // True when the upload was cancelled via the abort signal.
  aborted: boolean;
}

interface UploadedPart {
  chunkNumber: number;
  etag: string;
}

type PartFailure = "transient" | "url-expired" | "permanent" | "aborted";

type PartResult =
  | { kind: "ok"; chunk: uploadChunk; part: UploadedPart }
  | { kind: "failed"; chunk: uploadChunk; reason: PartFailure };

interface UploadDocumentChunksOptions {
  partRetries?: number;
  signal?: AbortSignal;
  // Called as each part succeeds, with cumulative counts for this call.
  onProgress?: (uploadedCount: number, totalCount: number) => void;
}

async function uploadChunk(
  chunk: uploadChunk,
  signal?: AbortSignal,
): Promise<UploadedPart> {
  const response = await axios.put(
    chunk.presignedUrl,
    chunk.blob,
    {
      headers: {
        "Content-Type": "application/octet-stream",
      },
      timeout: PART_UPLOAD_TIMEOUT_MS,
      signal,
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

function classifyFailure(error: unknown): PartFailure {
  if (axios.isCancel(error)) return "aborted";
  if (axios.isAxiosError(error) && error.response) {
    if (error.response.status === 403) return "url-expired";
    if (error.response.status >= 500) return "transient";
    return "permanent";
  }
  // No response at all (network error, timeout) — worth a retry.
  return "transient";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadPartWithRetries(
  chunk: uploadChunk,
  retries: number,
  signal?: AbortSignal,
): Promise<
  { ok: true; part: UploadedPart } | { ok: false; reason: PartFailure }
> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) return { ok: false, reason: "aborted" };

    try {
      const part = await uploadChunk(chunk, signal);
      return { ok: true, part };
    } catch (error) {
      const reason = classifyFailure(error);
      // A cancel must stop immediately — no retry. Otherwise retry only
      // transient failures (5xx / network); an expired URL or a permanent 4xx
      // won't fix itself on the same URL — surface it.
      if (reason === "aborted" || reason !== "transient" || attempt === retries) {
        return { ok: false, reason };
      }
      await sleep(RETRY_BACKOFF_MS * 2 ** attempt);
    }
  }
  return { ok: false, reason: "transient" };
}

// Uploads all parts in parallel (5 at a time). Each part gets its own
// transient-failure retries; a failed part is reported back so the caller can
// regenerate URLs and re-upload only the missing parts.
export async function uploadDocumentChunks(
  uploadChunks: uploadChunk[],
  options: UploadDocumentChunksOptions = {},
): Promise<UploadDocumentChunksResult> {
  const { partRetries = DEFAULT_PART_RETRIES, signal, onProgress } = options;
  const uploadedChunks: UploadedPart[] = [];
  const failedChunks: uploadChunk[] = [];
  let urlExpired = false;
  let aborted = false;
  let completedCount = 0;

  const results = await pMap(
    uploadChunks,
    async (chunk): Promise<PartResult> => {
      const result = await uploadPartWithRetries(chunk, partRetries, signal);

      if (result.ok) {
        completedCount++;
        onProgress?.(completedCount, uploadChunks.length);
        return { kind: "ok", chunk, part: result.part };
      }

      return { kind: "failed", chunk, reason: result.reason };
    },
    {
      concurrency: MAX_CONCURRENT_UPLOADS,
    },
  );

  results.forEach((result) => {
    if (result.kind === "ok") {
      uploadedChunks.push(result.part);
    } else {
      if (result.reason === "url-expired") {
        urlExpired = true;
      }
      if (result.reason === "aborted") {
        aborted = true;
      }
      failedChunks.push(result.chunk);
    }
  });

  return {
    uploadedChunks,
    failedChunks,
    urlExpired,
    aborted,
  };
}
