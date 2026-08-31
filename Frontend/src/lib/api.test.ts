import { beforeEach, describe, expect, test, vi } from "vitest";
import axios from "axios";
import { ApiError, streamChatMessage, type StreamChunk } from "./api";

// axios is only used by attemptTokenRefresh in these tests — never hit the
// real network.
vi.mock("axios", () => {
  return {
    default: {
      post: vi.fn(async () => ({ status: 200 })),
      isAxiosError: vi.fn(() => false),
    },
  };
});

const encoder = new TextEncoder();

function ndjsonResponse(
  ...chunkPayloads: Array<string | Uint8Array>
): Response {
  const bytes = chunkPayloads.map((part) =>
    typeof part === "string" ? encoder.encode(part) : part,
  );

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const b of bytes) {
        controller.enqueue(b);
      }
      controller.close();
    },
  });

  return { ok: true, status: 200, body } as unknown as Response;
}

function metaLine(sessionId = "sess-1", messageId = "msg-1"): string {
  return JSON.stringify({
    type: "meta",
    sessionId,
    messageId,
    title: "My question",
    documentId: null,
  });
}

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

describe("streamChatMessage", () => {
  test("parses meta, delta and done lines in order", async () => {
    mockFetch.mockResolvedValueOnce(
      ndjsonResponse(
        `${metaLine()}\n`,
        `{"type":"delta","text":"Revenue "}\n`,
        `{"type":"delta","text":"grew 15%."}\n`,
        `{"type":"done","messageId":"msg-2","sources":[]}\n`,
      ),
    );

    const seen: StreamChunk[] = [];

    const result = await streamChatMessage({
      content: "How did revenue go?",
      onChunk: (chunk) => seen.push(chunk),
    });

    expect(seen.map((c) => c.type)).toEqual(["meta", "delta", "delta", "done"]);
    expect(result).toEqual({ sessionId: "sess-1", messageId: "msg-1" });
  });

  test("handles a JSON line split across network chunks", async () => {
    mockFetch.mockResolvedValueOnce(
      ndjsonResponse(
        `{"type":"met`,
        `a","sessionId":"s1","messageId":"m1","title":"T","documentId":null}\n`,
        `{"type":"delta","text":"hel`,
        `lo"}\n`,
      ),
    );

    const seen: StreamChunk[] = [];

    await streamChatMessage({ content: "hi", onChunk: (c) => seen.push(c) });

    expect(seen.map((c) => c.type)).toEqual(["meta", "delta"]);
  });

  test("flushes a trailing partial line with no newline", async () => {
    // Final line deliberately has no trailing \n.
    mockFetch.mockResolvedValueOnce(
      ndjsonResponse(`${metaLine()}\n` + `{"type":"done","messageId":"m2","sources":[]}`),
    );

    const seen: StreamChunk[] = [];

    const result = await streamChatMessage({
      content: "hi",
      onChunk: (c) => seen.push(c),
    });

    expect(seen.map((c) => c.type)).toEqual(["meta", "done"]);
    expect(result.sessionId).toBe("sess-1");
  });

  test("survives CRLF line endings", async () => {
    mockFetch.mockResolvedValueOnce(
      ndjsonResponse(`${metaLine()}\r\n` + `{"type":"delta","text":"ok"}\r\n`),
    );

    const seen: StreamChunk[] = [];

    await streamChatMessage({ content: "hi", onChunk: (c) => seen.push(c) });

    expect(seen[1]).toMatchObject({ type: "delta", text: "ok" });
  });

  test("skips malformed lines without failing the stream", async () => {
    mockFetch.mockResolvedValueOnce(
      ndjsonResponse(
        `{"type":"meta","sessionId":"s1","messageId":"m1","title":"T","documentId":null}\n`,
        `not-json\n`,
        `{"type":"delta","text":"still works"}\n`,
      ),
    );

    const seen: StreamChunk[] = [];

    await streamChatMessage({ content: "hi", onChunk: (c) => seen.push(c) });

    expect(seen.filter((c) => c.type === "delta")).toHaveLength(1);
  });

  test("refreshes once on a pre-stream 401 and retries", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        ndjsonResponse(`${metaLine()}\n` + `{"type":"done","messageId":"m2","sources":[]}\n`),
      );

    const result = await streamChatMessage({
      content: "hi",
      onChunk: () => {},
    });

    expect(result.sessionId).toBe("sess-1");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
  });

  test("throws ApiError 401 when refresh fails", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ status: 401 });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
      }),
    );

    await expect(
      streamChatMessage({ content: "hi", onChunk: () => {} }),
    ).rejects.toMatchObject({ name: "ApiError", status: 401 });
  });

  test("throws ApiError with the server message on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invalid request body" }), {
        status: 400,
      }),
    );

    await expect(
      streamChatMessage({ content: "   ", onChunk: () => {} }),
    ).rejects.toMatchObject({ name: "ApiError", status: 400, message: "Invalid request body" });
  });

  test("throws when the stream ends without a meta event", async () => {
    mockFetch.mockResolvedValueOnce(
      ndjsonResponse(`{"type":"delta","text":"oops"}\n`),
    );

    await expect(
      streamChatMessage({ content: "hi", onChunk: () => {} }),
    ).rejects.toMatchObject({ name: "ApiError", status: 0 });
  });

  test("rethrows a classified AbortError on abort", async () => {
    const controller = new AbortController();

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      if (init.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }

      return ndjsonResponse(`${metaLine()}\n`);
    });

    controller.abort();

    await expect(
      streamChatMessage({
        content: "hi",
        signal: controller.signal,
        onChunk: () => {},
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  test("throws ApiError when the response has no body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: null,
    } as unknown as Response);

    await expect(
      streamChatMessage({ content: "hi", onChunk: () => {} }),
    ).rejects.toMatchObject({ name: "ApiError", status: 0 });
  });

  test("sends sessionId once a session exists, documentId only at creation", async () => {
    const fetchCalls: RequestInit[] = [];

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      fetchCalls.push(init);
      return ndjsonResponse(`${metaLine()}\n`);
    });

    await streamChatMessage({
      sessionId: "existing-session",
      documentId: "some-doc",
      content: "hi",
      onChunk: () => {},
    });

    const sent = JSON.parse(String(fetchCalls[0].body));

    expect(sent.sessionId).toBe("existing-session");
    expect(sent.documentId).toBeUndefined();

    await streamChatMessage({
      documentId: "some-doc",
      content: "hi",
      onChunk: () => {},
    });

    const sentNew = JSON.parse(String(fetchCalls[1].body));

    expect(sentNew.documentId).toBe("some-doc");
    expect(sentNew.sessionId).toBeUndefined();
  });
});

// ApiError construction sanity check (kept here to cover the error class).
describe("ApiError", () => {
  test("carries status and data", () => {
    const err = new ApiError("boom", 403, { detail: "x" });

    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.data).toEqual({ detail: "x" });
    expect(err.message).toBe("boom");
  });
});
