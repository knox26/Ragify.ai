import { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { defaultSchema } from "hast-util-sanitize";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { RagifyMark } from "../ui/RagifyMark";
import { citationPlugin, hasValidCitations } from "../../lib/citations";
import type { ChatMessage, ChatSource } from "../../lib/api";

// Keep <sup> (our citation badges) through sanitization; everything dangerous
// (script, event handlers, javascript: URLs) is stripped by the default schema.
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "sup"],
};

export interface StreamState {
  text: string;
  error: string | null;
  done: boolean;
}

interface ChatContentProps {
  messages: ChatMessage[];
  isLoading: boolean;
  pendingUserText: string | null;
  stream: StreamState | null;
  /** Older pages exist; fetch one when the user scrolls to the top. */
  hasOlder?: boolean;
  isFetchingOlder?: boolean;
  onLoadOlder?: () => Promise<unknown> | void;
}

function FootnoteMarker({ n }: { n: number }) {
  return (
    <sup className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[var(--accent-2)] text-white text-[10px] font-mono font-semibold align-super mx-0.5 -translate-y-1">
      {n}
    </sup>
  );
}

function pageRef(source: ChatSource): string {
  if (source.pageStart <= 0) {
    return source.fileName;
  }

  const range =
    source.pageEnd > source.pageStart
      ? `${source.pageStart}-${source.pageEnd}`
      : `${source.pageStart}`;

  return `${source.fileName} · p.${range}`;
}

function MarkdownAnswer({ content, sourceCount }: { content: string; sourceCount: number }) {
  return (
    <div className="markdown-answer">
      <ReactMarkdown
        remarkPlugins={[citationPlugin(sourceCount)]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
          sup: ({ children }) => <FootnoteMarker n={Number(children)} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function FootnoteBlock({ sources }: { sources: ChatSource[] }) {
  return (
    <div className="mt-8 space-y-3">
      <div className="border-t border-[var(--border-color)]" />

      {sources.map((source) => (
        <div key={source.n} className="flex gap-3">
          <span className="text-xs font-mono font-semibold text-[var(--accent-2)] pt-0.5 shrink-0">
            {source.n}.
          </span>
          <div>
            <p className="text-xs font-mono text-[var(--text-secondary)] mb-0.5">
              {pageRef(source)}
            </p>
            <p className="text-sm italic text-[var(--text-secondary)] leading-relaxed">
              “{source.quote}”
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

interface AnswerSheetProps {
  question: string;
  content: string;
  sources: ChatSource[] | null;
  error: boolean;
}

function AnswerSheet({ question, content, sources, error }: AnswerSheetProps) {
  const showFootnotes = !!sources && sources.length > 0 && hasValidCitations(content, sources.length);

  return (
    <div className="card rounded-2xl overflow-hidden">
      <div className="px-6 py-6 sm:px-8 sm:py-8">
        <p className="text-xs eyebrow mb-3" style={{ color: "var(--accent)" }}>
          Ask
        </p>
        <p className="text-lg font-medium text-[var(--text-primary)]">{question}</p>

        <div className="mt-6 text-[15px] leading-[1.9] text-[var(--text-primary)]">
          <MarkdownAnswer content={content} sourceCount={sources?.length ?? 0} />
        </div>

        {error && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-mono text-amber-300">
            <TriangleAlert size={13} />
            Answer interrupted — this response may be incomplete. Try again.
          </div>
        )}

        {showFootnotes && <FootnoteBlock sources={sources} />}
      </div>

      <div className="px-6 sm:px-8 py-3.5 border-t border-[var(--border-color)] bg-[var(--bg-section)]/60 flex items-center justify-between">
        <span className="text-xs font-mono text-[var(--text-secondary)]">
          {sources?.length ?? 0} source{sources?.length === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--text-secondary)]">
          <BadgeCheck className="w-3.5 h-3.5 text-[var(--accent-2)]" />
          Every claim is cited
        </span>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-xl rounded-2xl rounded-br-md px-5 py-3 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] text-[15px] leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function StreamingPartial({ stream }: { stream: StreamState }) {
  return (
    <div className="flex gap-3.5">
      <div className="h-8 w-8 rounded-full bg-[var(--text-primary)] flex items-center justify-center shrink-0 mt-1">
        <RagifyMark className="w-4 h-4 text-[var(--bg-primary)]" />
      </div>
      <div className="flex-1 min-w-0">
        {stream.text ? (
          <div className="card rounded-2xl px-6 py-6 text-[15px] leading-[1.9] text-[var(--text-primary)] whitespace-pre-wrap">
            {stream.text}
            {!stream.done && <TypingCaret />}
          </div>
        ) : stream.error ? (
          <div className="rounded-2xl px-6 py-5 border border-red-400/30 bg-red-400/10 text-sm text-red-300">
            {stream.error}
          </div>
        ) : (
          <div className="card rounded-2xl px-6 py-6 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <div className="h-4 w-4 rounded-full border-2 border-[var(--border-color)] border-t-[var(--accent)] animate-spin" />
            Searching your documents…
          </div>
        )}
      </div>
    </div>
  );
}

function TypingCaret() {
  return (
    <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-[var(--accent-2)] animate-pulse" />
  );
}

export function ChatContent({
  messages,
  isLoading,
  pendingUserText,
  stream,
  hasOlder = false,
  isFetchingOlder = false,
  onLoadOlder,
}: ChatContentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const didInitialScroll = useRef(false);
  const loadingOlderRef = useRef(false);

  // An assistant answer renders above the question that produced it. Map each
  // assistant message to its preceding user message's text — derived once so
  // nothing is reassigned during render.
  const questionByMessage = useMemo(() => {
    const map = new Map<string, string>();
    let lastUser: string | null = null;

    for (const message of messages) {
      if (message.role === "USER") {
        lastUser = message.content;
      } else if (lastUser !== null) {
        map.set(message.id, lastUser);
      }
    }

    return map;
  }, [messages]);

  // History loads newest-first, so the first paint sits at the top of the
  // newest page. On mount, jump to the bottom (the latest message). After
  // that, only follow new content when the user is already near the bottom —
  // never yank the viewport away from an earlier answer being read.
  useEffect(() => {
    const el = containerRef.current;

    if (!el || messages.length === 0) {
      return;
    }

    if (!didInitialScroll.current) {
      didInitialScroll.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;

    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, stream?.text]);

  // Fetch the previous page when the user scrolls near the top. Prepending
  // older rows grows content above the viewport, so shift scrollTop by the
  // delta afterwards to keep the visible message pinned in place.
  const loadOlder = () => {
    const el = containerRef.current;

    if (!el || loadingOlderRef.current || !onLoadOlder) {
      return;
    }

    loadingOlderRef.current = true;
    const prevHeight = el.scrollHeight;

    Promise.resolve(onLoadOlder()).finally(() => {
      loadingOlderRef.current = false;

      requestAnimationFrame(() => {
        if (el) {
          el.scrollTop += el.scrollHeight - prevHeight;
        }
      });
    });
  };

  const handleScroll = () => {
    const el = containerRef.current;

    if (el && el.scrollTop < 80) {
      loadOlder();
    }
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-12 py-8"
    >
      <div className="max-w-3xl mx-auto space-y-8">
        {hasOlder && (
          <div className="flex justify-center">
            <button
              onClick={loadOlder}
              disabled={isFetchingOlder}
              className="cursor-pointer text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
            >
              {isFetchingOlder ? "Loading earlier messages…" : "Load earlier messages"}
            </button>
          </div>
        )}

        {isLoading && messages.length === 0 && (
          <div className="flex items-center gap-3 text-[var(--text-secondary)] font-mono text-sm">
            <div className="h-4 w-4 rounded-full border-2 border-[var(--border-color)] border-t-[var(--accent)] animate-spin" />
            Loading conversation…
          </div>
        )}

        {messages.map((message) => {
          if (message.role === "USER") {
            return <UserBubble key={message.id} text={message.content} />;
          }

          return (
            <div key={message.id} className="flex gap-3.5">
              <div className="h-8 w-8 rounded-full bg-[var(--text-primary)] flex items-center justify-center shrink-0 mt-1">
                <RagifyMark className="w-4 h-4 text-[var(--bg-primary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <AnswerSheet
                  question={questionByMessage.get(message.id) ?? "You asked"}
                  content={message.content}
                  sources={message.sources}
                  error={message.error}
                />
              </div>
            </div>
          );
        })}

        {pendingUserText && <UserBubble text={pendingUserText} />}

        {stream && <StreamingPartial stream={stream} />}
      </div>
    </div>
  );
}
