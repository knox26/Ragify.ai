import { Search } from "lucide-react";

type DocumentsSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export function DocumentsSearch({ value, onChange }: DocumentsSearchProps) {
  return (
    <div className="relative max-w-xl">
      <Search
        size={16}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
      />

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search documents by name…"
        className="w-full h-11 pl-11 pr-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-section)]/60 outline-none text-sm placeholder:text-[var(--text-secondary)] focus:border-[var(--accent)] transition-colors"
      />
    </div>
  );
}
