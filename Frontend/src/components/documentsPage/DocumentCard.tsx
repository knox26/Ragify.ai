import { FileText, Trash2 } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { Document } from "../../lib/api";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function fileExtension(fileName: string) {
  const ext = fileName.split(".").pop();
  return ext && ext !== fileName ? ext.toUpperCase() : "FILE";
}

export function DocumentCard({ fileName, fileSize, status, createdAt }: Document) {
  const formattedDate = new Date(createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="card p-5 flex flex-col gap-4 group">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
          <FileText size={18} className="text-[var(--accent)]" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-medium text-[var(--text-primary)] truncate" title={fileName}>
            {fileName}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)] font-mono">
            {formatFileSize(fileSize)}
          </p>
        </div>

        <span className="shrink-0 rounded-md border border-[var(--border-color)] bg-[var(--bg-section)]/60 px-1.5 py-0.5 text-[11px] font-mono text-[var(--text-secondary)]">
          {fileExtension(fileName)}
        </span>
      </div>

      <StatusBadge status={status} />

      <div className="mt-auto flex items-center justify-between pt-1">
        <p className="text-xs text-[var(--text-secondary)]">
          Uploaded {formattedDate}
        </p>

        <button className="cursor-pointer flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-2)] transition-colors">
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}
