import { Globe, Paperclip, SendHorizontal } from "lucide-react";

export function ChatInput() {
  return (
    <div className="p-6 border-t border-[var(--border-color)]">
      <div className="card rounded-3xl p-4">
        <textarea
          rows={2}
          placeholder="Ask a question about your documents..."
          className="w-full resize-none bg-transparent outline-none text-lg"
        />

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="h-11 w-11 rounded-xl border border-[var(--border-color)] flex items-center justify-center">
              <Paperclip size={18} />
            </button>

            <button className="h-11 px-4 rounded-xl border border-[var(--border-color)] flex items-center gap-2">
              <Globe size={18} />
              All Sources
            </button>
          </div>

          <button className="h-12 w-12 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 flex items-center justify-center text-white">
            <SendHorizontal size={18} />
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-secondary mt-3">
        AI responses may be inaccurate. Verify important information.
      </p>
    </div>
  );
}
