"use client";

import { motion } from "framer-motion";
import { Star, Trophy, Award, Smile, ThumbsUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface StickerBadgeProps {
  /**
   * Sticker type/shape
   * @default "star"
   */
  type?: "star" | "trophy" | "ribbon" | "smiley" | "thumbsUp" | "sparkle";

  /**
   * Label text
   */
  label?: string;

  /**
   * Whether to show shiny foil effect
   * @default true
   */
  shiny?: boolean;

  /**
   * Size
   * @default "md"
   */
  size?: "sm" | "md" | "lg";

  /**
   * Color variant
   * @default "gold"
   */
  color?: "gold" | "silver" | "rainbow";

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * StickerBadge - Glossy achievement sticker
 *
 * Creates teacher-style reward stickers with glossy finish and peel effect.
 * Use for achievements, milestones, encouragement, or gamification.
 *
 * @example
 * ```tsx
 * <StickerBadge type="star" label="Great Work!" shiny />
 * <StickerBadge type="trophy" label="Top Score!" color="gold" size="lg" />
 * ```
 */
export function StickerBadge({
  type = "star",
  label,
  shiny = true,
  size = "md",
  color = "gold",
  className,
}: StickerBadgeProps) {
  const Icon = {
    star: Star,
    trophy: Trophy,
    ribbon: Award,
    smiley: Smile,
    thumbsUp: ThumbsUp,
    sparkle: Sparkles,
  }[type];

  const sizeStyles = {
    sm: { container: "w-16 h-16 text-xs", icon: "h-6 w-6" },
    md: { container: "w-24 h-24 text-sm", icon: "h-10 w-10" },
    lg: { container: "w-32 h-32 text-base", icon: "h-14 w-14" },
  }[size];

  const colorStyles = {
    gold: {
      bg: "bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500",
      text: "text-amber-900",
      border: "border-yellow-400/50",
      shine: "from-white/60 via-yellow-200/40 to-transparent",
    },
    silver: {
      bg: "bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400",
      text: "text-gray-800",
      border: "border-gray-300/50",
      shine: "from-white/60 via-gray-200/40 to-transparent",
    },
    rainbow: {
      bg: "bg-gradient-to-br from-pink-400 via-purple-400 to-blue-400",
      text: "text-white",
      border: "border-purple-400/50",
      shine: "from-white/60 via-pink-200/40 to-transparent",
    },
  }[color];

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 15,
        delay: 0.1,
      }}
      whileHover={{ scale: 1.1, rotate: 5 }}
      className={cn("relative inline-block", className)}
    >
      {/* Sticker */}
      <div
        className={cn(
          "relative rounded-full flex flex-col items-center justify-center gap-1",
          "border-4 shadow-lg",
          sizeStyles.container,
          colorStyles.bg,
          colorStyles.text,
          colorStyles.border
        )}
      >
        {/* Shiny foil effect */}
        {shiny && (
          <div
            className={cn(
              "absolute inset-0 rounded-full opacity-50",
              "bg-gradient-to-tr",
              colorStyles.shine
            )}
          />
        )}

        {/* Icon */}
        <Icon className={cn(sizeStyles.icon, "relative z-10")} strokeWidth={2.5} />

        {/* Label */}
        {label && (
          <span className="relative z-10 font-bold px-1 text-center leading-tight">
            {label}
          </span>
        )}

        {/* Gloss highlight */}
        <div className="absolute top-2 right-2 w-4 h-4 bg-white/70 rounded-full blur-sm" />
      </div>

      {/* Peel shadow effect */}
      <div
        className="absolute bottom-0 right-0 w-6 h-6 bg-black/10 rounded-tl-full"
        style={{ transform: "translate(25%, 25%)" }}
      />
    </motion.div>
  );
}

/**
 * StickerGrid - Display multiple stickers in a grid
 *
 * @example
 * ```tsx
 * <StickerGrid>
 *   <StickerBadge type="star" label="A+" />
 *   <StickerBadge type="trophy" label="Winner" />
 *   <StickerBadge type="smiley" label="Great!" />
 * </StickerGrid>
 * ```
 */
export function StickerGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-4 items-center justify-center p-4">
      {children}
    </div>
  );
}
