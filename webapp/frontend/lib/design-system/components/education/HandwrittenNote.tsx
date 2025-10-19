"use client";

import { ReactNode, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface HandwrittenNoteProps {
  /**
   * Note content
   */
  children: ReactNode;

  /**
   * Handwriting style
   * @default "cursive"
   */
  font?: "cursive" | "print" | "marker" | "pencil";

  /**
   * Note color
   * @default "pencil"
   */
  color?: "pencil" | "bluePen" | "blackPen" | "redPen";

  /**
   * Rotation angle (degrees)
   * If not specified, uses slight random rotation
   */
  rotation?: number;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * HandwrittenNote - Handwritten-style annotation
 *
 * Creates authentic handwritten notes with various fonts and pen colors.
 * Use for tutor comments, margin notes, annotations, or personal touches.
 *
 * @example
 * ```tsx
 * <HandwrittenNote font="cursive" color="bluePen">
 *   Great work! Keep it up!
 * </HandwrittenNote>
 *
 * <HandwrittenNote font="print" color="pencil" rotation={-2}>
 *   Remember to show your work
 * </HandwrittenNote>
 * ```
 */
export function HandwrittenNote({
  children,
  font = "cursive",
  color = "pencil",
  rotation,
  className,
}: HandwrittenNoteProps) {
  // Generate random rotation on client side only (SSR-safe)
  const [randomRotation, setRandomRotation] = useState(0);

  useEffect(() => {
    if (rotation === undefined) {
      setRandomRotation(Math.random() * 4 - 2); // -2 to 2 degrees
    }
  }, [rotation]);

  const fontClass = {
    cursive: "font-handwriting-cursive",
    print: "font-handwriting-print",
    marker: "font-handwriting-marker",
    pencil: "font-handwriting-pencil",
  }[font];

  const colorClass = {
    pencil: "text-gray-600 dark:text-gray-400",
    bluePen: "text-blue-700 dark:text-blue-500",
    blackPen: "text-gray-900 dark:text-gray-200",
    redPen: "text-red-600 dark:text-red-500",
  }[color];

  const rotationValue = rotation !== undefined ? rotation : randomRotation;

  return (
    <span
      className={cn(
        "inline-block",
        fontClass,
        colorClass,
        className
      )}
      style={{
        transform: `rotate(${rotationValue}deg)`,
      }}
    >
      {children}
    </span>
  );
}

interface CircleAnnotationProps {
  /**
   * Content to circle
   */
  children: ReactNode;

  /**
   * Circle color
   * @default "red"
   */
  color?: "red" | "blue" | "green" | "orange";

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * CircleAnnotation - Circle drawn around content
 *
 * Creates hand-drawn circle annotation effect.
 *
 * @example
 * ```tsx
 * <CircleAnnotation color="red">
 *   Important point!
 * </CircleAnnotation>
 * ```
 */
export function CircleAnnotation({
  children,
  color = "red",
  className,
}: CircleAnnotationProps) {
  const colorClass = {
    red: "border-red-500",
    blue: "border-blue-500",
    green: "border-green-500",
    orange: "border-orange-500",
  }[color];

  return (
    <span
      className={cn(
        "inline-block relative px-2",
        className
      )}
    >
      {children}
      {/* Hand-drawn circle */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <ellipse
          cx="50"
          cy="50"
          rx="48"
          ry="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={cn(colorClass, "opacity-60")}
          style={{
            strokeDasharray: "1, 1",
            transform: "rotate(-3deg)",
            transformOrigin: "center",
          }}
        />
      </svg>
    </span>
  );
}

interface UnderlineAnnotationProps {
  /**
   * Content to underline
   */
  children: ReactNode;

  /**
   * Line style
   * @default "straight"
   */
  style?: "straight" | "wavy" | "double";

  /**
   * Line color
   * @default "red"
   */
  color?: "red" | "blue" | "green" | "orange";

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * UnderlineAnnotation - Hand-drawn underline
 *
 * Creates underline annotation with various styles.
 *
 * @example
 * ```tsx
 * <UnderlineAnnotation style="wavy" color="red">
 *   This needs review
 * </UnderlineAnnotation>
 * ```
 */
export function UnderlineAnnotation({
  children,
  style = "straight",
  color = "red",
  className,
}: UnderlineAnnotationProps) {
  const colorClass = {
    red: "text-red-500",
    blue: "text-blue-500",
    green: "text-green-500",
    orange: "text-orange-500",
  }[color];

  const underlineStyle = {
    straight: "decoration-solid",
    wavy: "decoration-wavy",
    double: "decoration-double",
  }[style];

  return (
    <span
      className={cn(
        "underline underline-offset-4 decoration-2",
        underlineStyle,
        colorClass,
        className
      )}
    >
      {children}
    </span>
  );
}
