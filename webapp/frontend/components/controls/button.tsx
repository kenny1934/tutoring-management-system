/**
 * Buttons for CSM's staff pages.
 *
 * There are four kinds, and a screen should use them in this order of
 * frequency: quiet and secondary for most things, one primary for the action
 * the person came to take, and danger only on the button that confirms
 * something that can't be undone. A button that sets a session status is a
 * secondary button whose icon takes that status's colour, so the bulk bar
 * stays calm but still tells Attended from No show at a glance.
 *
 * Buttons are 32px tall, the same as a text field, so a row of fields and
 * buttons lines up. The small size is 28px, for toolbars and bulk bars.
 *
 * The public summer and regular pages import `components/ui/button`, which
 * keeps its own look. These are separate on purpose.
 */
import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center whitespace-nowrap rounded font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-paper " +
  "disabled:pointer-events-none disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
  md: "h-8 gap-1.5 px-3 text-sm",
  sm: "h-7 gap-1 px-2.5 text-xs",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-line-strong bg-field-fill text-gray-800 dark:text-gray-200 hover:bg-tint",
  quiet: "text-gray-700 dark:text-gray-300 hover:bg-tint",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

// On a plain button the icon is the quiet part, so the label leads. On a
// filled one it takes the label's colour.
const ICON_COLOURS: Record<ButtonVariant, string> = {
  primary: "",
  secondary: "text-ink-subtle",
  quiet: "text-ink-subtle",
  danger: "",
};

const ICON_SIZES: Record<ButtonSize, string> = { md: "h-4 w-4", sm: "h-3.5 w-3.5" };

/**
 * The classes for a button, for an element that has to stay something else,
 * such as a Next `Link` styled as a button.
 */
export function buttonClasses({ variant = "secondary", size = "md" }: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
  return cn(BASE, SIZES[size], VARIANTS[variant]);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** An icon before the label. */
  icon?: LucideIcon;
  /** Colours the icon, for a button that sets a status. */
  iconClassName?: string;
  /** Shows a spinner in place of the icon and disables the button. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, iconClassName, loading = false, className, children, disabled, type = "button", ...props },
  ref,
) {
  const iconClass = cn(ICON_SIZES[size], "flex-shrink-0", ICON_COLOURS[variant], iconClassName);
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size }), className)}
      {...props}
    >
      {loading ? (
        <Loader2 className={cn(iconClass, "animate-spin")} aria-hidden="true" />
      ) : (
        Icon && <Icon className={iconClass} aria-hidden="true" />
      )}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** What the button does, read out by screen readers and shown on hover. */
  label: string;
  icon: LucideIcon;
  size?: ButtonSize;
  /** Danger turns the button red under the pointer, for delete and remove. */
  tone?: "default" | "danger";
  iconClassName?: string;
}

const ICON_BUTTON_SIZES: Record<ButtonSize, string> = { md: "h-8 w-8", sm: "h-7 w-7" };
const ICON_BUTTON_TONES = {
  default: "hover:bg-tint hover:text-gray-900 dark:hover:text-gray-100",
  danger: "hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30 dark:hover:text-red-400",
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon: Icon, size = "md", tone = "default", iconClassName, className, type = "button", title, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cn(
        "inline-flex flex-shrink-0 items-center justify-center rounded text-ink-subtle transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        "disabled:pointer-events-none disabled:opacity-50",
        ICON_BUTTON_SIZES[size],
        ICON_BUTTON_TONES[tone],
        className,
      )}
      {...props}
    >
      <Icon className={cn(ICON_SIZES[size], iconClassName)} aria-hidden="true" />
    </button>
  );
});
