import type { DocumentStatus } from "../../lib/api";

type StatusBadgeProps = {
  status: DocumentStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<DocumentStatus, string> = {
    PENDING_UPLOAD: "bg-yellow-500/10 text-yellow-500",
    UPLOAD_COMPLETED: "bg-blue-500/10 text-blue-500",
    QUEUED: "bg-purple-500/10 text-purple-500",
    PROCESSING: "bg-yellow-500/10 text-yellow-500",
    COMPLETED: "bg-emerald-500/10 text-emerald-500",
    FAILED: "bg-red-500/10 text-red-500",
  };

  const labels: Record<DocumentStatus, string> = {
    PENDING_UPLOAD: "Pending Upload",
    UPLOAD_COMPLETED: "Uploaded",
    QUEUED: "Queued",
    PROCESSING: "Processing",
    COMPLETED: "Ready",
    FAILED: "Failed",
  };

  return (
    <span
      className={`
        inline-flex
        items-center
        gap-2
        rounded-full
        px-3
        py-1
        text-sm
        font-medium
        ${styles[status] ?? "bg-gray-500/10 text-gray-500"}
      `}
    >
      ● {labels[status] ?? status}
    </span>
  );
}
