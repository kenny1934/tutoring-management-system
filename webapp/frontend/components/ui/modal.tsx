"use client";

import { useEffect, useCallback, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useDragControls, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { useOverlayLayer, type OverlayLayer } from "@/hooks/useOverlayLayer";
import { useBackToClose } from "@/hooks/useBackToClose";
import { useAsSheet } from "@/hooks/usePopoverSheet";
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
  /** Hold the modal open through backdrop clicks and Escape, for work in
   *  flight that must not be interrupted. Being stacked under another overlay
   *  is handled by the overlay stack and needs no help from this. */
  persistent?: boolean;
  className?: string;
  /** If false, renders without backdrop (for use in side-by-side layouts). Default: true */
  standalone?: boolean;
  /** For an owner that listens for keys itself and so needs to know when
   *  something is stacked over it. The owner joins the overlay stack (with
   *  `lockScroll`) and hands the layer in, and the modal uses that layer
   *  rather than joining a second time. A second entry would land just below
   *  the owner's, because a child's effects run first, and leave the modal
   *  never topmost. */
  layer?: OverlayLayer;
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
  layer,
}: ModalProps) {
  // Track if component is mounted (for SSR compatibility)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Stacked modals are separate portals, so only the shared stack can say
  // which one a keypress belongs to. It owns the body scroll lock as well:
  // an inner modal closing must not hand the page back while this one is
  // still open.
  const ownLayer = useOverlayLayer(isOpen && !layer, { lockScroll: true });
  const { isTopmost, zIndex } = layer ?? ownLayer;

  // On a phone, back closes the modal, unless it is holding itself open for
  // work in flight, as it does for Escape. A modal drawn inside a page, with
  // no backdrop, is part of the page and isn't closed by back.
  useBackToClose(isOpen && standalone, () => {
    if (!persistent) onClose();
  });

  // Escape belongs to the topmost modal alone.
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !persistent && isTopmost) {
        onClose();
      }
    },
    [onClose, persistent, isTopmost]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, handleEscape]);

  const handleBackdropClick = () => {
    // Only ever reachable on the topmost modal, but a stacked overlay that
    // paints its own backdrop short of full-screen shouldn't be able to leak
    // a click through to this one.
    if (!persistent && isTopmost) {
      onClose();
    }
  };

  // Unique per instance: two stacked modals would otherwise both claim the
  // id their aria-labelledby points at.
  const titleId = useId();

  // On a phone a standalone modal is a sheet that rises from the bottom, as
  // the detail popovers are, with a handle along its top. Pulling the header
  // or the handle down closes it, unless it is holding itself open.
  const asSheet = useAsSheet() && standalone;
  const dragControls = useDragControls();
  const [held, setHeld] = useState(false);
  const canPull = asSheet && !persistent;
  const grab = (event: React.PointerEvent) => {
    if (!canPull) return;
    setHeld(true);
    const release = () => {
      setHeld(false);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    dragControls.start(event);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) onClose();
  };

  // Don't render on server or before mount
  if (!mounted) return null;

  const modalContent = (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      initial={asSheet ? { y: "100%" } : { opacity: 0, scale: 0.95, y: 20 }}
      animate={asSheet ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
      exit={asSheet ? { y: "100%" } : { opacity: 0, scale: 0.95, y: 20 }}
      transition={asSheet ? { type: "spring", damping: 35, stiffness: 300 } : { duration: 0.2, ease: "easeOut" }}
      drag={canPull ? "y" : false}
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 1 }}
      dragTransition={{ bounceStiffness: 400, bounceDamping: 40 }}
      onDragEnd={onDragEnd}
      style={{
        width: "100%",
        maxWidth: asSheet ? undefined : size === "sm" ? "28rem" : size === "md" ? "32rem" : size === "lg" ? "42rem" : size === "xl" ? "56rem" : size === "2xl" ? "80rem" : "56rem",
      }}
      className={cn(
        "relative",
        "bg-paper",
        "border-2 border-line-strong",
        asSheet ? "rounded-t-2xl rounded-b-none border-x-0 border-b-0 shadow-2xl" : "rounded-lg shadow-2xl paper-texture",
        // In standalone mode, use max-h; in side-by-side, fill parent height.
        // dvh, not vh, so a phone's browser bar doesn't hide the bottom.
        standalone ? (asSheet ? "max-h-[92dvh]" : "max-h-[90dvh]") : "h-full",
        "flex flex-col",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {asSheet && (
        <div
          aria-hidden="true"
          className={cn("flex justify-center pt-3 pb-1 transition-colors", held && "bg-ink-strong/10", "rounded-t-2xl")}
          style={{ touchAction: canPull ? "none" : undefined }}
          onPointerDown={grab}
        >
          <div className={cn("h-1 rounded-full transition-all duration-150", held ? "w-14 bg-ink-subtle" : "w-10 bg-ink-subtle/40")} />
        </div>
      )}
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-line transition-colors",
          asSheet && "pt-1",
          held && "bg-ink-strong/10",
        )}
        style={{ touchAction: canPull ? "none" : undefined }}
        onPointerDown={grab}
      >
        <h2 id={titleId} className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 truncate min-w-0">
          {title}
        </h2>
        <button
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 p-2.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
          aria-label="Close modal"
        >
          <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {/* Body. overscroll-contain keeps a scroll that reaches the end from
          carrying on into the page behind. */}
      <div className={cn("flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 sm:py-4", asSheet && !footer && "pb-[calc(0.75rem+env(safe-area-inset-bottom))]")}>{children}</div>

      {/* Footer */}
      {footer && (
        <div className={cn("flex items-center px-4 py-2 sm:px-6 sm:py-3 border-t border-line bg-wash overflow-hidden", asSheet ? "pb-[calc(0.5rem+env(safe-area-inset-bottom))]" : "rounded-b-lg")}>
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
        <div
          style={{ zIndex }}
          className={cn(
            "fixed inset-0 md:left-[var(--sidebar-width,72px)] flex justify-center transition-[left] duration-350",
            asSheet ? "items-end" : "items-center p-4",
          )}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            // Dragging on the dim area mustn't scroll or bounce the page behind.
            style={{ touchAction: "none" }}
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
