import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: "sm" | "md";
  showEmpty?: boolean;
  className?: string;
}

export function StarRating({
  rating,
  maxStars = 5,
  size = "sm",
  showEmpty = true,
  className,
}: StarRatingProps) {
  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
  };

  const stars = [];
  const clampedRating = Math.min(Math.max(0, rating), maxStars);

  for (let i = 0; i < maxStars; i++) {
    const isFilled = i < clampedRating;

    if (!showEmpty && !isFilled) continue;

    stars.push(
      <Star
        key={i}
        className={cn(
          sizeClasses[size],
          isFilled
            ? "fill-amber-400 text-amber-400"
            : "fill-none text-gray-300 dark:text-gray-600"
        )}
      />
    );
  }

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {stars}
    </div>
  );
}

// Helper to parse emoji stars to count
export function parseStarRating(rating: string | null | undefined): number {
  if (!rating) return 0;
  return (rating.split("⭐").length - 1);
}
