import { X, Upload, FileText } from "lucide-react";
import { useRef, useState } from "react";
import {
  api,
  type InitUploadResponse,
  type UploadedChunk,
} from "../../lib/api";
import { createUploadChunks } from "../../utils/createUploadChunks";
import { uploadDocumentChunks } from "../../services/uploadDocumentChunks";

// How many times to re-init (same documentId -> fresh presigned URLs) when a
// presigned URL expires mid-upload. Bounds the refresh loop.
const MAX_URL_REFRESHES = 2;

type UploadModalProps = {
  open: boolean;
  onClose: () => void;
  onUploadSuccess?: () => void;
};

export function UploadModal({
  open,
  onClose,
  onUploadSuccess,
}: UploadModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  // Aborts the in-flight chunk PUTs and the init/complete requests. Lives in a
  // ref so the Cancel button can reach it while the upload runs.
  const abortRef = useRef<AbortController | null>(null);

  // Identifies the CURRENT upload. Every handleFileSelect bumps it; any state
  // mutation in an older (cancelled) chain checks it first so a stale chain
  // can never clobber a newer upload's state (Cancel -> re-open -> re-pick).
  const uploadGenerationRef = useRef(0);

  // Idempotency key for the in-flight upload. Keyed by file identity so a
  // retry of the SAME file reuses the documentId (the server returns the
  // existing upload instead of orphaning row + multipart), while a different
  // file always gets a fresh key.
  const pendingUploadRef = useRef<{ signature: string; documentId: string } | null>(null);

  if (!open) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];

    if (!selectedFile) return;

    // Clear the input so re-selecting the SAME file fires `change` again —
    // the same-file retry path (idempotency-key reuse) depends on it.
    e.target.value = "";

    // This upload's generation. Older chains (cancelled + superseded) see a
    // mismatch and stop mutating state.
    const generation = ++uploadGenerationRef.current;
    const isCurrent = () => generation === uploadGenerationRef.current;

    try {
      setIsUploading(true);
      setError(null);
      setProgress(0);

      const abortController = new AbortController();
      abortRef.current = abortController;
      const signal = abortController.signal;

      // Reuse the idempotency key if this is a retry of the same file — the
      // previous init may have created row + multipart before its response
      // was lost. A different file (or a fresh upload after success) gets a
      // new key so it can never collide with a prior document.
      const signature = `${selectedFile.name}|${selectedFile.size}|${selectedFile.lastModified}`;
      const pending = pendingUploadRef.current;
      const documentId =
        pending && pending.signature === signature
          ? pending.documentId
          : crypto.randomUUID();

      pendingUploadRef.current = { signature, documentId };

      // Shared by the first init and any URL-refresh re-inits. Re-init reuses
      // the same documentId (idempotent) so the server returns the existing
      // upload with fresh presigned URLs instead of orphaning row + multipart.
      const initUpload = async (): Promise<InitUploadResponse> => {
        const response = await api.initializeUpload(
          {
            documentId,
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            mimeType: selectedFile.type,
          },
          { signal },
        );

        // Defensive: a truly empty payload is a server fault, not a success.
        if (!response.data) {
          throw new Error("Upload failed to initialize. Please try again.");
        }

        return response.data;
      };

      const uploadInfo = await initUpload();

      if (!isCurrent()) return;

      // Idempotent retry found the document already past init — no parts to
      // upload. FAILED is terminal: don't report it as success; clear the key
      // so a fresh attempt creates a new document.
      if (!("presignedUrls" in uploadInfo)) {
        if (uploadInfo.status === "FAILED") {
          pendingUploadRef.current = null;
          setError(
            "This upload failed on the server. Pick the file again to retry.",
          );
        } else {
          onClose();
          onUploadSuccess?.();
        }
        return;
      }

      const uploadedChunks: UploadedChunk[] = [];
      let refreshBudget = MAX_URL_REFRESHES;
      let pendingChunks = createUploadChunks({
        file: selectedFile,
        chunkSize: uploadInfo.chunkSize,
        presignedUrls: uploadInfo.presignedUrls,
      });

      // Progress is reported over the ORIGINAL part count, so a URL-refresh
      // cycle that re-uploads only the failed parts keeps rising to 100%
      // instead of resetting.
      const totalParts = pendingChunks.length;
      let completedParts = 0;

      // Upload in cycles. Per-part transient retries (inside
      // uploadDocumentChunks) handle blips; if a presigned URL expires
      // mid-upload, re-init for fresh URLs and re-upload only the failed
      // parts. Any other failure stops here and falls back to manual re-pick.
      while (pendingChunks.length > 0) {
        const uploadResult = await uploadDocumentChunks(pendingChunks, {
          signal,
          onProgress: (done) => {
            if (!isCurrent()) return;
            const pct = Math.min(
              100,
              Math.round(((completedParts + done) / totalParts) * 100),
            );
            setProgress(pct);
          },
        });

        if (!isCurrent()) return;

        completedParts += uploadResult.uploadedChunks.length;

        // Accumulate the newly-uploaded parts. On a URL-refresh cycle only the
        // failed parts are re-uploaded, so this pushes only the fresh ones —
        // otherwise the outer array would stay empty and completeUpload would
        // 400 with "At least one uploaded chunk is required".
        uploadedChunks.push(...uploadResult.uploadedChunks);

        if (uploadResult.aborted) {
          // Defensive: today only handleCancelUpload can abort, and it bumps
          // the generation first, so the isCurrent() check above bails before
          // this. Kept for any future abort path that doesn't bump generation
          // (e.g. abort-on-unmount). Closes and keeps the idempotency key so a
          // same-file re-pick resumes the same upload instead of orphaning it.
          abortRef.current = null;
          setProgress(null);
          setError(null);
          onClose();
          return;
        }

        if (uploadResult.failedChunks.length === 0) {
          break;
        }

        if (uploadResult.urlExpired && refreshBudget > 0) {
          refreshBudget--;

          console.log(
            "Refreshing expired upload URLs for parts: ",
            uploadResult.failedChunks.map((chunk) => chunk.chunkNumber),
          );

          const fresh = await initUpload();

          // Another await inside the cycle — guard again so a stale chain can
          // never setError on a newer upload's modal.
          if (!isCurrent()) return;

          // Moved past PENDING_UPLOAD mid-cycle (e.g. concurrent completion) —
          // treat as terminal.
          if (!("presignedUrls" in fresh)) {
            if (fresh.status === "FAILED") {
              pendingUploadRef.current = null;
              setError(
                "This upload failed on the server. Pick the file again to retry.",
              );
              return;
            }
            break;
          }

          // Rebuild only the failed parts against the fresh URLs.
          const failedNumbers = new Set(
            uploadResult.failedChunks.map((chunk) => chunk.chunkNumber),
          );
          const freshChunks = createUploadChunks({
            file: selectedFile,
            chunkSize: fresh.chunkSize,
            presignedUrls: fresh.presignedUrls,
          });
          pendingChunks = freshChunks.filter((chunk) =>
            failedNumbers.has(chunk.chunkNumber),
          );
          continue;
        }

        // Permanent failure, or the URL-refresh budget ran out — keep the key
        // so a manual same-file re-pick reuses the same uploadId.
        setError(
          `${uploadResult.failedChunks.length} chunk(s) failed to upload. Pick the file again to retry.`,
        );
        console.error(
          "Failed chunks: ",
          uploadResult.failedChunks.map((chunk) => chunk.chunkNumber),
        );
        return;
      }

      // Done — clear the key so the next file gets a fresh documentId.
      await api.completeUpload(
        {
          documentId,
          chunks: uploadedChunks,
        },
        { signal },
      );

      if (!isCurrent()) return;

      pendingUploadRef.current = null;
      abortRef.current = null;
      setProgress(null);
      setError(null);
      onClose();
      onUploadSuccess?.();
    } catch (error) {
      // A stale chain (cancel then re-pick) must not touch the new upload's
      // state — drop it entirely.
      if (!isCurrent()) return;

      // An aborted init/complete surfaces as an error — swallow it and close
      // cleanly; the Cancel button already reset the UI.
      if (abortRef.current?.signal.aborted) {
        abortRef.current = null;
        setProgress(null);
        setError(null);
        onClose();
        return;
      }

      setError(
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.",
      );
      console.error(error);
    } finally {
      // Only the current chain may flip the flag — otherwise a stale chain
      // would clobber a newer upload's isUploading=true.
      if (isCurrent()) {
        setIsUploading(false);
      }
    }
  };

  const handleCancelUpload = () => {
    // Cancel ends this upload's generation too, so the winding-down chain is
    // stale even before a re-pick and can no longer touch modal state.
    uploadGenerationRef.current++;
    abortRef.current?.abort();
    setIsUploading(false);
    setProgress(null);
    setError(null);
    onClose();
  };

  return (
    <div
      className="
        fixed
        inset-0
        z-50
        bg-black/70
        backdrop-blur-sm
        flex
        items-center
        justify-center
        p-4
      "
    >
      <div className="card w-full max-w-2xl p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs eyebrow mb-2" style={{ color: "var(--accent)" }}>
              Upload
            </p>
            <h2 className="text-xl font-bold tracking-tight">
              Add a document
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              PDF, DOCX, TXT, or Markdown. It becomes searchable once indexing
              completes.
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={isUploading}
            className="
              cursor-pointer
              h-10
              w-10
              rounded-xl
              hover:bg-[var(--bg-section)]
              flex
              items-center
              justify-center
              transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Upload Zone */}
        <label
          className={`
            group
            block
            ${isUploading ? "pointer-events-none" : "cursor-pointer"}
          `}
        >
          <div
            className="
              border-2
              border-dashed
              border-[var(--border-color)]
              rounded-2xl
              p-12
              transition-all
              duration-300
              hover:border-[var(--accent)]
              hover:bg-[var(--bg-section)]
            "
          >
            <div className="flex flex-col items-center text-center">
              <div
                className="
                  h-16
                  w-16
                  rounded-2xl
                  bg-[var(--accent-soft)]
                  flex
                  items-center
                  justify-center
                  mb-5
                "
              >
                {isUploading ? (
                  <div
                    className="
                      h-7
                      w-7
                      rounded-full
                      border-2
                      border-[var(--accent)]
                      border-t-transparent
                      animate-spin
                    "
                  />
                ) : (
                  <Upload size={28} className="text-[var(--accent)]" />
                )}
              </div>

              <h3 className="text-lg font-semibold mb-2">
                {isUploading ? "Uploading document…" : "Upload your document"}
              </h3>

              <p className="text-sm text-[var(--text-secondary)] max-w-md">
                {isUploading
                  ? "Please wait while we upload your file."
                  : "Drag and drop a file here, or click to browse"}
              </p>

              {!isUploading && (
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {["PDF", "DOCX", "TXT", "MD"].map((type) => (
                    <span
                      key={type}
                      className="
                        px-3
                        py-1
                        rounded-full
                        text-xs
                        font-mono
                        text-[var(--text-secondary)]
                        bg-[var(--bg-section)]
                        border
                        border-[var(--border-color)]
                      "
                    >
                      {type}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <input
              type="file"
              hidden
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileSelect}
            />
          </div>
        </label>

        {/* Progress + cancel — the escape hatch while uploading. The close
            button stays disabled mid-upload so a cancel is deliberate. */}
        {isUploading && (
          <div className="mt-4">
            <div className="h-2 rounded-full bg-[var(--bg-section)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${progress ?? 0}%` }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-[var(--text-secondary)] font-mono">
                {progress ?? 0}% uploaded
              </span>

              <button
                onClick={handleCancelUpload}
                className="cursor-pointer text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
              >
                Cancel upload
              </button>
            </div>
          </div>
        )}

        {/* Inline error — a failed/partial upload must be visible, not
            swallowed in a console log. */}
        {error && (
          <p
            role="alert"
            className="mt-4 text-sm font-medium text-red-400"
          >
            {error}
          </p>
        )}

        {/* Footer */}
        <div
          className="
            mt-6
            pt-6
            border-t
            border-[var(--border-color)]
            flex
            items-center
            gap-2
            text-xs
            font-mono
            text-[var(--text-secondary)]
          "
        >
          <FileText size={14} />
          Documents are processed automatically and become searchable once
          indexing completes.
        </div>
      </div>
    </div>
  );
}
