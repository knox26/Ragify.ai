import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { FileText, Globe, MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";
import { api } from "../../lib/api";

interface ChatHeaderProps {
  sessionId: string | null;
  title: string;
  scopeLabel: string;
  isGlobal: boolean;
  sourceCount: number;
}

export function ChatHeader({ sessionId, title, scopeLabel, isGlobal, sourceCount }: ChatHeaderProps) {
  const queryClient = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);

    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const handleRename = async () => {
    setMenuOpen(false);

    if (!sessionId) {
      return;
    }

    const next = window.prompt("Rename chat", title);

    if (next === null) {
      return;
    }

    const trimmed = next.trim();

    if (!trimmed) {
      return;
    }

    try {
      await api.renameChat(sessionId, trimmed);
      queryClient.invalidateQueries({ queryKey: ["chatSessions"] });
      queryClient.invalidateQueries({ queryKey: ["chatSession", sessionId] });
    } catch {
      // Surface failure silently here — the sidebar refetch shows the old title.
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);

    if (!sessionId) {
      return;
    }

    if (!window.confirm("Delete this chat and all of its messages?")) {
      return;
    }

    try {
      await api.deleteChat(sessionId);
      queryClient.invalidateQueries({ queryKey: ["chatSessions"] });
      queryClient.removeQueries({ queryKey: ["chatMessages", sessionId] });
      queryClient.removeQueries({ queryKey: ["chatSession", sessionId] });
      setSearchParams({});
    } catch {
      // Non-fatal — the session stays in the sidebar.
    }
  };

  return (
    <header className="h-16 border-b border-[var(--border-color)] flex items-center justify-between px-5 lg:px-8 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-lg border border-[var(--border-color)] bg-[var(--bg-section)]/60 flex items-center justify-center shrink-0">
          {isGlobal ? (
            <Globe size={16} className="text-[var(--accent)]" />
          ) : (
            <FileText size={16} className="text-[var(--accent)]" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-mono font-medium text-[var(--text-primary)] truncate">
            {title}
          </p>
          <p className="text-xs font-mono text-[var(--text-secondary)] truncate">
            {scopeLabel}
            {sourceCount > 0 ? ` · ${sourceCount} source${sourceCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="cursor-pointer h-9 px-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-section)] transition-colors"
          aria-label="Share"
        >
          <Share2 size={15} />
          Share
        </button>

        <div className="relative" ref={menuRef}>
          <button
            className="cursor-pointer h-9 w-9 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-section)] transition-colors"
            aria-label="More options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            disabled={!sessionId}
          >
            <MoreHorizontal size={16} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-11 w-48 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl z-20 py-1.5">
              <button
                className="cursor-pointer w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-section)] transition-colors"
                onClick={handleRename}
              >
                <Pencil size={14} className="text-[var(--text-secondary)]" />
                Rename
              </button>
              <button
                className="cursor-pointer w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-400 hover:bg-red-400/10 transition-colors"
                onClick={handleDelete}
              >
                <Trash2 size={14} />
                Delete chat
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
