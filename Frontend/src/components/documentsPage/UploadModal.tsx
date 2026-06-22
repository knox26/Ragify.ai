import { X, Upload, FileText } from "lucide-react";
import { useState } from "react";
import { uploadDocument } from "../../services/uploadDocument";

type UploadModalProps = {
  open: boolean;
  onClose: () => void;
};

export function UploadModal({ open, onClose }: UploadModalProps) {
  const [isUploading, setIsUploading] = useState(false);

  if (!open) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];

    if (!selectedFile) return;

    try {
      setIsUploading(true);

      const uploadInfo = await uploadDocument(selectedFile);

      console.log(uploadInfo);
    } catch (error) {
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="
        fixed
        inset-0
        z-50
        bg-black/50
        backdrop-blur-sm
        flex
        items-center
        justify-center
        p-4
      "
    >
      <div
        className="
          card
          w-full
          max-w-2xl
          p-6
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Upload Document</h2>

            <p className="text-secondary mt-1">
              Add a PDF, DOCX, TXT, or Markdown file to your knowledge base.
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={isUploading}
            className="
              h-10
              w-10
              rounded-xl
              hover:bg-[var(--bg-section)]
              flex
              items-center
              justify-center
              transition-colors
              disabled:opacity-50
            "
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
                  icon-bg
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
                {isUploading ? "Uploading document..." : "Upload your document"}
              </h3>

              <p className="text-secondary max-w-md">
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
                          text-sm
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

        {/* Footer */}
        <div
          className="
            mt-6
            pt-6
            border-t
            border-[var(--border-color)]
            flex
            items-center
            gap-3
            text-sm
            text-secondary
          "
        >
          <FileText size={16} />
          Documents will be processed automatically and become searchable once
          indexing completes.
        </div>
      </div>
    </div>
  );
}
