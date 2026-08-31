import { UploadButton } from "./UploadButton";

type DocumentsHeaderProps = {
  count: number;
  onUploadClick: () => void;
};

export function DocumentsHeader({ count, onUploadClick }: DocumentsHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs eyebrow mb-3" style={{ color: "var(--accent)" }}>
          Knowledge base
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          Documents
          <span className="gradient-text">.</span>
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          {count === 0
            ? "Your knowledge base is empty — upload a document to get started."
            : `${count} document${count === 1 ? "" : "s"} indexed and searchable.`}
        </p>
      </div>

      <UploadButton onClick={onUploadClick} />
    </div>
  );
}
