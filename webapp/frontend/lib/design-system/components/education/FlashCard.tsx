"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode, useState } from "react";

interface FlashCardProps {
  /** Content to display on the front of the card */
  front: ReactNode;
  /** Content to display on the back of the card */
  back: ReactNode;
  /** Width of the card */
  width?: string;
  /** Height of the card */
  height?: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether the card starts flipped */
  initialFlipped?: boolean;
}

/**
 * FlashCard - An interactive 3D flip card component
 *
 * Features:
 * - 3D flip animation with perspective
 * - Realistic cardstock texture
 * - Click or tap to flip
 * - Smooth spring-based transitions
 * - Rounded corners with paper texture
 * - Shadow depth that changes on flip
 *
 * Perfect for:
 * - Vocabulary learning
 * - Q&A review
 * - Concept definitions
 * - Memory games
 *
 * @example
 * ```tsx
 * <FlashCard
 *   front={<div className="text-2xl font-bold">What is React?</div>}
 *   back={<div className="text-base">A JavaScript library for building UIs</div>}
 * />
 * ```
 */
export function FlashCard({
  front,
  back,
  width = "20rem",
  height = "12rem",
  className,
  initialFlipped = false,
}: FlashCardProps) {
  const [isFlipped, setIsFlipped] = useState(initialFlipped);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  return (
    <div
      className={cn("cursor-pointer", className)}
      style={{
        perspective: "1000px",
        width,
        height,
      }}
      onClick={handleFlip}
    >
      <motion.div
        className="relative w-full h-full"
        style={{
          transformStyle: "preserve-3d",
        }}
        animate={{
          rotateY: isFlipped ? 180 : 0,
        }}
        transition={{
          duration: 0.6,
          type: "spring",
          stiffness: 100,
          damping: 15,
        }}
      >
        {/* Front of card */}
        <div
          className={cn(
            "absolute inset-0",
            "paper-white paper-texture paper-shadow-md",
            "rounded-lg",
            "flex items-center justify-center p-6",
            "backface-hidden"
          )}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <div className="text-center w-full h-full flex items-center justify-center">
            {front}
          </div>
          {/* Corner fold indicator */}
          <div
            className="absolute top-2 right-2 w-8 h-8 pointer-events-none"
            style={{
              background: "linear-gradient(135deg, transparent 0%, rgba(0,0,0,0.05) 100%)",
              clipPath: "polygon(100% 0, 100% 100%, 0 0)",
            }}
          />
        </div>

        {/* Back of card */}
        <div
          className={cn(
            "absolute inset-0",
            "paper-cream paper-texture paper-shadow-md",
            "rounded-lg",
            "flex items-center justify-center p-6",
            "backface-hidden"
          )}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="text-center w-full h-full flex items-center justify-center">
            {back}
          </div>
          {/* Corner fold indicator */}
          <div
            className="absolute top-2 right-2 w-8 h-8 pointer-events-none"
            style={{
              background: "linear-gradient(135deg, transparent 0%, rgba(0,0,0,0.05) 100%)",
              clipPath: "polygon(100% 0, 100% 100%, 0 0)",
            }}
          />
        </div>
      </motion.div>

      {/* Instruction hint */}
      <div className="text-center mt-2 text-xs text-muted-foreground">
        {isFlipped ? "Click to see question" : "Click to reveal answer"}
      </div>
    </div>
  );
}
