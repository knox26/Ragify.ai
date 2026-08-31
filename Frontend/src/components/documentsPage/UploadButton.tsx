import { Upload } from "lucide-react";

type UploadButtonProps = {
  onClick: () => void;
};

export function UploadButton({ onClick }: UploadButtonProps) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer h-11 px-5 rounded-xl bg-[var(--accent)] text-white font-semibold inline-flex items-center gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-[var(--accent-glow)]"
    >
      <Upload size={16} />
      Upload document
    </button>
  );
}
