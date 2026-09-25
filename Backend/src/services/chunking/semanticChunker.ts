/**
 * Embedding-similarity chunking for long, heading-free prose runs.
 * Applied ONLY there — never to tables, headed sections, or short runs.
 * Fail-open: any embed error returns null so the caller keeps the
 * token-boundary pieces. One batched generateEmbeddings call per run
 * (never one request per window).
 */

import { generateEmbeddings } from "../embeddingService";
import {
  CHILD_TOKEN_TARGET,
  SEMANTIC_BOUNDARY_THRESHOLD,
  SEMANTIC_CHUNKING_ENABLED,
  SEMANTIC_MIN_RUN_CHARS,
  SEMANTIC_WINDOW_OVERLAP,
  SEMANTIC_WINDOW_SENTENCES,
} from "./constants";

export type EmbedTexts = (texts: string[]) => Promise<number[][]>;

/** Rough token estimate for boundary sizing (embedding text is ~4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function splitSentences(runText: string): string[] {
  return runText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function buildWindows(sentences: string[]): string[][] {
  const windows: string[][] = [];
  const step = Math.max(1, SEMANTIC_WINDOW_SENTENCES - SEMANTIC_WINDOW_OVERLAP);
  for (let i = 0; i < sentences.length; i += step) {
    const window = sentences.slice(i, i + SEMANTIC_WINDOW_SENTENCES);
    if (window.length > 0) windows.push(window);
    if (i + SEMANTIC_WINDOW_SENTENCES >= sentences.length) break;
  }
  return windows;
}

/** Pure: boundary sentence indexes from window similarities. Exposed for tests. */
export function boundariesFromSimilarities(
  similarities: number[],
  sentences: string[],
  opts?: { tokenTarget?: number; threshold?: number },
): number[] {
  const target = opts?.tokenTarget ?? CHILD_TOKEN_TARGET;
  const threshold = opts?.threshold ?? SEMANTIC_BOUNDARY_THRESHOLD;
  const boundaries: number[] = [];
  let accTokens = 0;

  for (let gap = 0; gap < similarities.length; gap++) {
    accTokens += estimateTokens(sentences[gap] ?? "");
    // Gap g sits between window g and g+1 ≈ after sentence g+overlap.
    if ((similarities[gap] ?? 1) < threshold && accTokens >= target) {
      boundaries.push(gap + 1);
      accTokens = 0;
    }
  }

  return boundaries;
}

/** Gate: long, heading-free prose runs only. */
export function shouldSemanticSplit(runText: string, sentenceCount: number): boolean {
  if (!SEMANTIC_CHUNKING_ENABLED) return false;
  if (runText.length < SEMANTIC_MIN_RUN_CHARS) return false;
  return sentenceCount > SEMANTIC_WINDOW_SENTENCES * 2;
}

/**
 * Split a prose run at embedding-similarity boundaries. Returns the piece
 * strings, or null when splitting is disabled, not applicable, or the embed
 * call fails (caller keeps token-boundary pieces).
 */
export async function semanticSplitRun(
  runText: string,
  deps?: { embedTexts?: EmbedTexts },
): Promise<string[] | null> {
  const sentences = splitSentences(runText);
  if (!shouldSemanticSplit(runText, sentences.length)) return null;

  const windows = buildWindows(sentences);
  if (windows.length < 2) return null;

  const embed: EmbedTexts =
    deps?.embedTexts ??
    ((texts) =>
      generateEmbeddings({ texts, taskType: "RETRIEVAL_DOCUMENT", label: "semantic-split" }));

  let vectors: number[][];
  try {
    vectors = await embed(windows.map((w) => w.join(" ")));
  } catch {
    return null;
  }
  if (vectors.length !== windows.length) return null;

  const similarities: number[] = [];
  for (let i = 0; i + 1 < vectors.length; i++) {
    similarities.push(cosine(vectors[i] ?? [], vectors[i + 1] ?? []));
  }

  const boundaries = boundariesFromSimilarities(similarities, sentences);
  if (boundaries.length === 0) return null;

  const pieces: string[] = [];
  let start = 0;
  for (const b of [...boundaries, sentences.length]) {
    pieces.push(sentences.slice(start, b).join(" "));
    start = b;
  }
  return pieces.filter((p) => p.trim().length > 0);
}
