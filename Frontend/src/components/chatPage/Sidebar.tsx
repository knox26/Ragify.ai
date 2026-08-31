import {
  FileText,
  Menu,
  Plus,
  Search,
  MessageSquare,
  LogOut,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { RagifyMark } from "../ui/RagifyMark";
import { cn } from "../../lib/utils";
import { api } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";

/** Mono utility label — the landing's technical voice. */
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--text-secondary)] px-3 mb-2">
      {children}
    </p>
  );
}

export function Sidebar() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeSessionId = searchParams.get("chat");

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const {
    data: sessionsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["chatSessions"],
    queryFn: ({ pageParam }) => api.getChatSessions({ cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.pagination?.hasMore ? last.pagination.nextCursor : undefined,
  });

  // Backed by a count endpoint, not a page length — the library can exceed
  // one page (100) without the sidebar under-reporting.
  const { data: countResponse } = useQuery({
    queryKey: ["documentCount"],
    queryFn: () => api.getDocumentCount(),
  });

  const sessions = sessionsData?.pages.flatMap((p) => p.data ?? []) ?? [];
  const documentCount = countResponse?.data?.count ?? 0;

  // Navigate to the chat route, not just the ?chat= param — the sidebar lives
  // in the layout above /home and /home/documents, so setSearchParams alone
  // would leave you stranded on the documents page.
  const openChat = (id: string) => navigate(`/home?chat=${id}`);

  const newChat = () => navigate("/home");

  const handleSignOut = () => {
    void logout();
  };

  return (
    <aside className="w-72 shrink-0 border-r border-[var(--border-color)] bg-[var(--bg-card)] flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[var(--text-primary)] flex items-center justify-center">
            <RagifyMark className="w-4 h-4 text-[var(--bg-primary)]" />
          </div>
          <span className="text-lg font-bold tracking-tight">Ragify</span>
        </div>

        <button
          className="p-2 cursor-pointer rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-section)] transition-colors"
          aria-label="Menu"
        >
          <Menu size={18} />
        </button>
      </div>

      <div className="p-4">
        <button
          onClick={newChat}
          className="cursor-pointer w-full h-11 rounded-xl bg-[var(--accent)] text-white font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-[var(--accent-glow)]"
        >
          <Plus size={18} />
          New Chat
        </button>
      </div>

      <div className="px-4">
        <button
          className="cursor-pointer w-full h-11 px-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-section)]/60 flex items-center gap-3 hover:bg-[var(--bg-section)] transition-colors"
        >
          <Search size={16} className="text-[var(--text-secondary)]" />
          <span className="flex-1 text-left text-sm text-[var(--text-secondary)]">
            Search chats
          </span>
          <kbd className="text-[11px] font-mono px-1.5 py-0.5 rounded-md bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)]">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="p-4">
        <SectionLabel>Library</SectionLabel>
        <Link
          to="/home/documents"
          className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-section)]/60 border border-[var(--border-color)] hover:bg-[var(--bg-section)] transition-colors"
        >
          <div className="h-9 w-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
            <FileText
              size={17}
              className="text-[var(--accent)] transition-transform duration-200 group-hover:scale-110"
            />
          </div>
          <span className="font-medium text-sm">Documents</span>
          <span className="ml-auto text-[11px] font-mono text-[var(--text-secondary)]">
            {documentCount}
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <SectionLabel>Recent Chats</SectionLabel>

        {sessions.length === 0 ? (
          <p className="px-3 py-2 text-sm text-[var(--text-secondary)]">
            No chats yet. Ask something about your documents.
          </p>
        ) : (
          <>
            <div className="space-y-0.5">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => openChat(session.id)}
                  className={cn(
                    "cursor-pointer w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                    session.id === activeSessionId
                      ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-section)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <MessageSquare size={15} className="shrink-0" />
                  <span className="truncate text-sm">{session.title}</span>
                </button>
              ))}
            </div>

            {hasNextPage && (
              <button
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className="cursor-pointer w-full mt-1 py-2 text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
              >
                {isFetchingNextPage ? "Loading…" : "Load more chats"}
              </button>
            )}
          </>
        )}
      </div>

      <div className="border-t border-[var(--border-color)] px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[var(--text-primary)] flex items-center justify-center text-[var(--bg-primary)] font-semibold shrink-0">
            {(user?.name ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{user?.name ?? "Guest"}</p>
            <p className="text-xs text-[var(--text-secondary)] truncate">
              {user?.email ?? ""}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 cursor-pointer rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-2)] transition-colors"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
