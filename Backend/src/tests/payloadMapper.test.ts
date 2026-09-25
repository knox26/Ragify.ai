import { describe, expect, test } from "bun:test";
import { PROCESSING_VERSION } from "../services/chunking/constants";
import { chunkToPoint } from "../services/chunking/payloadMapper";
import { buildChunkPointId } from "../services/qdrantCollectionService";
import { sparseVectorFor } from "../services/sparseVectorService";
import type { Chunk } from "../services/chunking/types";

const CHUNK: Chunk = {
  chunkIndex: 2,
  kind: "table",
  text: "Revenue 13,420",
  startOffset: 10,
  endOffset: 24,
  pageStart: 1,
  pageEnd: 1,
  sectionPath: ["Balance Sheets"],
  parentId: "doc1:section:0",
  parentText: "Revenue 13,420",
  statementType: "balance_sheet",
  consolidationScope: "consolidated",
};

const DOC = { id: "doc1", userId: "user1", fileName: "10-K.pdf" };

describe("payloadMapper", () => {
  test("full payload + deterministic id + version/hash", () => {
    const point = chunkToPoint(CHUNK, DOC, [0.1, 0.2], sparseVectorFor(CHUNK.text), "hash1");
    expect(point.id).toBe(buildChunkPointId("doc1", 2));
    expect(point.payload).toMatchObject({
      documentId: "doc1",
      userId: "user1",
      chunkType: "table",
      statementType: "balance_sheet",
      consolidationScope: "consolidated",
      sectionPath: ["Balance Sheets"],
      parentId: "doc1:section:0",
      contentHash: "hash1",
      processingVersion: PROCESSING_VERSION,
    });
  });

  test("missing userId / bad offsets / empty text throw", () => {
    const embed = [0.1];
    const sparse = sparseVectorFor("x");
    expect(() => chunkToPoint(CHUNK, { ...DOC, userId: "" }, embed, sparse, "h")).toThrow();
    expect(() => chunkToPoint({ ...CHUNK, text: " " }, DOC, embed, sparse, "h")).toThrow();
    expect(() =>
      chunkToPoint({ ...CHUNK, startOffset: 5, endOffset: 5 }, DOC, embed, sparse, "h"),
    ).toThrow();
    expect(() => chunkToPoint(CHUNK, DOC, embed, sparse, "")).toThrow();
  });
});
