import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface InputFieldProps extends ComponentProps<"input"> {
  label: string;
  icon?: ReactNode;
  error?: string;
  /** Element rendered to the right of the label (e.g. "Forgot password?" link) */
  labelAction?: ReactNode;
}

export function InputField({
  label,
  icon,
  error,
  labelAction,
  className,
  id,
  ...inputProps
}: InputFieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-[var(--text-secondary)]"
        >
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        {icon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)] pointer-events-none">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            "w-full bg-white/5 border rounded-lg py-3 pl-12 pr-5 text-sm outline-none transition-colors text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]",
            // No outline, no focus ring, no border color shift — focus is a
            // subtle background lift so the field reads as "active" quietly.
            "focus:outline-none focus:bg-white/10",
            error
              ? "border-red-500"
              : "border-white/10",
            className,
          )}
          {...inputProps}
        />
      </div>
      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-1.5 text-xs text-red-500"
        >
          {error}
        </p>
      )}
    </div>
  );
}
