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
    <div className="card p-10 flex flex-col items-center text-center">
      <div className="h-14 w-14 rounded-2xl icon-bg flex items-center justify-center mb-4">
        <AlertTriangle size={24} className="text-[var(--accent-2)]" />
      </div>

      <h3 className="text-lg font-semibold mb-1">Couldn't load documents</h3>

      <p className="text-secondary max-w-md mb-6">{message}</p>

      <button onClick={onRetry} className="h-10 px-4 btn-ghost">
        Try again
      </button>
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
      <div className="card p-10 flex flex-col items-center text-center">
        <div className="h-14 w-14 rounded-2xl icon-bg flex items-center justify-center mb-4">
          <Search size={24} className="text-[var(--accent)]" />
        </div>

        <h3 className="text-lg font-semibold mb-1">No matching documents</h3>

        <p className="text-secondary max-w-md">
          Nothing matches &ldquo;{props.query}&rdquo;. Try a different search.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-10 flex flex-col items-center text-center">
      <div className="h-14 w-14 rounded-2xl icon-bg flex items-center justify-center mb-4">
        <FileText size={24} className="text-[var(--accent)]" />
      </div>

      <h3 className="text-lg font-semibold mb-1">No documents yet</h3>

      <p className="text-secondary max-w-md mb-6">
        Upload your first document to start building a searchable knowledge base.
      </p>

      <button onClick={props.onUpload} className="h-11 px-5 btn-primary">
        <Upload size={18} />
        Upload your first document
      </button>
    </div>
  );
}
