import { z } from "zod";

/**
 * Shared keyset (cursor) pagination for list endpoints.
 *
 * Why keyset instead of offset (skip/take):
 *  - Offset degrades to an O(n) scan on deep pages; keyset walks the index
 *    (O(log n) per page).
 *  - Offset drifts when rows are inserted/deleted between requests (dupes /
 *    skipped rows). Keyset is stable: rows before the cursor can never
 *    re-appear, rows after it can't be skipped.
 *
 * Cursor = base64url(JSON { c: ISO sort key, i: id }).
 * The `id` tiebreak keeps ordering stable when createdAt/updatedAt collide
 * (UUIDs are not time-ordered, so id alone can't be the cursor).
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export type SortKey = "createdAt" | "updatedAt";

export interface CursorValue {
  /** Sort key of the last row of the previous page. */
  c: Date;
  /** Row id — tiebreak for equal sort keys. */
  i: string;
}

export interface PaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
}

const cursorPayloadSchema = z.object({
  c: z.string().datetime(),
  i: z.string().min(1).max(64),
});

export const paginationQuerySchema = z.object({
  // Missing/invalid/oversized limits fall back to the default instead of
  // 400ing — a malformed limit is a client bug, but rejecting it buys
  // nothing. The max cap keeps response size bounded regardless.
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_SIZE)
    .catch(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).max(1024).optional(),
});

export function encodeCursor(cursor: CursorValue): string {
  return Buffer.from(
    JSON.stringify({ c: cursor.c.toISOString(), i: cursor.i }),
    "utf8",
  ).toString("base64url");
}

export type ParseCursorResult =
  | { ok: true; cursor: CursorValue | null }
  | { ok: false };

export function parseCursor(raw: string | undefined): ParseCursorResult {
  if (!raw) return { ok: true, cursor: null };
  try {
    const payload = cursorPayloadSchema.safeParse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
    if (!payload.success) return { ok: false };
    return {
      ok: true,
      cursor: { c: new Date(payload.data.c), i: payload.data.i },
    };
  } catch {
    return { ok: false };
  }
}

export type PaginationResult =
  | { ok: true; limit: number; cursor: CursorValue | null }
  | { ok: false; message: string };

export function readPagination(
  query: Record<string, string | undefined>,
): PaginationResult {
  const parsed = paginationQuerySchema.safeParse(query);
  if (!parsed.success) return { ok: false, message: "Invalid pagination query" };
  const cursor = parseCursor(parsed.data.cursor);
  if (!cursor.ok) return { ok: false, message: "Invalid cursor" };
  return { ok: true, limit: parsed.data.limit, cursor: cursor.cursor };
}

export type PaginationDirection = "asc" | "desc";

const directionSchema = z.enum(["asc", "desc"]).catch("asc");

/**
 * Optional `dir` query param flips keyset direction. Default "asc" walks
 * forward from the cursor; "desc" walks backward. The chat message history
 * uses "desc" to load newest-first, then follows nextCursor toward older
 * rows. Unknown/missing values fall back to "asc" rather than 400ing — same
 * philosophy as the lenient limit handling above.
 */
export function readDirection(
  query: Record<string, string | undefined>,
): PaginationDirection {
  return directionSchema.parse(query.dir);
}

/**
 * Keyset WHERE for `orderBy: [{ sortKey: dir }, { id: dir }]`.
 * Returns the rows strictly before (lt) / after (gt) the cursor:
 *   sortKey < c OR (sortKey = c AND id < i)   — descending
 *   sortKey > c OR (sortKey = c AND id > i)   — ascending
 *
 * Both branches are served by the (userId, sortKey, id) and
 * (sessionId, sortKey, id) indexes added in
 * 20260827192805_add_pagination_tiebreak_indexes — the id column is what
 * makes the (sortKey = c AND id < i) branch index-served.
 */
type KeysetClause<K extends SortKey> = {
  OR: Array<
    | { [P in K]: { lt: Date } }
    | ({ [P in K]: Date } & { id: { lt: string } })
    | { [P in K]: { gt: Date } }
    | ({ [P in K]: Date } & { id: { gt: string } })
  >;
};

export function keysetWhere<K extends SortKey>(
  direction: "lt" | "gt",
  cursor: CursorValue | null,
  sortKey: K,
): KeysetClause<K> | {} {
  if (!cursor) return {};
  if (direction === "lt") {
    return {
      OR: [
        { [sortKey]: { lt: cursor.c } },
        { [sortKey]: cursor.c, id: { lt: cursor.i } },
      ],
    } as KeysetClause<K>;
  }
  return {
    OR: [
      { [sortKey]: { gt: cursor.c } },
      { [sortKey]: cursor.c, id: { gt: cursor.i } },
    ],
  } as KeysetClause<K>;
}

/**
 * Split a `take: limit + 1` result into the page and its metadata.
 * `hasMore` is true when the probe row came back; `nextCursor` then points
 * past the last *returned* row, so the next request continues exactly where
 * this one stopped.
 */
export function buildPage<T>(
  items: T[],
  limit: number,
  sortOf: (row: T) => CursorValue,
): { rows: T[]; pagination: PaginationMeta } {
  const hasMore = items.length > limit;
  const rows = hasMore ? items.slice(0, limit) : items;
  const last = rows.length > 0 ? sortOf(rows[rows.length - 1]) : null;
  return {
    rows,
    pagination: {
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    },
  };
}
