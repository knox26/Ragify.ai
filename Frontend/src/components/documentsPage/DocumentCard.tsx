import { FileText, Trash2 } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

type DocumentCardProps = {
  id: string;
  name: string;
  status: "READY" | "PROCESSING" | "FAILED";
  uploadedAt: string;
};

export function DocumentCard({ name, status, uploadedAt }: DocumentCardProps) {
  return (
    <div
      className="
        card
        p-5
        flex
        flex-col
        gap-4
      "
    >
      <div className="flex items-start gap-3">
        <div
          className="
            h-10
            w-10
            rounded-xl
            icon-bg
            flex
            items-center
            justify-center
          "
        >
          <FileText size={18} />
        </div>

        <h3
          className="
            font-medium
            truncate
            flex-1
          "
        >
          {name}
        </h3>
      </div>

      <StatusBadge status={status} />

      <p className="text-sm text-secondary">Uploaded {uploadedAt}</p>

      <button
        className="
          mt-auto
          flex
          items-center
          gap-2
          text-red-500
          hover:text-red-400
          transition-colors
        "
      >
        <Trash2 size={16} />
        Delete
      </button>
    </div>
  );
}
