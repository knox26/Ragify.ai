import { AlertTriangle, FileText, Search, Upload } from "lucide-react";

// Full-page fetch failure with nothing to show — a real message plus a retry,
// so a down server or bad response is never a silent blank grid.
export function DocumentsErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="relative overflow-hidden card p-12 flex flex-col items-center text-center">
      <div className="absolute inset-0 gradient-mesh opacity-60" aria-hidden="true" />

      <div className="relative flex flex-col items-center">
        <div className="h-14 w-14 rounded-2xl bg-[var(--accent-2)]/10 border border-[var(--accent-2)]/20 flex items-center justify-center mb-5">
          <AlertTriangle size={24} className="text-[var(--accent-2)]" />
        </div>

        <p className="text-xs eyebrow mb-3" style={{ color: "var(--accent)" }}>
          Connection error
        </p>
        <h3 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">
          Couldn't load documents
        </h3>

        <p className="text-sm text-[var(--text-secondary)] max-w-md mb-7">{message}</p>

        <button
          onClick={onRetry}
          className="cursor-pointer h-10 px-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-section)] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

// Two different "nothing here" cases need distinct copy: a brand-new account
// (CTA to upload) vs a search that filtered everything out (no CTA, just the
// query feedback). Both render an empty grid as blank — this tells them apart.
type DocumentsEmptyStateProps =
  | { kind: "no-documents"; onUpload: () => void }
  | { kind: "no-results"; query: string };

export function DocumentsEmptyState(props: DocumentsEmptyStateProps) {
  if (props.kind === "no-results") {
    return (
      <div className="relative overflow-hidden card p-12 flex flex-col items-center text-center">
        <div className="absolute inset-0 gradient-mesh opacity-40" aria-hidden="true" />

        <div className="relative flex flex-col items-center">
          <div className="h-14 w-14 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mb-5">
            <Search size={24} className="text-[var(--accent)]" />
          </div>

          <p className="text-xs eyebrow mb-3" style={{ color: "var(--accent)" }}>
            No results
          </p>
          <h3 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">
            No matching documents
          </h3>

          <p className="text-sm text-[var(--text-secondary)] max-w-md">
            Nothing matches{" "}
            <span className="font-mono text-[var(--text-primary)]">
              “{props.query}”
            </span>
            . Try a different search.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden card p-12 flex flex-col items-center text-center">
      <div className="absolute inset-0 gradient-mesh" aria-hidden="true" />

      <div className="relative flex flex-col items-center">
        <div className="h-14 w-14 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mb-5">
          <FileText size={24} className="text-[var(--accent)]" />
        </div>

        <p className="text-xs eyebrow mb-3" style={{ color: "var(--accent)" }}>
          Knowledge base
        </p>
        <h3 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">
          No documents yet
        </h3>

        <p className="text-sm text-[var(--text-secondary)] max-w-md mb-7">
          Upload your first document to start building a searchable knowledge
          base.
        </p>

        <button
          onClick={props.onUpload}
          className="cursor-pointer h-11 px-6 rounded-xl bg-[var(--accent)] text-white font-semibold inline-flex items-center gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-[var(--accent-glow)]"
        >
          <Upload size={18} />
          Upload your first document
        </button>
      </div>
    </div>
  );
}
