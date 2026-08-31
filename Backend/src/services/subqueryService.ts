import { generateText } from "./chatService";
import { CHAT_TOP_K, type RetrievedChunk } from "./retrievalService";

const SUB_QUERY_ENABLED = (Bun.env.SUB_QUERY_ENABLED ?? "true") !== "false";
export const SUB_QUERY_MAX = Number(Bun.env.SUB_QUERY_MAX ?? 3);
export const SUB_QUERY_TOP_K = Number(Bun.env.SUB_QUERY_TOP_K ?? 8);

const SUB_QUERY_SYSTEM = [
  "You decompose a user's question into independent retrieval queries for a document search system.",
  'Return ONLY valid JSON: {"subqueries": ["...", "..."]}.',
  "Rules:",
  "- Each subquery must be a self-contained, standalone search query (no pronouns like 'it' or 'this').",
  "- Break compound questions into the separate facts they ask about.",
  "- If the question asks for one thing, return exactly one subquery: the original question.",
  "- Return at most 3 subqueries.",
  "- No explanations, no markdown, no text outside the JSON.",
].join("\n");

/**
 * Parse the model's response into a list of subqueries. Defensive: strips
 * code fences, takes the first {...} object, keeps non-empty strings, caps and
 * dedupes. Any failure falls back to the original question so decomposition
 * never degrades a chat into a crash.
 */
export function parseSubqueries(raw: string, fallback: string): string[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);

  if (!objectMatch) {
    return [fallback];
  }

  let parsed: { subqueries?: unknown };

  try {
    parsed = JSON.parse(objectMatch[0]);
  } catch {
    return [fallback];
  }

  if (!Array.isArray(parsed.subqueries)) {
    return [fallback];
  }

  const queries = parsed.subqueries
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .map((q) => q.trim())
    .slice(0, SUB_QUERY_MAX);

  if (queries.length === 0) {
    return [fallback];
  }

  return [...new Set(queries)];
}

/**
 * LLM-decompose a question into standalone retrieval queries. Disabled via
 * SUB_QUERY_ENABLED=false returns the original question untouched (today's
 * behavior). Errors fall back to the original question.
 */
export async function decomposeQuery(question: string): Promise<string[]> {
  if (!SUB_QUERY_ENABLED) {
    return [question];
  }

  const cleaned = question.trim();

  if (!cleaned) {
    return [question];
  }

  try {
    const raw = await generateText({
      system: SUB_QUERY_SYSTEM,
      user: cleaned,
    });

    return parseSubqueries(raw, cleaned);
  } catch {
    return [cleaned];
  }
}

/**
 * Merge per-sub-query retrievals into one ranked list. The same (documentId,
 * chunkIndex) can surface under several subqueries — keep the highest score,
 * sort descending, cap at the chat's topK. buildSources/buildUserPrompt then
 * see one deduped list and do the rest unchanged.
 */
export function mergeSubqueryChunks(
  groups: RetrievedChunk[][],
  cap = CHAT_TOP_K,
): RetrievedChunk[] {
  const best = new Map<string, RetrievedChunk>();

  for (const group of groups) {
    for (const chunk of group) {
      const key = `${chunk.documentId}:${chunk.chunkIndex}`;
      const existing = best.get(key);

      if (!existing || chunk.score > existing.score) {
        best.set(key, chunk);
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);
}
