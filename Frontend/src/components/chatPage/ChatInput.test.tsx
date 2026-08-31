import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatInput } from "./ChatInput";
import { api, type Document } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    getDocuments: vi.fn(),
    getDocument: vi.fn(),
  },
}));

function doc(id: string, name: string, status: Document["status"]): Document {
  return {
    id,
    fileName: name,
    fileSize: 1,
    mimeType: "application/pdf",
    status,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const COMPLETED = "COMPLETED";

function renderChatInput(props: Partial<Parameters<typeof ChatInput>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const onSend = vi.fn();
  const onDocumentChange = vi.fn();

  const result = render(
    <QueryClientProvider client={client}>
      <ChatInput
        onSend={props.onSend ?? onSend}
        disabled={props.disabled ?? false}
        documentId={props.documentId ?? null}
        onDocumentChange={props.onDocumentChange ?? onDocumentChange}
        scopeLocked={props.scopeLocked ?? false}
      />
    </QueryClientProvider>,
  );

  return {
    onSend,
    onDocumentChange,
    ...result,
  };
}

const textarea = () => screen.getByPlaceholderText("Ask a question about your documents…");

beforeEach(() => {
  // The picker asks the SERVER for COMPLETED docs (status filter + cursor),
  // so the mock returns only completed rows — no client-side filtering.
  vi.mocked(api.getDocuments).mockResolvedValue({
    success: true,
    message: "",
    data: [doc("d1", "annual-report.pdf", COMPLETED), doc("d3", "roadmap.pdf", COMPLETED)],
  });
  vi.mocked(api.getDocument).mockResolvedValue({
    success: true,
    message: "",
    data: { id: "d1", fileName: "annual-report.pdf" },
  });
});

describe("ChatInput", () => {
  test("Enter submits the trimmed content and clears the field", async () => {
    const { onSend } = renderChatInput();

    fireEvent.change(textarea(), { target: { value: "  How did revenue go?  " } });
    fireEvent.keyDown(textarea(), { key: "Enter" });

    expect(onSend).toHaveBeenCalledWith("How did revenue go?");
    expect((textarea() as HTMLTextAreaElement).value).toBe("");
  });

  test("Shift+Enter inserts a newline instead of submitting", () => {
    const { onSend } = renderChatInput();

    fireEvent.change(textarea(), { target: { value: "line one" } });
    fireEvent.keyDown(textarea(), { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  test("does not submit whitespace-only content", () => {
    const { onSend } = renderChatInput();

    fireEvent.change(textarea(), { target: { value: "   " } });
    fireEvent.keyDown(textarea(), { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
  });

  test("send button stays disabled while empty", () => {
    renderChatInput();

    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  test("textarea and send are disabled while streaming", () => {
    renderChatInput({ disabled: true });

    expect(textarea()).toBeDisabled();
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  test("picker asks the server for COMPLETED docs, scoped by status", async () => {
    renderChatInput();

    fireEvent.click(screen.getByRole("button", { name: /All sources/i }));

    await waitFor(() =>
      expect(api.getDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ status: "COMPLETED" }),
      ),
    );

    // Wait until the picker rows settle, then assert the full list.
    await screen.findByText("annual-report.pdf");
    expect(screen.getByText("roadmap.pdf")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3); // All sources + two completed docs
  });

  test("selecting a document notifies the parent", async () => {
    const { onDocumentChange } = renderChatInput();

    fireEvent.click(screen.getByRole("button", { name: /All sources/i }));

    const annualReport = await screen.findByText("annual-report.pdf");
    fireEvent.click(annualReport);

    expect(onDocumentChange).toHaveBeenCalledWith("d1");
  });

  test("picker search is debounced into a server-side search", async () => {
    renderChatInput();

    fireEvent.click(screen.getByRole("button", { name: /All sources/i }));
    await screen.findByText("annual-report.pdf");

    const filter = screen.getByPlaceholderText("Filter documents…");
    fireEvent.change(filter, { target: { value: "quar" } });

    await waitFor(() =>
      expect(api.getDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ search: "quar", status: "COMPLETED" }),
      ),
    );
  });

  test("picker follows the cursor when a page is capped (load more)", async () => {
    vi.mocked(api.getDocuments)
      .mockResolvedValueOnce({
        success: true,
        message: "",
        pagination: { nextCursor: "c1", hasMore: true },
        data: [doc("d9", "alpha.pdf", COMPLETED)],
      })
      .mockResolvedValueOnce({
        success: true,
        message: "",
        pagination: { nextCursor: null, hasMore: false },
        data: [doc("d10", "beta.pdf", COMPLETED)],
      });

    renderChatInput();

    fireEvent.click(screen.getByRole("button", { name: /All sources/i }));

    expect(await screen.findByText("alpha.pdf")).toBeInTheDocument();
    expect(screen.queryByText("beta.pdf")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Load more documents/i }));

    expect(await screen.findByText("beta.pdf")).toBeInTheDocument();
    expect(api.getDocuments).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "c1", status: "COMPLETED" }),
    );
  });

  test("scopeLocked renders a static disabled label, resolving the name by id", async () => {
    renderChatInput({ scopeLocked: true, documentId: "d1" });

    const button = await screen.findByRole("button", { name: /annual-report\.pdf/i });

    expect(button).toBeDisabled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(api.getDocument).toHaveBeenCalledWith("d1");
  });
});
