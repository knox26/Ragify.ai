import type { DocumentStatus } from "../../lib/api";

type StatusBadgeProps = {
  status: DocumentStatus;
};

/**
 * Processing status as a mono tag with a status dot. Colors stay semantic
 * (ready = green, failed = red) but muted to live on the dark surface.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<DocumentStatus, { cls: string; dot: string; pulse?: boolean }> = {
    PENDING_UPLOAD: {
      cls: "bg-yellow-500/10 text-yellow-300",
      dot: "bg-yellow-400",
    },
    UPLOAD_COMPLETED: {
      cls: "bg-[var(--accent)]/10 text-[var(--accent)]",
      dot: "bg-[var(--accent)]",
    },
    QUEUED: {
      cls: "bg-purple-500/10 text-purple-300",
      dot: "bg-purple-400",
    },
    PROCESSING: {
      cls: "bg-[var(--accent-2)]/10 text-[var(--accent-2)]",
      dot: "bg-[var(--accent-2)]",
      pulse: true,
    },
    COMPLETED: {
      cls: "bg-emerald-500/10 text-emerald-300",
      dot: "bg-emerald-400",
    },
    FAILED: {
      cls: "bg-red-500/10 text-red-300",
      dot: "bg-red-400",
    },
  };

  const labels: Record<DocumentStatus, string> = {
    PENDING_UPLOAD: "Pending upload",
    UPLOAD_COMPLETED: "Uploaded",
    QUEUED: "Queued",
    PROCESSING: "Processing",
    COMPLETED: "Ready",
    FAILED: "Failed",
  };

  const style = styles[status] ?? {
    cls: "bg-gray-500/10 text-gray-300",
    dot: "bg-gray-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wider ${style.cls}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${style.dot} ${style.pulse ? "animate-pulse" : ""}`}
      />
      {labels[status] ?? status}
    </span>
  );
}
