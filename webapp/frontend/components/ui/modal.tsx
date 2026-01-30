"use client";

import { useEffect, useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "w-full max-w-md",
  md: "w-full max-w-lg",
  lg: "w-full max-w-2xl",
  xl: "w-full max-w-4xl",
  "2xl": "w-full max-w-7xl",
} as const;

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof sizeClasses;
  /** If true, clicking backdrop won't close the modal */
  persistent?: boolean;
  className?: string;
  /** If false, renders without backdrop (for use in side-by-side layouts). Default: true */
  standalone?: boolean;
}

/**
 * Reusable modal component with paper texture styling.
 * Features backdrop overlay, escape key close, and Framer Motion animations.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  persistent = false,
  className,
  standalone = true,
}: ModalProps) {
  // Track if component is mounted (for SSR compatibility)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !persistent) {
        onClose();
      }
    },
    [onClose, persistent]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleEscape]);

  const handleBackdropClick = () => {
    if (!persistent) {
      onClose();
    }
  };

  // Don't render on server or before mount
  if (!mounted) return null;

  const modalContent = (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={{
        width: "100%",
        maxWidth: size === "sm" ? "28rem" : size === "md" ? "32rem" : size === "lg" ? "42rem" : size === "xl" ? "56rem" : size === "2xl" ? "80rem" : "56rem",
      }}
      className={cn(
        "relative",
        "bg-[#fef9f3] dark:bg-[#2d2618]",
        "border-2 border-[#d4a574] dark:border-[#8b6f47]",
        "rounded-lg shadow-2xl",
        "paper-texture",
        // In standalone mode, use max-h; in side-by-side, fill parent height
        standalone ? "max-h-[90vh]" : "h-full",
        "flex flex-col",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Close modal"
        >
          <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">{children}</div>

      {/* Footer */}
      {footer && (
        <div className="flex items-center px-4 py-2 sm:px-6 sm:py-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ebe0] dark:bg-[#251f15] rounded-b-lg overflow-hidden">
          <div className="w-full">{footer}</div>
        </div>
      )}
    </motion.div>
  );

  // When not standalone (side-by-side mode), render without portal and backdrop
  if (!standalone) {
    return (
      <AnimatePresence>
        {isOpen && modalContent}
      </AnimatePresence>
    );
  }

  // Standard standalone mode with portal and backdrop
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleBackdropClick}
          />

          {/* Modal Content */}
          {modalContent}
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
