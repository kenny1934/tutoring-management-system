"use client";

import { AlertTriangle, Download, Loader2 as Loader2Icon } from "lucide-react";
import {
  useFloating, useDismiss, useInteractions,
  FloatingOverlay, FloatingFocusManager, FloatingPortal,
} from "@floating-ui/react";
import { cn } from "@/lib/utils";

/**
 * Shared exit confirmation dialog, which warns about ink that leaving would
 * lose. The lesson views save ink to the server, so they only ask when some
 * pages haven't reached it yet, and pass unsentInk for that wording. The Zen
 * views keep ink in the tab only, and keep the original wording.
 */
export function ExitConfirmDialog({
  isOpen,
  isSaving,
  onCancel,
  onSaveAndExit,
  onExit,
  unsentInk = false,
}: {
  isOpen: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onSaveAndExit: () => void;
  onExit: () => void;
  unsentInk?: boolean;
}) {
  const copy = unsentInk
    ? {
        title: "Some ink isn't saved yet",
        message: "A few pages haven't reached the server, so leaving now could lose them. You can download all the ink first, or stay while it keeps trying.",
        exit: "Exit anyway",
        cancel: "Stay",
      }
    : {
        title: "Unsaved annotations",
        message: "You have annotations that haven't been saved. What would you like to do?",
        exit: "Exit without downloading",
        cancel: "Cancel",
      };
  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open && !isSaving) onCancel();
    },
  });
  const dismiss = useDismiss(context, { outsidePressEvent: "mousedown", enabled: !isSaving });
  const { getFloatingProps } = useInteractions([dismiss]);

  return (
    <FloatingPortal>
      <FloatingOverlay className="z-[10000] bg-black/50 flex items-center justify-center p-4" lockScroll>
        <FloatingFocusManager context={context}>
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            className={cn(
              "w-full min-w-[280px] max-w-[95vw] sm:max-w-sm bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg shadow-xl paper-texture",
              "border-2 border-[#d4a574] dark:border-[#8b6f47]"
            )}
          >
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <AlertTriangle className="h-6 w-6 text-orange-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {copy.title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {copy.message}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 px-4 py-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ebe0] dark:bg-[#251f15] rounded-b-lg">
              <button
                type="button"
                onClick={onSaveAndExit}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-md transition-colors bg-[#a0704b] text-white hover:bg-[#8b5d3b] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isSaving ? "Downloading..." : "Download all and exit"}
              </button>
              <button
                type="button"
                onClick={onExit}
                disabled={isSaving}
                className="w-full px-4 py-2 text-sm font-medium rounded-md transition-colors bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {copy.exit}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={isSaving}
                className="w-full px-4 py-2 text-sm font-medium rounded-md transition-colors text-gray-700 dark:text-gray-300 hover:bg-[#e8d4b8] dark:hover:bg-[#3d3018] disabled:opacity-50"
              >
                {copy.cancel}
              </button>
            </div>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
