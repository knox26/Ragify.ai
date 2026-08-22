import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { DocumentsHeader } from "../components/documentsPage/DocumentsHeader";
import { DocumentsSearch } from "../components/documentsPage/DocumentsSearch";
import { DocumentsGrid } from "../components/documentsPage/DocumentsGrid";
import { UploadModal } from "../components/documentsPage/UploadModal";
import {
  DocumentsEmptyState,
  DocumentsErrorState,
} from "../components/documentsPage/DocumentsStates";
import { api, getFriendlyErrorMessage } from "../lib/api";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED"]);

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Modal state lives here so the header button and the empty-state CTA can
  // both open the same upload modal.
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const { data: response, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.getDocuments(),
    // Poll while any document is still being processed; stop once all settle.
    refetchInterval: (query) => {
      const docs = query.state.data?.data ?? [];
      return docs.some((d) => !TERMINAL_STATUSES.has(d.status)) ? 3000 : false;
    },
  });

  const filteredDocuments = useMemo(() => {
    return (response?.data ?? []).filter((document) =>
      document.fileName.toLowerCase().includes(search.toLowerCase()),
    );
  }, [response, search]);

  const hasDocuments = (response?.data?.length ?? 0) > 0;

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto flex items-center gap-3 text-[var(--text-secondary)]">
          <div className="h-5 w-5 rounded-full border-2 border-[var(--border-color)] border-t-[var(--accent)] animate-spin" />
          Loading documents...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <DocumentsHeader onUploadClick={() => setIsUploadOpen(true)} />

        <DocumentsSearch value={search} onChange={setSearch} />

        {isError && !hasDocuments ? (
          // First load failed and there is nothing to show — never a silent
          // blank grid. Surface the real error with a retry.
          <DocumentsErrorState
            message={getFriendlyErrorMessage(error)}
            onRetry={() => refetch()}
          />
        ) : !hasDocuments ? (
          // Successful load, zero documents — new-account onboarding, not an
          // error. CTA opens the same modal the header button does.
          <DocumentsEmptyState
            kind="no-documents"
            onUpload={() => setIsUploadOpen(true)}
          />
        ) : filteredDocuments.length === 0 ? (
          // Docs exist but the search filtered all of them out — distinct copy
          // so an empty result never reads as "your knowledge base is empty".
          <DocumentsEmptyState kind="no-results" query={search} />
        ) : (
          <>
            {/* Background refetch failed but stale data exists — keep the grid,
                say so, and offer a retry instead of pretending nothing failed. */}
            {isError && (
              <div className="card px-4 py-3 flex items-center justify-between gap-4">
                <p className="text-sm text-secondary">
                  Couldn't refresh documents — showing the last loaded state.
                </p>

                <button
                  onClick={() => refetch()}
                  className="text-sm font-medium text-[var(--accent)] hover:underline"
                >
                  Retry
                </button>
              </div>
            )}

            <DocumentsGrid documents={filteredDocuments} />
          </>
        )}

        <UploadModal
          open={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onUploadSuccess={() =>
            queryClient.invalidateQueries({ queryKey: ["documents"] })
          }
        />
      </div>
    </div>
  );
}
