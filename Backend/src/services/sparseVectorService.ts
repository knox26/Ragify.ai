/**
 * Zero-dependency sparse vectors for hybrid retrieval.
 *
 * Dense embeddings (gemini-embedding-2) capture semantic similarity but miss
 * exact-term matches — tickers ("TCS"), company names, table cell values.
 * Sparse vectors catch them: each term is hashed to a fixed dimension and
 * weighted by term frequency (Qdrant applies corpus IDF at query time via the
 * collection's sparse `modifier: "idf"`). The SAME tokenizer + hasher run at
 * ingest and at query time, so document and query land on identical
 * dimensions. Hand-rolled on purpose: @fastembed pulls onnxruntime-node, a
 * native binary with real Bun runtime compatibility risk.
 */

export const SPARSE_VECTOR_NAME = Bun.env.SPARSE_VECTOR_NAME ?? "text";
export const SPARSE_DIM = Number(Bun.env.SPARSE_DIM ?? 30_000);

// Common English words that carry no term-match signal. Deliberately does NOT
// include financial terms — numbers ("2026") and units ("share") must survive.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "of",
  "for", "with", "in", "on", "at", "to", "from", "by", "as", "is",
  "are", "was", "were", "be", "been", "being", "has", "have", "had",
  "do", "does", "did", "will", "would", "can", "could", "should",
  "may", "might", "must", "this", "that", "these", "those", "it",
  "its", "we", "our", "they", "their", "you", "your", "not", "no",
  "so", "than", "too", "very", "just", "about", "into", "over",
  "under", "also", "more", "most", "other", "some", "such", "only",
  "own", "same",
]);

export interface SparseVector {
  indices: number[];
  values: number[];
}

// Split on runs of characters that are NOT letters/numbers/`._-` — keeps
// "TCS.NS", "Q1-FY27", "P&L" style tokens intact while stripping punctuation
// and whitespace. Requires at least one letter or digit so stray punctuation
// ("...", "---") never becomes a dimension.
const TOKEN_SPLIT = /[^\p{L}\p{N}._-]+/u;
const HAS_ALNUM = /[\p{L}\p{N}]/u;

export function tokenize(text: string): string[] {
  const tokens: string[] = [];

  for (const raw of text.toLocaleLowerCase().split(TOKEN_SPLIT)) {
    if (raw.length <= 1) {
      continue;
    }

    if (!HAS_ALNUM.test(raw)) {
      continue;
    }

    if (STOPWORDS.has(raw)) {
      continue;
    }

    tokens.push(raw);
  }

  return tokens;
}

// FNV-1a 32-bit — fast, deterministic across processes (ingest worker and API
// server must agree on the hash of every token).
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function hashDim(token: string, dim = SPARSE_DIM): number {
  return fnv1a(token) % dim;
}

/**
 * Build the sparse vector for a text. Values are sqrt(term frequency) so a
 * repeated term (a name appearing many times in a table) dominates without
 * letting one runaway dimension saturate the vector.
 */
export function sparseVectorFor(text: string): SparseVector {
  const tf = new Map<number, number>();

  for (const token of tokenize(text)) {
    const dim = hashDim(token);

    tf.set(dim, (tf.get(dim) ?? 0) + 1);
  }

  const indices = [...tf.keys()].sort((a, b) => a - b);

  return {
    indices,
    values: indices.map((dim) => Math.sqrt(tf.get(dim) ?? 0)),
  };
}
