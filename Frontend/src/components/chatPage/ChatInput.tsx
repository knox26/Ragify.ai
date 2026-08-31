import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  FileText,
  Globe,
  Paperclip,
  Search,
  SendHorizontal,
} from "lucide-react";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
  documentId: string | null;
  onDocumentChange: (id: string | null) => void;
  scopeLocked: boolean;
}

const COMPLETED = "COMPLETED";

export function ChatInput({
  onSend,
  disabled,
  documentId,
  onDocumentChange,
  scopeLocked,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSearchDebounced, setPickerSearchDebounced] = useState("");
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // The picker reaches every COMPLETED document, not just the first page: it
  // is its own server-side query (search + status filter + cursor), so a
  // library bigger than one page stays fully selectable. It only runs while
  // the picker is open — no wasted fetch on mount.
  useEffect(() => {
    const t = setTimeout(() => setPickerSearchDebounced(pickerSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [pickerSearch]);

  const completedQuery = useInfiniteQuery({
    queryKey: ["documents", "completed", pickerSearchDebounced],
    queryFn: ({ pageParam }) =>
      api.getDocuments({
        cursor: pageParam,
        search: pickerSearchDebounced || undefined,
        status: COMPLETED,
      }),
    enabled: pickerOpen,
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.pagination?.hasMore ? last.pagination.nextCursor : undefined,
  });

  const completedDocs =
    completedQuery.data?.pages.flatMap((p) => p.data ?? []) ?? [];

  // A session-scoped document may live beyond the loaded picker pages (or the
  // picker may never have opened). Resolve its name by id instead of falling
  // back to the generic "Document" label.
  const selectedDocQuery = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => api.getDocument(documentId as string),
    enabled: !!documentId,
  });

  const selectedLabel = documentId
    ? completedDocs.find((doc) => doc.id === documentId)?.fileName ??
      selectedDocQuery.data?.data?.fileName ??
      "All sources"
    : "All sources";

  const canSend = text.trim().length > 0 && !disabled;

  const submit = () => {
    if (!canSend) {
      return;
    }

    onSend(text.trim());
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline. Skip during IME composition.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }

    const onPointerDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);

    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pickerOpen]);

  return (
    <div className="px-4 sm:px-6 lg:px-12 pb-4 pt-2 shrink-0">
      <div className="max-w-3xl mx-auto">
        <div className="card rounded-2xl p-4">
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents…"
            disabled={disabled}
            className="w-full resize-none bg-transparent outline-none text-[15px] leading-relaxed placeholder:text-[var(--text-secondary)] disabled:opacity-50"
          />

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                className="cursor-pointer h-9 w-9 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-section)] transition-colors"
                aria-label="Attach a file"
                tabIndex={-1}
              >
                <Paperclip size={16} />
              </button>

              {scopeLocked ? (
                <button
                  disabled
                  title="This chat's scope is fixed"
                  className="h-9 px-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] opacity-70 cursor-default"
                >
                  {documentId ? <FileText size={15} /> : <Globe size={15} />}
                  {selectedLabel}
                </button>
              ) : (
                <div className="relative" ref={pickerRef}>
                  <button
                    className="cursor-pointer h-9 px-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-section)] transition-colors"
                    onClick={() => setPickerOpen((open) => !open)}
                    aria-expanded={pickerOpen}
                    aria-haspopup="listbox"
                  >
                    {documentId ? <FileText size={15} /> : <Globe size={15} />}
                    {selectedLabel}
                    <ChevronDown size={14} />
                  </button>

                  {pickerOpen && (
                    <div
                      role="listbox"
                      className="absolute bottom-11 left-0 w-72 max-h-72 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl z-20 py-1.5"
                    >
                      <div className="px-3 pt-1 pb-1.5">
                        <div className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-section)]/60 px-2.5 py-1.5">
                          <Search size={13} className="shrink-0 text-[var(--text-secondary)]" />
                          <input
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            placeholder="Filter documents…"
                            className="w-full bg-transparent outline-none text-sm placeholder:text-[var(--text-secondary)]"
                          />
                        </div>
                      </div>

                      <button
                        role="option"
                        aria-selected={documentId === null}
                        className={cn(
                          "cursor-pointer w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors",
                          documentId === null
                            ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--bg-section)] hover:text-[var(--text-primary)]",
                        )}
                        onClick={() => {
                          onDocumentChange(null);
                          setPickerOpen(false);
                        }}
                      >
                        <Globe size={15} className="shrink-0" />
                        All sources
                      </button>

                      {completedDocs.length === 0 && (
                        <p className="px-3.5 py-2.5 text-xs text-[var(--text-secondary)]">
                          No processed documents yet.
                        </p>
                      )}

                      {completedDocs.map((doc) => (
                        <button
                          key={doc.id}
                          role="option"
                          aria-selected={documentId === doc.id}
                          className={cn(
                            "cursor-pointer w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors",
                            documentId === doc.id
                              ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                              : "text-[var(--text-secondary)] hover:bg-[var(--bg-section)] hover:text-[var(--text-primary)]",
                          )}
                          onClick={() => {
                            onDocumentChange(doc.id);
                            setPickerOpen(false);
                          }}
                        >
                          <FileText size={15} className="shrink-0" />
                          <span className="truncate">{doc.fileName}</span>
                        </button>
                      ))}

                      {completedQuery.hasNextPage && (
                        <button
                          onClick={() => void completedQuery.fetchNextPage()}
                          disabled={completedQuery.isFetchingNextPage}
                          className="cursor-pointer w-full py-2 text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                        >
                          {completedQuery.isFetchingNextPage
                            ? "Loading…"
                            : "Load more documents"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={submit}
              disabled={!canSend}
              className="cursor-pointer h-10 w-10 rounded-full bg-[var(--accent)] text-white flex items-center justify-center hover:opacity-90 transition-opacity shadow-lg shadow-[var(--accent-glow)] disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              {disabled ? (
                <div className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <SendHorizontal size={17} />
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-xs font-mono text-[var(--text-secondary)] mt-3">
          Ragify can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
