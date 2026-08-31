import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DocumentsPage from "./DocumentsPage";
import { api, type Document } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    getDocuments: vi.fn(),
    getDocumentStatuses: vi.fn(),
  },
  getFriendlyErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong. Please try again.",
}));

function doc(id: string): Document {
  return {
    id,
    fileName: `${id}.pdf`,
    fileSize: 100,
    mimeType: "application/pdf",
    status: "COMPLETED",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return {
    client,
    ...render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <DocumentsPage />
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  };
}

beforeEach(() => {
  vi.mocked(api.getDocuments).mockResolvedValue({
    success: true,
    message: "",
    pagination: { nextCursor: null, hasMore: false },
    data: [],
  });
  vi.mocked(api.getDocumentStatuses).mockResolvedValue({
    success: true,
    message: "",
    data: [],
  });
});

describe("DocumentsPage pagination", () => {
  test("renders documents from the loaded pages", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue({
      success: true,
      message: "",
      pagination: { nextCursor: null, hasMore: false },
      data: [doc("a"), doc("b")],
    });

    renderPage();

    expect(await screen.findByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
  });

  test("search is sent to the server after debounce, not filtered client-side", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue({
      success: true,
      message: "",
      pagination: { nextCursor: null, hasMore: false },
      data: [doc("quarterly-report")],
    });

    renderPage();

    const input = await screen.findByPlaceholderText("Search documents by name…");
    fireEvent.change(input, { target: { value: "quarterly" } });

    // The debounced query re-fetches with the search param server-side.
    await waitFor(() =>
      expect(api.getDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ search: "quarterly" }),
      ),
    );
  });

  test("loads the next page on demand with the server cursor", async () => {
    vi.mocked(api.getDocuments)
      .mockResolvedValueOnce({
        success: true,
        message: "",
        pagination: { nextCursor: "c1", hasMore: true },
        data: Array.from({ length: 100 }, (_, i) => doc(`d${i}`)),
      })
      .mockResolvedValueOnce({
        success: true,
        message: "",
        pagination: { nextCursor: null, hasMore: false },
        data: [doc("last")],
      });

    renderPage();

    expect(await screen.findByText("d0.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Load more documents/i }));

    expect(await screen.findByText("last.pdf")).toBeInTheDocument();
    expect(api.getDocuments).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "c1" }),
    );
  });

  test("a status poll transition invalidates the documents list", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue({
      success: true,
      message: "",
      pagination: { nextCursor: null, hasMore: false },
      data: [doc("a")],
    });

    vi.mocked(api.getDocumentStatuses)
      // First poll: one document still processing.
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: [{ id: "x", status: "PROCESSING" }],
      })
      // It settles → empty, so the status set changed.
      .mockResolvedValue({ success: true, message: "", data: [] });

    const { client } = renderPage();

    expect(await screen.findByText("a.pdf")).toBeInTheDocument();
    expect(api.getDocumentStatuses).toHaveBeenCalled();

    const callsBefore = vi.mocked(api.getDocuments).mock.calls.length;

    // Simulate the next 3s poll tick landing a changed status set.
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["documentStatuses"] });
    });

    // The changed statuses invalidated the documents list, which refetches.
    await waitFor(() =>
      expect(vi.mocked(api.getDocuments).mock.calls.length).toBeGreaterThan(
        callsBefore,
      ),
    );
  });
});
