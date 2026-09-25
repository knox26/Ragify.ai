/**
 * Parent/section assignment over a flat ordered chunk list. Pure and
 * deterministic. parentId is ordinal (`${documentId}:section:<n>`), never
 * title-based, so identical titles stay unique. parentText is the section's
 * child texts joined with "\n", capped at PARENT_TEXT_CAP (an oversized
 * single child keeps its full text — never blank). Table chunks join the
 * preceding chunk's group so a table split across subsections stays whole.
 */

import { PARENT_TEXT_CAP, SECTION_BUDGET_CHARS } from "./constants";
import type { Chunk } from "./types";

export function buildParents(
  flat: Chunk[],
  documentId: string,
  opts?: { parentTextCap?: number; sectionBudgetChars?: number },
): Chunk[] {
  const cap = opts?.parentTextCap ?? PARENT_TEXT_CAP;
  const budget = opts?.sectionBudgetChars ?? SECTION_BUDGET_CHARS;

  // A section = maximal run of chunks sharing the same sectionPath prefix
  // identity. Track by object identity of the path join.
  const sectionOf = (c: Chunk): string => c.sectionPath.join("\u0001");

  const keyOf: string[] = new Array<string>(flat.length);
  flat.forEach((c, i) => {
    keyOf[i] = c.kind === "table" && i > 0 ? (keyOf[i - 1] as string) : sectionOf(c);
  });

  const groups = new Map<string, Chunk[]>();
  flat.forEach((chunk, i) => {
    const key = keyOf[i] as string;
    const group = groups.get(key);
    if (group) group.push(chunk);
    else groups.set(key, [chunk]);
  });

  let sectionOrdinal = 0;
  const sectionIdByKey = new Map<string, string>();
  for (const key of groups.keys()) {
    sectionIdByKey.set(key, `${documentId}:section:${sectionOrdinal++}`);
  }

  return flat.map((chunk, i) => {
    const key = keyOf[i] as string;
    const siblings = groups.get(key) ?? [chunk];
    const joined = siblings.map((s) => s.text).join("\n");
    const parentText =
      joined.length > Math.max(cap, budget)
        ? siblings.length === 1
          ? chunk.text
          : joined.slice(0, cap)
        : joined;

    return { ...chunk, parentId: sectionIdByKey.get(key) ?? null, parentText };
  });
}
