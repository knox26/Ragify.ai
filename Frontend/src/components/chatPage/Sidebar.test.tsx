import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "./Sidebar";
import { api, type ChatSessionSummary } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";

vi.mock("../../lib/api", () => ({
  api: {
    getChatSessions: vi.fn(),
    getDocumentCount: vi.fn(),
    logout: vi.fn(),
  },
}));

function session(id: string, title: string): ChatSessionSummary {
  return {
    id,
    title,
    documentId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    messageCount: 1,
    lastMessage: null,
  };
}

function renderSidebar(initialEntries: string[] = ["/home"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={client}>
        <Sidebar />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });

  vi.mocked(api.getChatSessions).mockResolvedValue({
    success: true,
    message: "",
    data: [],
  });
  vi.mocked(api.getDocumentCount).mockResolvedValue({
    success: true,
    message: "",
    data: { count: 0 },
  });
});

describe("Sidebar", () => {
  test("renders sessions from the query", async () => {
    vi.mocked(api.getChatSessions).mockResolvedValue({
      success: true,
      message: "",
      data: [session("s1", "Quarterly results"), session("s2", "Onboarding")],
    });

    renderSidebar();

    expect(await screen.findByText("Quarterly results")).toBeInTheDocument();
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
  });

  test("highlights the session matching the ?chat= param", async () => {
    vi.mocked(api.getChatSessions).mockResolvedValue({
      success: true,
      message: "",
      data: [session("s1", "Quarterly results"), session("s2", "Onboarding")],
    });

    renderSidebar(["/home?chat=s2"]);

    const active = await screen.findByText("Onboarding");
    await waitFor(() =>
      expect(active.closest("button")).toHaveClass("bg-[var(--accent-soft)]"),
    );
    expect(screen.getByText("Quarterly results").closest("button")).not.toHaveClass(
      "bg-[var(--accent-soft)]",
    );
  });

  test("New Chat clears the active param", async () => {
    vi.mocked(api.getChatSessions).mockResolvedValue({
      success: true,
      message: "",
      data: [session("s1", "Quarterly results")],
    });

    renderSidebar(["/home?chat=s1"]);

    const active = await screen.findByText("Quarterly results");
    await waitFor(() => expect(active.closest("button")).toHaveClass("bg-[var(--accent-soft)]"));

    fireEvent.click(screen.getByRole("button", { name: /New Chat/i }));

    await waitFor(() =>
      expect(screen.getByText("Quarterly results").closest("button")).not.toHaveClass(
        "bg-[var(--accent-soft)]",
      ),
    );
  });

  test("shows the empty state when there are no sessions", async () => {
    renderSidebar();

    expect(
      await screen.findByText("No chats yet. Ask something about your documents."),
    ).toBeInTheDocument();
  });

  test("renders the document count from the count endpoint", async () => {
    vi.mocked(api.getDocumentCount).mockResolvedValue({
      success: true,
      message: "",
      data: { count: 2 },
    });

    renderSidebar();

    const count = await screen.findByText("2");
    expect(count).toBeInTheDocument();
  });

  test("loads more sessions when hasMore and shows the cursor page", async () => {
    vi.mocked(api.getChatSessions)
      .mockResolvedValueOnce({
        success: true,
        message: "",
        pagination: { nextCursor: "c1", hasMore: true },
        data: [session("s1", "Recent chat")],
      })
      .mockResolvedValueOnce({
        success: true,
        message: "",
        pagination: { nextCursor: null, hasMore: false },
        data: [session("s2", "Older chat")],
      });

    renderSidebar();

    expect(await screen.findByText("Recent chat")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Load more chats/i }));

    expect(await screen.findByText("Older chat")).toBeInTheDocument();
    expect(api.getChatSessions).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "c1" }),
    );
  });

  test("renders the user footer and signs out", async () => {
    useAuthStore.setState({
      user: { id: "u1", name: "Ada Lovelace", email: "ada@example.com" },
      isAuthenticated: true,
    });

    renderSidebar();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument(); // avatar initial

    fireEvent.click(screen.getByLabelText("Sign out"));

    await waitFor(() => expect(api.logout).toHaveBeenCalled());
  });
});
