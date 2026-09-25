import { describe, expect, spyOn, test } from "bun:test";
import { qdrantClient } from "../db/qdrantClient";
import {
  upsertDocumentChunks,
  type QdrantPoint,
} from "../services/qdrantCollectionService";

function point(i: number): QdrantPoint {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    vector: [0.1, 0.2],
    payload: {
      documentId: "ev-test",
      userId: "u",
      fileName: "f.pdf",
      chunkIndex: i,
    } as QdrantPoint["payload"],
  };
}

describe("upsertDocumentChunks batching", () => {
  test("splits large docs into sequential batches with wait:true", async () => {
    const calls: { points: QdrantPoint[]; wait: boolean }[] = [];
    const spy = spyOn(qdrantClient, "upsert").mockImplementation(
      async (_collection: string, args: any) => {
        calls.push({ points: args.points, wait: args.wait });
        return { status: "completed" } as any;
      },
    );

    try {
      const points = Array.from({ length: 600 }, (_, i) => point(i));
      await upsertDocumentChunks(points);

      expect(calls.length).toBe(3);
      expect(calls.map((c) => c.points.length)).toEqual([250, 250, 100]);
      expect(calls.every((c) => c.wait === true)).toBe(true);
      // Order preserved across batches.
      expect(calls.flatMap((c) => c.points).map((p) => p.id)).toEqual(
        points.map((p) => p.id),
      );
    } finally {
      spy.mockRestore();
    }
  });

  test("empty input makes no calls", async () => {
    const spy = spyOn(qdrantClient, "upsert").mockResolvedValue(
      { status: "completed" } as any,
    );

    try {
      await upsertDocumentChunks([]);
      expect(spy).toHaveBeenCalledTimes(0);
    } finally {
      spy.mockRestore();
    }
  });
});
