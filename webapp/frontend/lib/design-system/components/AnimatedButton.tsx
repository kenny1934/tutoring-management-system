"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import { buttonVariants } from "../animations/variants";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface AnimatedButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  /**
   * Button variant style
   * @default "primary"
   */
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  /**
   * Button size
   * @default "md"
   */
  size?: "sm" | "md" | "lg";
  /**
   * Loading state - shows spinner
   * @default false
   */
  loading?: boolean;
  /**
   * Disabled state
   * @default false
   */
  disabled?: boolean;
  /**
   * Full width button
   * @default false
   */
  fullWidth?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Button content
   */
  children?: React.ReactNode;
}

/**
 * Premium animated button with micro-interactions
 * Includes hover, tap, and loading states with smooth transitions
 */
export function AnimatedButton({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  className,
  children,
  ...props
}: AnimatedButtonProps) {
  const variantClasses = {
    primary:
      "bg-primary text-primary-foreground hover:bg-primary-hover shadow-md hover:shadow-lg",
    secondary:
      "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm",
    ghost:
      "bg-transparent text-foreground hover:bg-muted border border-border",
    destructive:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md",
  };

  const sizeClasses = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-base",
    lg: "h-12 px-6 text-lg",
  };

  const isDisabled = disabled || loading;

  return (
    <motion.button
      className={cn(
        "relative inline-flex items-center justify-center gap-2",
        "rounded-lg font-medium transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && "w-full",
        className
      )}
      variants={!isDisabled ? buttonVariants : undefined}
      initial="rest"
      whileHover={!isDisabled ? "hover" : undefined}
      whileTap={!isDisabled ? "tap" : undefined}
      disabled={isDisabled}
      {...props}
    >
      {loading && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2 }}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
        </motion.div>
      )}
      <span className={loading ? "opacity-70" : undefined}>{children}</span>
    </motion.button>
  );
}
