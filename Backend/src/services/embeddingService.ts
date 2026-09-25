import { GoogleGenAI } from "@google/genai";
import {
  isTransientNetworkError,
  rateLimitInfo,
} from "../utils/retry";
import {
  configuredGeminiKeyCount,
  pickNextGeminiClient,
  rotateAfterRateLimit,
} from "./geminiClient";

if (configuredGeminiKeyCount() === 0) {
  throw new Error("GEMINI_API_KEY is not configured");
}

let ai: GoogleGenAI = pickNextGeminiClient() as GoogleGenAI;

export const EMBEDDING_MODEL = "gemini-embedding-2";

// Same env value qdrantCollectionService uses. A mismatch between embedding
// dimension and the Qdrant collection breaks every upsert, so both must read
// the same source of truth. Guarded here so NaN can't reach the API call.
const EMBEDDING_DIMENSION = Number(Bun.env.EMBEDDING_DIMENSION);

if (!Number.isInteger(EMBEDDING_DIMENSION) || EMBEDDING_DIMENSION <= 0) {
  throw new Error("EMBEDDING_DIMENSION must be a positive integer");
}

const EMBEDDING_BATCH_SIZE = 50;

// Free tier caps gemini-embedding-2 at ~100 texts/minute with a ~1000-text
// rolling window. A large 10-K has more chunks than that, so a burst of
// batches always hits a 429 — and once cumulative usage crosses ~1000 the
// window stays saturated for ~20-30 min, long enough that a short attempt
// count gives up on a batch that WOULD have succeeded. Rather than fail the
// whole document, back off by the API's own retryDelay and retry the batch.
// Budget is TIME not attempt count, sized to outlast a full saturation stall.
const EMBED_RETRY_BUDGET_MS = Number(
  Bun.env.EMBED_RETRY_BUDGET_MS ?? 60 * 60_000,
);

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

// Transient network failures (dropped socket, ECONNRESET, fetch timeout) are
// retryable too — a doc must not FAIL just because a connection hiccuped.
const EMBED_NET_RETRY_ATTEMPTS = 5;
const EMBED_NET_RETRY_DELAY_MS = 5_000;

export interface GenerateEmbeddingsParams {
  texts: string[];
  taskType: EmbeddingTaskType;
  /** Optional caller label (e.g. documentId) for progress logs. */
  label?: string;
}

export interface GenerateEmbeddingParams {
  text: string;
  taskType: EmbeddingTaskType;
}

export async function generateEmbeddings({
  texts,
  taskType,
  label,
}: GenerateEmbeddingsParams): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const normalizedTexts = texts.map((text, index) => {
    if (typeof text !== "string") {
      throw new Error(`Embedding input at index ${index} must be a string`);
    }

    const normalized = text.trim();

    if (!normalized) {
      throw new Error(`Embedding input at index ${index} is empty`);
    }

    return normalized;
  });

  const embeddings: number[][] = [];

  for (
    let start = 0;
    start < normalizedTexts.length;
    start += EMBEDDING_BATCH_SIZE
  ) {
    const batch = normalizedTexts.slice(start, start + EMBEDDING_BATCH_SIZE);

    const retryDeadline = Date.now() + EMBED_RETRY_BUDGET_MS;
    let networkAttempts = 0;

    for (;;) {
      try {
        // Must be Content[] with one text part per entry. Passing a plain
        // string[] makes the SDK collapse the whole batch into a single
        // content, so Gemini returns ONE embedding for N texts and the count
        // check below throws.
        const response = await ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: batch.map((text) => ({ parts: [{ text }] })),
          config: {
            taskType,
            outputDimensionality: EMBEDDING_DIMENSION,
          },
        });

        const batchEmbeddings = response.embeddings;

        if (!batchEmbeddings) {
          throw new Error("Gemini returned no embeddings");
        }

        if (batchEmbeddings.length !== batch.length) {
          throw new Error(
            `Embedding count mismatch: expected ${batch.length}, received ${batchEmbeddings.length}`,
          );
        }

        /*
         * Gemini's response is assumed to preserve the same positional
         * correspondence as the input contents:
         *
         * batch[0] -> batchEmbeddings[0]
         * batch[1] -> batchEmbeddings[1]
         * ...
         *
         * The API response does not provide an explicit chunk identifier
         * that we can use to independently verify this mapping.
         */
        for (const embedding of batchEmbeddings) {
          if (!embedding.values) {
            throw new Error("Gemini returned an embedding without values");
          }

          if (embedding.values.length !== EMBEDDING_DIMENSION) {
            throw new Error(
              `Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, received ${embedding.values.length}`,
            );
          }

          embeddings.push(embedding.values);
        }

        if (label) {
          console.log(
            `[embed] ${label} batch ${start}-${start + batch.length} done ` +
              `(${embeddings.length}/${normalizedTexts.length} texts)`,
          );
        }

        break;
      } catch (error) {
        // A rate-limited batch retries after the API's own retryDelay (free
        // tier caps at ~100 texts/min, so large 10-Ks always cross it).
        // Retry until the time budget is gone — the window can take minutes to
        // roll after a prior document saturated it. Rotation across the
        // configured API keys happens here: when one hits the per-key daily
        // quota, marking it in cooldown and switching to the next healthy key
        // spreads load across the project's free-tier accounts.
        const limit = rateLimitInfo(error);

        if (limit.isRateLimit) {
          ai = rotateAfterRateLimit(ai, limit.retryMs) ?? ai;

          if (Date.now() >= retryDeadline) {
            throw new Error(
              `Failed to generate embeddings for batch starting at index ${start}`,
              {
                cause: error,
              },
            );
          }

          const waitMs = Math.min(
            limit.retryMs,
            Math.max(0, retryDeadline - Date.now()),
          );

          if (label) {
            console.log(
              `[embed] ${label} batch ${start}-${start + batch.length} ` +
                `rate-limited, rotated key (wait ${Math.round(waitMs / 1000)}s, ` +
                `budget left ${Math.round((retryDeadline - Date.now()) / 1000)}s)`,
            );
          }

          await Bun.sleep(waitMs);
          continue;
        }

        // Transient socket/fetch errors retry a few times with a short delay
        // instead of failing the whole document.
        if (
          isTransientNetworkError(error) &&
          networkAttempts < EMBED_NET_RETRY_ATTEMPTS
        ) {
          networkAttempts++;

          if (label) {
            console.log(
              `[embed] ${label} batch ${start}-${start + batch.length} ` +
                `network error, retry ${networkAttempts}/${EMBED_NET_RETRY_ATTEMPTS} in ${EMBED_NET_RETRY_DELAY_MS / 1000}s`,
            );
          }

          await Bun.sleep(EMBED_NET_RETRY_DELAY_MS);
          continue;
        }

        throw new Error(
          `Failed to generate embeddings for batch starting at index ${start}`,
          {
            cause: error,
          },
        );
      }
    }
  }

  return embeddings;
}

export async function generateEmbedding({
  text,
  taskType,
}: GenerateEmbeddingParams): Promise<number[]> {
  const [embedding] = await generateEmbeddings({
    texts: [text],
    taskType,
  });

  return embedding;
}
