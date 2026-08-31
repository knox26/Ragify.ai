import { generateText } from "./chatService";
import {
  CHAT_TOP_K,
  retrieveChunks,
  type RetrievedChunk,
} from "./retrievalService";
import {
  decomposeQuery,
  mergeSubqueryChunks,
  SUB_QUERY_TOP_K,
} from "./subqueryService";

// Iterative gap-filling retrieval (S2G-RAG style). After the initial
// decomposition + retrieval, check whether the merged excerpts actually contain
// enough to answer. When a piece is missing, ask the model to name it, run a
// targeted follow-up retrieval for that piece, and re-merge with a wider cap.
// Bounded so a confident-but-wrong gap judgment can't loop forever.
const GAP_FILL_ENABLED = (Bun.env.GAP_FILL_ENABLED ?? "true") !== "false";
export const GAP_FILL_MAX_ROUNDS = Number(Bun.env.GAP_FILL_MAX_ROUNDS ?? 2);
export const GAP_FILL_TOP_K = Number(Bun.env.GAP_FILL_TOP_K ?? 12);
export const GAP_FILL_MAX_CHUNKS = Number(Bun.env.GAP_FILL_MAX_CHUNKS ?? 16);

// How much of each chunk's text the gap check sees. Enough to read financial
// statement line-item labels without paying to ship the whole excerpt twice.
const GAP_CHECK_CHARS = 700;

const GAP_SYSTEM = [
  "You check whether the provided document excerpts contain enough information to fully answer a question.",
  "If a specific piece of information needed to answer is absent from the excerpts, list each missing piece as a short, standalone retrieval query.",
  'Return ONLY valid JSON: {"complete": true} when sufficient, or {"complete": false, "missing": ["<query>", "..."]} with at most 3 missing items.',
  "No explanations, no markdown, no text outside the JSON.",
].join("\n");

/**
 * Parse the gap-check response into a list of follow-up retrieval queries.
 * Defensive: any malformed response is treated as "complete" so a parsing
 * hiccup never degrades an otherwise-answerable question into extra work.
 */
export function parseGapResponse(raw: string): string[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);

  if (!objectMatch) {
    return [];
  }

  let parsed: { complete?: unknown; missing?: unknown };

  try {
    parsed = JSON.parse(objectMatch[0]);
  } catch {
    return [];
  }

  // Only gap-fill on an explicit "incomplete" signal. A missing/absent
  // `complete` field is treated as sufficient so a stray `missing` list can't
  // trigger spurious follow-up retrievals.
  if (parsed.complete !== false || !Array.isArray(parsed.missing)) {
    return [];
  }

  return parsed.missing
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .map((q) => q.trim())
    .slice(0, 3);
}

async function detectGaps(
  question: string,
  chunks: RetrievedChunk[],
): Promise<string[]> {
  const excerptBlock = chunks
    .map((chunk, index) => {
      const text =
        chunk.text.length > GAP_CHECK_CHARS
          ? `${chunk.text.slice(0, GAP_CHECK_CHARS)}…`
          : chunk.text;

      return `[${index + 1}] ${chunk.fileName} (p.${chunk.pageStart}-${chunk.pageEnd})\n${text}`;
    })
    .join("\n\n");

  const user = `QUESTION: ${question}\n\nDOCUMENT EXCERPTS:\n${excerptBlock}`;

  try {
    const raw = await generateText({
      system: GAP_SYSTEM,
      user,
    });

    return parseGapResponse(raw);
  } catch {
    // Gap detection is best-effort: on any failure, fall through with the
    // current chunks rather than breaking the answer.
    return [];
  }
}

/**
 * Full retrieval path: decompose -> parallel hybrid retrieval per subquery ->
 * merge to CHAT_TOP_K, then bounded gap-fill rounds that widen context only
 * when the model says a needed piece is still missing.
 */
export async function retrieveWithGapFill({
  userId,
  question,
  documentId,
}: {
  userId: string;
  question: string;
  documentId?: string | null;
}): Promise<RetrievedChunk[]> {
  const subqueries = await decomposeQuery(question);

  const groups = await Promise.all(
    subqueries.map((subquery) =>
      retrieveChunks({
        userId,
        query: subquery,
        documentId,
        topK: SUB_QUERY_TOP_K,
      }),
    ),
  );

  let chunks = mergeSubqueryChunks(groups, CHAT_TOP_K);

  if (!GAP_FILL_ENABLED) {
    return chunks;
  }

  for (let round = 0; round < GAP_FILL_MAX_ROUNDS; round++) {
    const gaps = await detectGaps(question, chunks);

    if (gaps.length === 0) {
      break;
    }

    const extraGroups = await Promise.all(
      gaps.map((gapQuery) =>
        retrieveChunks({
          userId,
          query: gapQuery,
          documentId,
          topK: GAP_FILL_TOP_K,
        }),
      ),
    );

    const merged = mergeSubqueryChunks(
      [chunks, ...extraGroups],
      GAP_FILL_MAX_CHUNKS,
    );

    // No new distinct chunks means the follow-up retrieval added nothing; stop
    // rather than paying for another round that can't help.
    if (merged.length === chunks.length) {
      break;
    }

    chunks = merged;
  }

  return chunks;
}
