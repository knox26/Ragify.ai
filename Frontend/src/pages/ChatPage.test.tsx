import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatPage } from "./ChatPage";
import {
  api,
  ApiError,
  getFriendlyErrorMessage,
  streamChatMessage,
  type ChatSessionSummary,
} from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    getChatSessions: vi.fn(),
    getChatSession: vi.fn(),
    getChatMessages: vi.fn(),
    getDocuments: vi.fn(),
    getDocument: vi.fn(),
    getDocumentStatuses: vi.fn(),
    renameChat: vi.fn(),
    deleteChat: vi.fn(),
  },
  streamChatMessage: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    data?: Record<string, unknown>;
    constructor(message: string, status: number, data?: Record<string, unknown>) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.data = data;
    }
  },
  getFriendlyErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong. Please try again.",
}));

function session(id: string, title = "Title"): ChatSessionSummary {
  return {
    id,
    title,
    documentId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    messageCount: 2,
    lastMessage: null,
  };
}

function renderChatPage(initialEntries: string[] = ["/home"]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={client}>
        <ChatPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(api.getChatSessions).mockResolvedValue({
    success: true,
    message: "",
    data: [],
  });
  vi.mocked(api.getDocuments).mockResolvedValue({
    success: true,
    message: "",
    data: [],
  });
  vi.mocked(api.getDocument).mockResolvedValue({
    success: true,
    message: "",
    data: { id: "d1", fileName: "annual-report.pdf" },
  });
  vi.mocked(api.getChatMessages).mockResolvedValue({
    success: true,
    message: "",
    pagination: { nextCursor: null, hasMore: false },
    data: [
      {
        id: "m1",
        role: "USER",
        content: "Persisted question",
        sources: null,
        error: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "m2",
        role: "ASSISTANT",
        content: "Persisted answer",
        sources: [],
        error: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });

  vi.mocked(api.getChatSession).mockResolvedValue({
    success: true,
    message: "",
    data: session("s1"),
  });
});

describe("ChatPage", () => {
  test("shows the welcome state with no session and no stream", async () => {
    renderChatPage();

    expect(await screen.findByText("Ask your documents anything")).toBeInTheDocument();
  });

  test("?chat= param drives the messages query", async () => {
    vi.mocked(api.getChatSessions).mockResolvedValue({
      success: true,
      message: "",
      data: [session("s1")],
    });

    renderChatPage(["/home?chat=s1"]);

    // Question appears in both the user bubble and the AnswerSheet header.
    const questions = await screen.findAllByText("Persisted question");
    expect(questions.length).toBeGreaterThan(0);
    expect(api.getChatMessages).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ dir: "desc" }),
    );
  });

  test("sending streams and lands the persisted message in history", async () => {
    vi.mocked(api.getChatSessions).mockResolvedValue({
      success: true,
      message: "",
      data: [session("s1")],
    });

    vi.mocked(streamChatMessage).mockImplementation(async ({ onChunk }) => {
      onChunk({ type: "meta", sessionId: "s1", messageId: "m1", title: "T", documentId: null });
      onChunk({ type: "delta", text: "live delta" });
      onChunk({ type: "done", messageId: "m2", sources: [] });
      return { sessionId: "s1", messageId: "m1" };
    });

    renderChatPage();

    const textarea = screen.getByPlaceholderText("Ask a question about your documents…");
    fireEvent.change(textarea, { target: { value: "What is the roadmap?" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(streamChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: "What is the roadmap?" }),
    );

    // Persisted messages refetch for the lazily-created session.
    await waitFor(() =>
      expect(api.getChatMessages).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ dir: "desc" }),
      ),
    );
    expect(await screen.findByText("Persisted answer")).toBeInTheDocument();
  });

  test("a stream error surfaces in the UI", async () => {
    vi.mocked(streamChatMessage).mockImplementation(async ({ onChunk }) => {
      onChunk({ type: "error", message: "The model is unavailable" });
      return { sessionId: "s1", messageId: "m1" };
    });

    renderChatPage();

    const textarea = screen.getByPlaceholderText("Ask a question about your documents…");
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(await screen.findByText("The model is unavailable")).toBeInTheDocument();
  });

  test("a failed load-older page keeps the already-loaded history", async () => {
    vi.mocked(api.getChatMessages)
      // Newest page lands; older pages exist.
      .mockResolvedValueOnce({
        success: true,
        message: "",
        pagination: { nextCursor: "c2", hasMore: true },
        data: [
          {
            id: "m2",
            role: "ASSISTANT",
            content: "newest answer",
            sources: [],
            error: false,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      })
      // Loading the older page fails mid-way.
      .mockRejectedValue(new ApiError("boom", 500));

    renderChatPage(["/home?chat=s1"]);

    expect(await screen.findByText("newest answer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Load earlier messages/i }));

    await waitFor(() =>
      expect(api.getChatMessages).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ cursor: "c2" }),
      ),
    );

    // The failing page must not blank the history that already rendered.
    expect(screen.getByText("newest answer")).toBeInTheDocument();
  });

  test("a 404 on a stale session clears the chat param", async () => {
    vi.mocked(api.getChatMessages).mockRejectedValue(new ApiError("Not found", 404));

    renderChatPage(["/home?chat=deleted-session"]);

    expect(await screen.findByText("Ask your documents anything")).toBeInTheDocument();
  });

  test("an unexpected messages error does not clear the param", async () => {
    vi.mocked(api.getChatMessages).mockRejectedValue(new ApiError("boom", 500));

    renderChatPage(["/home?chat=s1"]);

    // Give the error effect a beat to (incorrectly) run if it were going to.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Ask your documents anything")).not.toBeInTheDocument();
  });

  test("send is gated while a stream is in flight", async () => {
    let release: () => void = () => {};

    vi.mocked(streamChatMessage).mockImplementation(async ({ onChunk }) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      onChunk({ type: "meta", sessionId: "s1", messageId: "m1", title: "T", documentId: null });
      return { sessionId: "s1", messageId: "m1" };
    });

    renderChatPage();

    const textarea = screen.getByPlaceholderText("Ask a question about your documents…");
    fireEvent.change(textarea, { target: { value: "first" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    // While pending, the send button is disabled and the textarea too.
    const button = screen.getByLabelText("Send message");
    await waitFor(() => expect(button).toBeDisabled());

    release();
  });

  test("welcome uses the friendly error path when the stream promise rejects", async () => {
    vi.mocked(streamChatMessage).mockRejectedValue(
      new Error(getFriendlyErrorMessage(new Error("Network down"))),
    );

    renderChatPage();

    const textarea = screen.getByPlaceholderText("Ask a question about your documents…");
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(await screen.findByText("Network down")).toBeInTheDocument();
  });
});
