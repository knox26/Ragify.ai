type StatusBadgeProps = {
  status: "READY" | "PROCESSING" | "FAILED";
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles = {
    READY: "bg-emerald-500/10 text-emerald-500",
    PROCESSING: "bg-yellow-500/10 text-yellow-500",
    FAILED: "bg-red-500/10 text-red-500",
  };

  const labels = {
    READY: "Ready",
    PROCESSING: "Processing",
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
        ${styles[status]}
      `}
    >
      ● {labels[status]}
    </span>
  );
}
