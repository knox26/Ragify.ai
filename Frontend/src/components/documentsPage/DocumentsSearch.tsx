import { Search } from "lucide-react";

type DocumentsSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export function DocumentsSearch({ value, onChange }: DocumentsSearchProps) {
  return (
    <div className="relative">
      <Search
        size={18}
        className="
          absolute
          left-4
          top-1/2
          -translate-y-1/2
          text-secondary
        "
      />

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search documents..."
        className="
          w-full
          h-12
          pl-11
          pr-4
          rounded-xl
          card
          outline-none
          bg-transparent
        "
      />
    </div>
  );
}
