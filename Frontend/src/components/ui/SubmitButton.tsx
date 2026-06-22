import type { ComponentProps } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { cn } from "../../lib/utils";

interface SubmitButtonProps extends ComponentProps<"button"> {
  isLoading?: boolean;
  label: string;
}

export function SubmitButton({
  isLoading = false,
  label,
  disabled,
  className,
  ...buttonProps
}: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled || isLoading}
      className={cn(
        "w-full font-semibold rounded-xl py-3 mt-6 transition-all flex items-center justify-center gap-2 group",
        "bg-[var(--text-primary)] text-[var(--bg-primary)]",
        isLoading && "opacity-70 cursor-not-allowed",
        !isLoading && "hover:opacity-90",
        className,
      )}
      {...buttonProps}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span>Please wait...</span>
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </>
      )}
    </button>
  );
}
