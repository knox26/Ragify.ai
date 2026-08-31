import { describe, expect, test } from "bun:test";
import { serializeStreamEvent } from "../utils/streamEvents";

describe("serializeStreamEvent", () => {
  test("serializes a meta event to single-line NDJSON", () => {
    const line = serializeStreamEvent({
      type: "meta",
      sessionId: "sess-1",
      messageId: "msg-1",
      title: "Q3",
      documentId: null,
    });

    expect(line).toBe(
      JSON.stringify({
        type: "meta",
        sessionId: "sess-1",
        messageId: "msg-1",
        title: "Q3",
        documentId: null,
      }),
    );

    // NDJSON contract: exactly one JSON object, no embedded newlines.
    expect(line.includes("\n")).toBe(false);
  });

  test("serializes delta and done events", () => {
    const delta = serializeStreamEvent({ type: "delta", text: "Revenue grew" });

    expect(JSON.parse(delta)).toEqual({ type: "delta", text: "Revenue grew" });

    const done = serializeStreamEvent({
      type: "done",
      messageId: "msg-2",
      sources: [
        {
          n: 1,
          documentId: "doc-1",
          fileName: "Q3.pdf",
          pageStart: 1,
          pageEnd: 1,
          chunkIndex: 0,
          quote: "…",
          score: 0.9,
        },
      ],
    });

    expect(JSON.parse(done)).toMatchObject({
      type: "done",
      messageId: "msg-2",
      sources: [{ n: 1, fileName: "Q3.pdf" }],
    });
  });

  test("serializes an error event", () => {
    const line = serializeStreamEvent({ type: "error", message: "boom" });

    expect(JSON.parse(line)).toEqual({ type: "error", message: "boom" });
  });
});
