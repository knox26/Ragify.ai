import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = Bun.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not configured");
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

export const EMBEDDING_MODEL = "gemini-embedding-2";

// Same env value qdrantCollectionService uses. A mismatch between embedding
// dimension and the Qdrant collection breaks every upsert, so both must read
// the same source of truth. Guarded here so NaN can't reach the API call.
const EMBEDDING_DIMENSION = Number(Bun.env.EMBEDDING_DIMENSION);

if (!Number.isInteger(EMBEDDING_DIMENSION) || EMBEDDING_DIMENSION <= 0) {
  throw new Error("EMBEDDING_DIMENSION must be a positive integer");
}

const EMBEDDING_BATCH_SIZE = 50;

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export interface GenerateEmbeddingsParams {
  texts: string[];
  taskType: EmbeddingTaskType;
}

export interface GenerateEmbeddingParams {
  text: string;
  taskType: EmbeddingTaskType;
}

export async function generateEmbeddings({
  texts,
  taskType,
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
    } catch (error) {
      throw new Error(
        `Failed to generate embeddings for batch starting at index ${start}`,
        {
          cause: error,
        },
      );
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
