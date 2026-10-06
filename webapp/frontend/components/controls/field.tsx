/**
 * Text fields, selects, textareas and their labels for CSM's staff pages.
 *
 * A field is 32px tall, the same as a button, with an edge in the `field`
 * colour, which clears the 3:1 an input's edge needs in both modes. Labels
 * sit above the field in 11px capitals. A hint or an error goes underneath,
 * and an error turns the edge red and is read out with the field.
 *
 * `Field` wires these together: give it the label and an id, and it connects
 * the label, the hint and the error to the control inside it.
 */
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type FieldSize = "sm" | "md";

const CONTROL =
  "w-full min-w-0 rounded border border-field bg-field-fill text-gray-900 dark:text-gray-100 " +
  "placeholder:text-gray-500 dark:placeholder:text-gray-400 " +
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-[invalid=true]:border-red-600 dark:aria-[invalid=true]:border-red-500";

const CONTROL_SIZES: Record<FieldSize, string> = {
  md: "h-8 px-2.5 text-sm",
  sm: "h-7 px-2 text-xs",
};

export const LABEL_CLASS = "block text-[11px] font-semibold uppercase tracking-wider text-ink-subtle";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn(LABEL_CLASS, "mb-1", className)} {...props} />;
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: FieldSize };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(CONTROL, CONTROL_SIZES[size], className)} {...props} />;
});

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: FieldSize };

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = "md", className, children, ...props },
  ref,
) {
  return (
    <div className="relative min-w-0">
      <select
        ref={ref}
        className={cn(CONTROL, CONTROL_SIZES[size], "appearance-none cursor-pointer pr-7", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle"
        aria-hidden="true"
      />
    </div>
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(CONTROL, "min-h-[72px] px-2.5 py-2 text-sm leading-relaxed", className)} {...props} />;
  },
);

export interface FieldProps {
  label: React.ReactNode;
  /** The id of the control inside, so the label points at it. */
  id: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
}

export function Field({ label, id, hint, error, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <Label htmlFor={id}>{label}</Label>
      {React.cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-ink-subtle">
          {hint}
        </p>
      )}
    </div>
  );
}
