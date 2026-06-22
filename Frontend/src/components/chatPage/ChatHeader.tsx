import { FileText, MoreHorizontal, Share2, Moon, Sun } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";

export function ChatHeader() {
  const { theme, toggleTheme } = useTheme();
  return (
    <header className="h-20 border-b border-[var(--border-color)] flex items-center justify-between px-8">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl border border-[var(--border-color)] flex items-center justify-center">
          <FileText size={20} />
        </div>

        <div>
          <h2 className="font-semibold text-lg">Q3 Financial Report.pdf</h2>

          <p className="text-secondary text-sm">23 Sources</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="h-11 px-4 rounded-xl border border-[var(--border-color)] flex items-center gap-2">
          <Share2 size={18} />
          Share
        </button>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-[var(--bg-card)] transition-colors border border-transparent hover:border-[var(--border-color)]"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="w-5 h-5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" />
          ) : (
            <Moon className="w-5 h-5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" />
          )}
        </button>

        <button className="h-11 w-11 rounded-xl border border-[var(--border-color)] flex items-center justify-center">
          <MoreHorizontal size={18} />
        </button>
      </div>
    </header>
  );
}
