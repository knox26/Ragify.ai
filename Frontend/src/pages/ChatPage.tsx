import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ChatHeader } from "../components/chatPage/ChatHeader";
import { ChatContent, type StreamState } from "../components/chatPage/ChatContent";
import { ChatInput } from "../components/chatPage/ChatInput";
import { api, ApiError, getFriendlyErrorMessage, streamChatMessage } from "../lib/api";

interface StreamSession {
  id: string;
  title: string;
  documentId: string | null;
}

export function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const sessionId = searchParams.get("chat");

  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [streamSession, setStreamSession] = useState<StreamSession | null>(null);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The active session comes from a dedicated per-session query, not the
  // sidebar's paginated list — the URL can point at any session, even one on
  // a page the sidebar hasn't loaded yet.
  const chatSessionQuery = useQuery({
    queryKey: ["chatSession", sessionId],
    queryFn: () => api.getChatSession(sessionId as string),
    enabled: !!sessionId,
    retry: false,
  });

  const activeSession = chatSessionQuery.data?.data ?? null;

  // Messages load newest-first ("desc"), then walk backward via nextCursor.
  // Each page is one request; a failed page only fails that page, leaving the
  // already-loaded history rendered.
  const messagesQuery = useInfiniteQuery({
    queryKey: ["chatMessages", sessionId],
    queryFn: ({ pageParam }) =>
      api.getChatMessages(sessionId as string, {
        dir: "desc",
        cursor: pageParam,
      }),
    enabled: !!sessionId,
    retry: false,
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.pagination?.hasMore ? last.pagination.nextCursor : undefined,
  });

  // pages[0] is the newest page, and each page is newest-first. Flatten to
  // oldest → newest for the renderer.
  const messages = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    return [...pages]
      .reverse()
      .flatMap((page) => (page.data ?? []).slice().reverse());
  }, [messagesQuery.data]);

  const loadOlderMessages = () => messagesQuery.fetchNextPage();
  const hasOlderMessages = messagesQuery.hasNextPage;
  const isFetchingOlder = messagesQuery.isFetchingNextPage;

  // Stale session id in the URL (deleted elsewhere) → 404 → clear the param.
  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const sessionGone =
      (chatSessionQuery.isError &&
        chatSessionQuery.error instanceof ApiError &&
        chatSessionQuery.error.status === 404) ||
      (messagesQuery.isError &&
        messagesQuery.error instanceof ApiError &&
        messagesQuery.error.status === 404);

    if (sessionGone) {
      setSearchParams({});
    }
  }, [
    sessionId,
    chatSessionQuery.isError,
    chatSessionQuery.error,
    messagesQuery.isError,
    messagesQuery.error,
    setSearchParams,
  ]);

  // Abort any in-flight stream on unmount so the server persists the partial.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Once the persisted pair lands in the messages query, swap the transient
  // stream state for the real history — no flash, no duplicate bubbles.
  useEffect(() => {
    if (stream?.done && sessionId && !messagesQuery.isLoading) {
      setStream(null);
      setStreamSession(null);
      setPendingUserText(null);
    }
  }, [stream?.done, sessionId, messagesQuery.isLoading]);

  // Opening a session reflects its scope in the picker (and locks it).
  useEffect(() => {
    if (activeSession) {
      setSelectedDoc(activeSession.documentId);
    }
  }, [activeSession]);

  const effectiveDoc = activeSession ? activeSession.documentId : selectedDoc;
  const scopeLocked = !!activeSession;
  const isStreaming = !!stream && !stream.done;

  const handleSend = async (content: string) => {
    if (stream) {
      return;
    }

    const targetSessionId = sessionId ?? undefined;
    const doc = activeSession ? activeSession.documentId : selectedDoc;

    setPendingUserText(content);
    setStream({ text: "", error: null, done: false });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChatMessage({
        sessionId: targetSessionId,
        documentId: targetSessionId ? undefined : doc,
        content,
        signal: controller.signal,
        onChunk: (chunk) => {
          if (chunk.type === "meta") {
            setStreamSession({
              id: chunk.sessionId,
              title: chunk.title,
              documentId: chunk.documentId,
            });
            setSelectedDoc(chunk.documentId);
            setSearchParams({ chat: chunk.sessionId }, { replace: true });
          } else if (chunk.type === "delta") {
            setStream((prev) =>
              prev
                ? { ...prev, text: prev.text + chunk.text }
                : { text: chunk.text, error: null, done: false },
            );
          } else if (chunk.type === "done") {
            setStream((prev) => (prev ? { ...prev, done: true } : prev));
            queryClient.invalidateQueries({ queryKey: ["chatMessages"] });
            queryClient.invalidateQueries({ queryKey: ["chatSessions"] });
            queryClient.invalidateQueries({ queryKey: ["chatSession"] });
          } else if (chunk.type === "error") {
            setStream((prev) =>
              prev
                ? { ...prev, error: chunk.message, done: true }
                : { text: "", error: chunk.message, done: true },
            );
            queryClient.invalidateQueries({ queryKey: ["chatMessages"] });
            queryClient.invalidateQueries({ queryKey: ["chatSessions"] });
            queryClient.invalidateQueries({ queryKey: ["chatSession"] });
          }
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Cancel: the server persisted the partial with error: true. Mark done
        // so the swap effect picks it up once history refetches.
        setStream((prev) => (prev ? { ...prev, done: true, error: null } : prev));
      } else {
        setStream((prev) =>
          prev
            ? { ...prev, error: getFriendlyErrorMessage(error), done: true }
            : { text: "", error: getFriendlyErrorMessage(error), done: true },
        );
      }
      queryClient.invalidateQueries({ queryKey: ["chatMessages"] });
      queryClient.invalidateQueries({ queryKey: ["chatSessions"] });
      queryClient.invalidateQueries({ queryKey: ["chatSession"] });
    } finally {
      abortRef.current = null;
    }
  };

  const headerTitle = activeSession?.title ?? streamSession?.title ?? "New Chat";
  const headerDoc = activeSession?.documentId ?? streamSession?.documentId ?? selectedDoc;
  const headerIsGlobal = headerDoc === null;

  // The scoped document may live beyond the first documents page (or a global
  // chat may reference any doc), so resolve its name by id rather than
  // scanning page 1 and falling back to the generic "Document" label.
  const headerDocQuery = useQuery({
    queryKey: ["document", headerDoc],
    queryFn: () => api.getDocument(headerDoc as string),
    enabled: !!headerDoc,
  });

  const headerScopeLabel = headerIsGlobal
    ? "All sources"
    : headerDocQuery.data?.data?.fileName ?? "Document";

  const latestSourceCount = useMemo(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "ASSISTANT");

    return lastAssistant?.sources?.length ?? 0;
  }, [messages]);

  const showWelcome = !sessionId && !pendingUserText && !stream;

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden">
      <ChatHeader
        sessionId={sessionId}
        title={headerTitle}
        scopeLabel={headerScopeLabel}
        isGlobal={headerIsGlobal}
        sourceCount={latestSourceCount}
      />

      {showWelcome ? (
        <WelcomeState onPickSource={setSelectedDoc} />
      ) : (
        <ChatContent
          key={sessionId ?? "new"}
          messages={messages}
          isLoading={messagesQuery.isLoading && !stream}
          pendingUserText={pendingUserText}
          stream={stream}
          hasOlder={hasOlderMessages}
          isFetchingOlder={isFetchingOlder}
          onLoadOlder={loadOlderMessages}
        />
      )}

      <ChatInput
        onSend={handleSend}
        disabled={isStreaming}
        documentId={effectiveDoc}
        onDocumentChange={setSelectedDoc}
        scopeLocked={scopeLocked}
      />
    </div>
  );
}

function WelcomeState({ onPickSource }: { onPickSource: (id: string | null) => void }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-12 py-8 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center space-y-5">
        <div className="h-14 w-14 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mx-auto">
          <div className="w-7 h-7 text-[var(--accent)] font-mono font-bold text-lg flex items-center justify-center">
            R
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Ask your documents anything
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
            Ragify answers from your uploaded files — every claim cites the
            exact passage it came from. Pick a single document, or ask across
            everything.
          </p>
        </div>
        <button
          onClick={() => onPickSource(null)}
          className="text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          start with all sources ↓
        </button>
      </div>
    </div>
  );
}
