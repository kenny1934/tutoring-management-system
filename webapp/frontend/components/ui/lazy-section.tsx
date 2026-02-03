"use client";

import { useEffect, useRef, useState, ReactNode } from "react";

interface LazySectionProps {
  children: ReactNode;
  /** Placeholder shown while not visible */
  fallback?: ReactNode;
  /** Margin around root to trigger early (e.g., "100px") */
  rootMargin?: string;
  /** Keep rendered after first visibility (default: true) */
  keepMounted?: boolean;
  /** Class for the wrapper div */
  className?: string;
}

/**
 * LazySection - Defers rendering of children until they scroll into view.
 *
 * Uses IntersectionObserver to detect visibility and only renders children
 * when the section is about to become visible (controlled by rootMargin).
 *
 * @example
 * ```tsx
 * <LazySection fallback={<div className="h-64 shimmer-sepia rounded-lg" />}>
 *   <HeavyChart data={data} />
 * </LazySection>
 * ```
 */
export function LazySection({
  children,
  fallback = null,
  rootMargin = "100px",
  keepMounted = true,
  className,
}: LazySectionProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (keepMounted) observer.disconnect();
        } else if (!keepMounted) {
          setIsVisible(false);
        }
      },
      { rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin, keepMounted]);

  return (
    <div ref={ref} className={className}>
      {isVisible ? children : fallback}
    </div>
  );
}
