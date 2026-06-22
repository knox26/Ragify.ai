import type { ReactNode } from "react";
import { AlertCircle, CheckCircle, Info, X } from "lucide-react";
import { cn } from "../../lib/utils";

type AlertVariant = "error" | "success" | "info";

interface AlertProps {
  variant?: AlertVariant;
  message: string | null;
  onDismiss?: () => void;
  className?: string;
}

const variantStyles: Record<
  AlertVariant,
  { icon: ReactNode; bg: string; text: string }
> = {
  error: {
    icon: <AlertCircle className="w-4 h-4 shrink-0" />,
    bg: "bg-red-500/10 border-red-500/30",
    text: "text-red-600 dark:text-red-400",
  },
  success: {
    icon: <CheckCircle className="w-4 h-4 shrink-0" />,
    bg: "bg-green-500/10 border-green-500/30",
    text: "text-green-600 dark:text-green-400",
  },
  info: {
    icon: <Info className="w-4 h-4 shrink-0" />,
    bg: "bg-blue-500/10 border-blue-500/30",
    text: "text-blue-600 dark:text-blue-400",
  },
};

export function Alert({
  variant = "error",
  message,
  onDismiss,
  className,
}: AlertProps) {
  if (!message) return null;

  const style = variantStyles[variant];

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
        style.bg,
        style.text,
        className,
      )}
    >
      {style.icon}
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
