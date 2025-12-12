"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: "sm" | "md" | "lg";
  showEmpty?: boolean;
  className?: string;
  /** If provided, makes the rating interactive/editable */
  onChange?: (rating: number) => void;
}

export function StarRating({
  rating,
  maxStars = 5,
  size = "sm",
  showEmpty = true,
  className,
  onChange,
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-6 w-6",
  };

  const isInteractive = !!onChange;
  const displayRating = hoverRating ?? rating;
  const clampedRating = Math.min(Math.max(0, displayRating), maxStars);

  const handleClick = (starIndex: number) => {
    if (onChange) {
      // If clicking the same star that's already selected, clear to 0
      // Otherwise set to the clicked star
      const newRating = starIndex + 1 === rating ? 0 : starIndex + 1;
      onChange(newRating);
    }
  };

  const stars = [];

  for (let i = 0; i < maxStars; i++) {
    const isFilled = i < clampedRating;

    if (!showEmpty && !isFilled && !isInteractive) continue;

    const starElement = (
      <Star
        key={i}
        className={cn(
          sizeClasses[size],
          isFilled
            ? "fill-amber-400 text-amber-400"
            : "fill-none text-gray-300 dark:text-gray-600",
          isInteractive && "transition-colors"
        )}
      />
    );

    if (isInteractive) {
      stars.push(
        <button
          key={i}
          type="button"
          onClick={() => handleClick(i)}
          onMouseEnter={() => setHoverRating(i + 1)}
          onMouseLeave={() => setHoverRating(null)}
          className="p-0.5 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 rounded"
        >
          {starElement}
        </button>
      );
    } else {
      stars.push(starElement);
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-0.5",
        isInteractive && "cursor-pointer",
        className
      )}
      role={isInteractive ? "radiogroup" : undefined}
      aria-label={isInteractive ? "Rating" : undefined}
    >
      {stars}
    </div>
  );
}

// Helper to parse emoji stars to count
export function parseStarRating(rating: string | null | undefined): number {
  if (!rating) return 0;
  return (rating.split("⭐").length - 1);
}
