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
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)] pointer-events-none">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            "w-full bg-[var(--bg-card)] border rounded-xl py-3 pl-10 pr-4 text-sm outline-none transition-colors text-[var(--text-primary)]",
            "focus:border-[var(--accent)]",
            error
              ? "border-red-500 focus:border-red-500"
              : "border-[var(--border-color)]",
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
