import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatContent, type StreamState } from "./ChatContent";
import type { ChatMessage } from "../../lib/api";

function userMessage(content: string): ChatMessage {
  return {
    id: "u1",
    role: "USER",
    content,
    sources: null,
    error: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function assistantMessage(
  content: string,
  sources: ChatMessage["sources"],
  error = false,
): ChatMessage {
  return {
    id: "a1",
    role: "ASSISTANT",
    content,
    sources,
    error,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const SOURCE = {
  n: 1,
  documentId: "d1",
  fileName: "annual-report.pdf",
  pageStart: 3,
  pageEnd: 3,
  chunkIndex: 0,
  quote: "Revenue grew 15% last year",
  score: 0.91,
};

function renderContent(props: Partial<Parameters<typeof ChatContent>[0]> = {}) {
  return render(
    <ChatContent
      messages={props.messages ?? []}
      isLoading={props.isLoading ?? false}
      pendingUserText={props.pendingUserText ?? null}
      stream={props.stream ?? null}
    />,
  );
}

describe("ChatContent", () => {
  test("renders user bubbles and the assistant AnswerSheet from props", () => {
    renderContent({
      messages: [
        userMessage("How did revenue change?"),
        assistantMessage("Revenue grew[1] 15% last year.", [SOURCE]),
      ],
    });

    // The question appears twice: the user bubble and the AnswerSheet header.
    expect(screen.getAllByText("How did revenue change?").length).toBeGreaterThan(0);
    // Appears in the answer body and again inside the footnote quote.
    expect(screen.getAllByText(/Revenue grew/).length).toBeGreaterThan(0);
    expect(screen.getByText("1.")).toBeInTheDocument(); // footnote number
    expect(screen.getByText("annual-report.pdf · p.3")).toBeInTheDocument();
    // The footnote block quotes the passage (with typographic quotes).
    expect(screen.getByText(/“Revenue grew 15% last year”/)).toBeInTheDocument();
    expect(screen.getByText("1 source")).toBeInTheDocument();
  });

  test("renders a page range in the source reference", () => {
    renderContent({
      messages: [
        userMessage("Q"),
        assistantMessage("A[1]", [{ ...SOURCE, pageEnd: 5 }]),
      ],
    });

    expect(screen.getByText("annual-report.pdf · p.3-5")).toBeInTheDocument();
  });

  test("drops out-of-range citations and hides the footnote block", () => {
    renderContent({
      messages: [
        userMessage("Q"),
        assistantMessage("See [5] for the detail.", [SOURCE]),
      ],
    });

    // [5] stays literal text; no footnote block, so the quote never renders.
    expect(screen.getByText(/See \[5\] for the detail/)).toBeInTheDocument();
    expect(screen.queryByText(/Revenue grew 15% last year/)).not.toBeInTheDocument();
  });

  test("renders the interrupted tag for error messages", () => {
    renderContent({
      messages: [
        userMessage("Q"),
        assistantMessage("Partial answer", [SOURCE], true),
      ],
    });

    expect(screen.getByText(/Answer interrupted/)).toBeInTheDocument();
  });

  test("renders a streaming partial with a typing caret", () => {
    const stream: StreamState = { text: "Reading your documents…", error: null, done: false };

    renderContent({
      messages: [],
      pendingUserText: "my question",
      stream,
    });

    expect(screen.getByText("my question")).toBeInTheDocument();
    expect(screen.getByText("Reading your documents…")).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  test("shows the searching spinner before the first delta", () => {
    const stream: StreamState = { text: "", error: null, done: false };

    renderContent({ stream });

    expect(screen.getByText("Searching your documents…")).toBeInTheDocument();
  });

  test("renders a stream error card", () => {
    const stream: StreamState = { text: "", error: "Retrieval failed", done: true };

    renderContent({ stream });

    expect(screen.getByText("Retrieval failed")).toBeInTheDocument();
  });

  test("shows the loading state when history is still fetching", () => {
    renderContent({ isLoading: true });

    expect(screen.getByText("Loading conversation…")).toBeInTheDocument();
  });
});
