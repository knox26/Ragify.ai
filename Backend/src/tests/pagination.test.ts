import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildPage,
  encodeCursor,
  keysetWhere,
  paginationQuerySchema,
  parseCursor,
  readDirection,
  readPagination,
} from "../utils/pagination";

describe("encodeCursor / parseCursor", () => {
  test("round-trips a cursor", () => {
    const cursor = { c: new Date("2024-01-02T03:04:05.000Z"), i: "abc-123" };
    const raw = encodeCursor(cursor);
    expect(parseCursor(raw)).toEqual({ ok: true, cursor });
  });

  test("absent cursor is a clean first page", () => {
    expect(parseCursor(undefined)).toEqual({ ok: true, cursor: null });
    expect(parseCursor("")).toEqual({ ok: true, cursor: null });
  });

  test("garbage cursor is rejected, not silently ignored", () => {
    expect(parseCursor("!!!not-base64!!!")).toEqual({ ok: false });
    // Valid base64, not JSON.
    expect(parseCursor("aGVsbG8")).toEqual({ ok: false });
    // Valid JSON, invalid payload shape.
    const bad = Buffer.from(
      JSON.stringify({ c: "not-a-date", i: "x" }),
      "utf8",
    ).toString("base64url");
    expect(parseCursor(bad)).toEqual({ ok: false });
  });
});

describe("paginationQuerySchema", () => {
  test("defaults limit when absent", () => {
    expect(paginationQuerySchema.parse({}).limit).toBe(DEFAULT_PAGE_SIZE);
  });

  test("accepts a valid limit and cursor", () => {
    const out = paginationQuerySchema.parse({ limit: "25", cursor: "abc" });
    expect(out.limit).toBe(25);
    expect(out.cursor).toBe("abc");
  });

  test("falls back to default on junk or oversized limits", () => {
    expect(paginationQuerySchema.parse({ limit: "abc" }).limit).toBe(
      DEFAULT_PAGE_SIZE,
    );
    expect(paginationQuerySchema.parse({ limit: "-3" }).limit).toBe(
      DEFAULT_PAGE_SIZE,
    );
    expect(
      paginationQuerySchema.parse({ limit: String(MAX_PAGE_SIZE + 1) }).limit,
    ).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe("keysetWhere", () => {
  test("no cursor => empty clause", () => {
    expect(keysetWhere("lt", null, "createdAt")).toEqual({});
  });

  test("descending tuple comparison (createdAt)", () => {
    const cursor = { c: new Date("2024-01-01T00:00:00Z"), i: "row-9" };
    expect(keysetWhere("lt", cursor, "createdAt")).toEqual({
      OR: [
        { createdAt: { lt: cursor.c } },
        { createdAt: cursor.c, id: { lt: "row-9" } },
      ],
    });
  });

  test("ascending tuple comparison (createdAt)", () => {
    const cursor = { c: new Date("2024-01-01T00:00:00Z"), i: "row-9" };
    expect(keysetWhere("gt", cursor, "createdAt")).toEqual({
      OR: [
        { createdAt: { gt: cursor.c } },
        { createdAt: cursor.c, id: { gt: "row-9" } },
      ],
    });
  });

  test("descending tuple comparison (updatedAt)", () => {
    const cursor = { c: new Date("2024-01-01T00:00:00Z"), i: "row-9" };
    expect(keysetWhere("lt", cursor, "updatedAt")).toEqual({
      OR: [
        { updatedAt: { lt: cursor.c } },
        { updatedAt: cursor.c, id: { lt: "row-9" } },
      ],
    });
  });
});

describe("buildPage", () => {
  const row = (id: string, iso: string) => ({ id, createdAt: new Date(iso) });
  const sortOf = (r: { id: string; createdAt: Date }) => ({
    c: r.createdAt,
    i: r.id,
  });

  test("short page: no next cursor", () => {
    const { rows, pagination } = buildPage(
      [row("a", "2024-01-01T00:00:00Z")],
      50,
      sortOf,
    );
    expect(rows).toHaveLength(1);
    expect(pagination).toEqual({ hasMore: false, nextCursor: null });
  });

  test("exactly one page: hasMore false", () => {
    const items = [
      row("a", "2024-01-01T00:00:00Z"),
      row("b", "2024-01-02T00:00:00Z"),
    ];
    const { rows, pagination } = buildPage(items, 2, sortOf);
    expect(rows).toHaveLength(2);
    expect(pagination).toEqual({ hasMore: false, nextCursor: null });
  });

  test("overflow page: slices to limit and cursor points past last returned row", () => {
    const items = [
      row("a", "2024-01-01T00:00:00Z"),
      row("b", "2024-01-02T00:00:00Z"),
      row("c", "2024-01-03T00:00:00Z"),
    ];
    const { rows, pagination } = buildPage(items, 2, sortOf);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(pagination.hasMore).toBe(true);
    expect(parseCursor(pagination.nextCursor!)).toEqual({
      ok: true,
      cursor: { c: new Date("2024-01-02T00:00:00Z"), i: "b" },
    });
  });

  test("empty result: no cursor", () => {
    const { rows, pagination } = buildPage([], 50, sortOf);
    expect(rows).toEqual([]);
    expect(pagination).toEqual({ hasMore: false, nextCursor: null });
  });
});

describe("readDirection", () => {
  test("defaults to asc when absent", () => {
    expect(readDirection({})).toBe("asc");
    expect(readDirection({ dir: undefined })).toBe("asc");
  });

  test("accepts desc", () => {
    expect(readDirection({ dir: "desc" })).toBe("desc");
  });

  test("falls back to asc on junk", () => {
    expect(readDirection({ dir: "sideways" })).toBe("asc");
  });
});

describe("readPagination", () => {
  test("full happy path", () => {
    const cursor = { c: new Date("2024-01-01T00:00:00Z"), i: "row-9" };
    const out = readPagination({ limit: "10", cursor: encodeCursor(cursor) });
    expect(out).toEqual({ ok: true, limit: 10, cursor });
  });

  test("absent params => defaults, no cursor", () => {
    expect(readPagination({})).toEqual({ ok: true, limit: 50, cursor: null });
  });

  test("malformed cursor is a hard error", () => {
    expect(readPagination({ cursor: "!!!not-a-cursor!!!" })).toEqual({
      ok: false,
      message: "Invalid cursor",
    });
  });
});
