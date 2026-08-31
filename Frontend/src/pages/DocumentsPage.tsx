import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { DocumentsHeader } from "../components/documentsPage/DocumentsHeader";
import { DocumentsSearch } from "../components/documentsPage/DocumentsSearch";
import { DocumentsGrid } from "../components/documentsPage/DocumentsGrid";
import { UploadModal } from "../components/documentsPage/UploadModal";
import {
  DocumentsEmptyState,
  DocumentsErrorState,
} from "../components/documentsPage/DocumentsStates";
import { api, getFriendlyErrorMessage } from "../lib/api";

// The poll must see every non-terminal row, not just page 1 (default 50):
// walk the statuses cursor and merge, so a transition beyond the first page
// still lands in the invalidation key. A pile past this cap is abnormal —
// the orphan reconciler is the drain, not the poll.
const STATUSES_MAX_PAGES = 10;

export default function DocumentsPage() {
  const queryClient = useQueryClient();

  // Search input debounces into the query key; filtering happens server-side,
  // so a large library never has to be fully loaded before it's searchable.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Modal state lives here so the header button and the empty-state CTA can
  // both open the same upload modal.
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const {
    data: documentsData,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["documents", search],
    queryFn: ({ pageParam }) =>
      api.getDocuments({ cursor: pageParam, search: search || undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.pagination?.hasMore ? last.pagination.nextCursor : undefined,
  });

  const documents = documentsData?.pages.flatMap((p) => p.data ?? []) ?? [];

  // The poll only watches non-terminal documents — a handful of tiny rows —
  // so the 3s tick never re-walks the whole library. When it spots a status
  // transition (PROCESSING → COMPLETED), invalidate the full list once.
  const prevStatusesRef = useRef<string | null>(null);

  const statusesQuery = useQuery({
    queryKey: ["documentStatuses"],
    queryFn: async () => {
      const pages: Awaited<ReturnType<typeof api.getDocumentStatuses>>[] = [];
      let cursor: string | undefined;

      for (let i = 0; i < STATUSES_MAX_PAGES; i++) {
        const page = await api.getDocumentStatuses(cursor);
        pages.push(page);
        if (!page.pagination?.hasMore || !page.pagination.nextCursor) break;
        cursor = page.pagination.nextCursor;
      }

      const data = pages.flatMap((p) => p.data ?? []);
      return {
        success: true,
        message: "",
        data,
        pagination: { nextCursor: null, hasMore: false },
      };
    },
    // Keep polling while any non-terminal row is visible OR the response was
    // capped (hasMore) — a pile of abandoned uploads drains as the orphan
    // reconciler ages them out, and the poll rides along until it empties.
    refetchInterval: (query) =>
      (query.state.data?.data?.length ?? 0) > 0 ||
      (query.state.data?.pagination?.hasMore ?? false)
        ? 3000
        : false,
  });

  useEffect(() => {
    const statuses = statusesQuery.data?.data;
    if (!statuses) return;

    const key = statuses
      .map((d) => `${d.id}:${d.status}`)
      .sort()
      .join(",");

    if (prevStatusesRef.current !== null && prevStatusesRef.current !== key) {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    }
    prevStatusesRef.current = key;
  }, [statusesQuery.data, queryClient]);

  const hasDocuments = documents.length > 0;

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 lg:p-10">
        <div className="max-w-7xl mx-auto flex items-center gap-3 text-[var(--text-secondary)] font-mono text-sm">
          <div className="h-4 w-4 rounded-full border-2 border-[var(--border-color)] border-t-[var(--accent)] animate-spin" />
          Loading documents…
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        <DocumentsHeader
          count={hasDocuments ? documents.length : 0}
          onUploadClick={() => setIsUploadOpen(true)}
        />

        <DocumentsSearch value={searchInput} onChange={setSearchInput} />

        {isError && !hasDocuments ? (
          // First load failed and there is nothing to show — never a silent
          // blank grid. Surface the real error with a retry.
          <DocumentsErrorState
            message={getFriendlyErrorMessage(error)}
            onRetry={() => refetch()}
          />
        ) : !hasDocuments ? (
          // A search that matches nothing is distinct from an empty library —
          // one reads "no results", the other "start uploading".
          search ? (
            <DocumentsEmptyState kind="no-results" query={search} />
          ) : (
            <DocumentsEmptyState
              kind="no-documents"
              onUpload={() => setIsUploadOpen(true)}
            />
          )
        ) : (
          <>
            {/* Background refetch failed but stale data exists — keep the grid,
                say so, and offer a retry instead of pretending nothing failed. */}
            {isError && (
              <div className="card px-5 py-3.5 flex items-center justify-between gap-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Couldn't refresh documents — showing the last loaded state.
                </p>

                <button
                  onClick={() => refetch()}
                  className="cursor-pointer text-sm font-medium text-[var(--accent)] hover:underline"
                >
                  Retry
                </button>
              </div>
            )}

            <DocumentsGrid documents={documents} />

            {hasNextPage && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="cursor-pointer text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                >
                  {isFetchingNextPage ? "Loading…" : "Load more documents"}
                </button>
              </div>
            )}
          </>
        )}

        <UploadModal
          open={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onUploadSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["documents"] });
            // Wake the poll back up so a just-uploaded file gets tracked.
            queryClient.invalidateQueries({ queryKey: ["documentStatuses"] });
          }}
        />
      </div>
    </div>
  );
}
