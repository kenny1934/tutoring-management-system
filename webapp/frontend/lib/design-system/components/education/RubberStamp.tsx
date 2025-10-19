"use client";

import { cn } from "@/lib/utils";

interface RubberStampProps {
  /**
   * Stamp text content
   */
  text: string;

  /**
   * Stamp type/shape
   * @default "rect"
   */
  type?: "rect" | "circle";

  /**
   * Stamp color
   * @default "red"
   */
  color?: "red" | "green" | "blue" | "orange" | "purple";

  /**
   * Custom rotation angle in degrees
   * If not provided, uses a slight random-looking rotation
   */
  rotation?: number;

  /**
   * Size
   * @default "md"
   */
  size?: "sm" | "md" | "lg";

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * RubberStamp - Display text with rubber stamp effect
 *
 * Creates authentic rubber stamp appearance with rotated, bordered text.
 * Use for metadata display (dates, grades), status indicators, or
 * official-looking markers.
 *
 * @example
 * ```tsx
 * <RubberStamp text="DUE: OCT 25" type="rect" color="red" />
 * <RubberStamp text="A+" type="circle" color="green" size="lg" />
 * <RubberStamp text="APPROVED" color="blue" />
 * ```
 */
export function RubberStamp({
  text,
  type = "rect",
  color = "red",
  rotation,
  size = "md",
  className,
}: RubberStampProps) {
  const colorClass = `rubber-stamp-${color}`;
  const shapeClass = type === "circle" ? "rubber-stamp-circle" : "rubber-stamp";

  const sizeStyles = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  }[size];

  const rotationStyle = rotation !== undefined ? { transform: `rotate(${rotation}deg)` } : undefined;

  return (
    <span
      className={cn(shapeClass, colorClass, sizeStyles, className)}
      style={rotationStyle}
    >
      {text}
    </span>
  );
}

/**
 * DateStamp - Convenience component for date stamps
 */
export function DateStamp({ date, label = "DUE" }: { date: string; label?: string }) {
  return <RubberStamp text={`${label}: ${date}`} type="rect" color="red" />;
}

/**
 * GradeStamp - Convenience component for grade stamps
 */
export function GradeStamp({ grade, size = "lg" }: { grade: string; size?: "sm" | "md" | "lg" }) {
  const color = grade.startsWith("A") ? "green" : grade.startsWith("B") ? "blue" : grade.startsWith("C") ? "orange" : "red";
  return <RubberStamp text={grade} type="circle" color={color} size={size} />;
}

/**
 * StatusStamp - Convenience component for status indicators
 */
export function StatusStamp({ status }: { status: "APPROVED" | "COMPLETED" | "LATE" | "MISSING" | "PENDING" }) {
  const colorMap = {
    APPROVED: "green" as const,
    COMPLETED: "green" as const,
    LATE: "orange" as const,
    MISSING: "red" as const,
    PENDING: "blue" as const,
  };

  return <RubberStamp text={status} type="rect" color={colorMap[status]} />;
}
