/**
 * UI state management hooks.
 * These hooks handle common UI patterns like dirty tracking, confirmations, etc.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for tracking form dirty state and showing close confirmation.
 * Handles:
 * - isDirty state tracking
 * - beforeunload warning for browser navigation
 * - Close attempt interception with confirmation dialog state
 *
 * @param isOpen - Whether the modal/form is currently open
 * @param onClose - Callback to actually close the modal/form
 */
export function useFormDirtyTracking(isOpen: boolean, onClose: () => void) {
  const [isDirty, setIsDirty] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsDirty(false);
      setShowCloseConfirm(false);
    }
  }, [isOpen]);

  // Warn user about unsaved changes before leaving page
  useEffect(() => {
    if (!isDirty || !isOpen) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, isOpen]);

  // Handle close attempts - show confirmation if dirty
  const handleCloseAttempt = useCallback(() => {
    if (isDirty) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // Confirm discard and close
  const confirmDiscard = useCallback(() => {
    setShowCloseConfirm(false);
    setIsDirty(false);
    onClose();
  }, [onClose]);

  // Cancel close attempt
  const cancelClose = useCallback(() => {
    setShowCloseConfirm(false);
  }, []);

  return {
    isDirty,
    setIsDirty,
    showCloseConfirm,
    setShowCloseConfirm,
    handleCloseAttempt,
    confirmDiscard,
    cancelClose,
  };
}

/**
 * Hook for handling delete confirmation pattern.
 * Shows inline confirmation before deleting items.
 *
 * @param onDelete - Callback to perform actual deletion
 */
export function useDeleteConfirmation(onDelete: (index: number) => void) {
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  // Request deletion (first click - shows confirmation)
  const requestDelete = useCallback((index: number) => {
    setPendingIndex(index);
  }, []);

  // Confirm deletion (second click)
  const confirmDelete = useCallback(() => {
    if (pendingIndex !== null) {
      onDelete(pendingIndex);
      setPendingIndex(null);
    }
  }, [pendingIndex, onDelete]);

  // Cancel deletion
  const cancelDelete = useCallback(() => {
    setPendingIndex(null);
  }, []);

  // Check if a specific index is pending confirmation
  const isPending = useCallback((index: number) => pendingIndex === index, [pendingIndex]);

  return {
    pendingIndex,
    requestDelete,
    confirmDelete,
    cancelDelete,
    isPending,
  };
}

// ============================================================================
// File Action Hooks
// ============================================================================

import { openFileFromPathWithFallback, printFileFromPathWithFallback, PrintStampInfo } from "./file-system";
import { searchPaperlessByPath } from "./paperless-utils";

/**
 * State for file open/print operations per exercise (keyed by clientId).
 */
export type FileActionState = Record<string, { open?: 'loading' | 'error'; print?: 'loading' | 'error' }>;

/**
 * Minimal interface for exercise with page info needed for printing.
 */
interface ExerciseWithPages {
  clientId: string;
  pdf_name: string;
  page_start: string;
  page_end: string;
  complex_pages: string;
}

/**
 * Hook for handling file open and print operations with loading/error states.
 * Manages per-exercise state keyed by clientId to avoid race conditions.
 *
 * @param buildStampInfo - Optional function to generate print stamp (for ExerciseModal)
 */
export function useFileActions(buildStampInfo?: () => PrintStampInfo) {
  const [fileActionState, setFileActionState] = useState<FileActionState>({});
  // Ref for synchronous guard checks to prevent race conditions on rapid clicks
  const loadingRef = useRef<Set<string>>(new Set());

  const handleOpenFile = useCallback(async (clientId: string, path: string) => {
    const loadingKey = `open-${clientId}`;
    if (!path || loadingRef.current.has(loadingKey)) return;

    loadingRef.current.add(loadingKey);
    setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], open: 'loading' } }));

    try {
      const error = await openFileFromPathWithFallback(path, searchPaperlessByPath);

      if (error) {
        setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], open: 'error' } }));
        setTimeout(() => setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], open: undefined } })), 2000);
      } else {
        setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], open: undefined } }));
      }
    } finally {
      loadingRef.current.delete(loadingKey);
    }
  }, []);

  const handlePrintFile = useCallback(async (exercise: ExerciseWithPages) => {
    const { clientId, pdf_name: path } = exercise;
    const loadingKey = `print-${clientId}`;
    if (!path || loadingRef.current.has(loadingKey)) return;

    loadingRef.current.add(loadingKey);
    const pageStart = exercise.page_start ? parseInt(exercise.page_start, 10) : undefined;
    const pageEnd = exercise.page_end ? parseInt(exercise.page_end, 10) : undefined;
    const complexRange = exercise.complex_pages?.trim() || undefined;
    const stamp = buildStampInfo?.();

    setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], print: 'loading' } }));

    try {
      const error = await printFileFromPathWithFallback(path, pageStart, pageEnd, complexRange, stamp, searchPaperlessByPath);

      if (error) {
        setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], print: 'error' } }));
        setTimeout(() => setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], print: undefined } })), 2000);
      } else {
        setFileActionState(prev => ({ ...prev, [clientId]: { ...prev[clientId], print: undefined } }));
      }
    } finally {
      loadingRef.current.delete(loadingKey);
    }
  }, [buildStampInfo]);

  return { fileActionState, handleOpenFile, handlePrintFile };
}

// ============================================================================
// Floating UI Hooks
// ============================================================================

import {
  useFloating,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useInteractions,
  Placement,
} from "@floating-ui/react";

/**
 * Hook for standard dropdown behavior with Floating UI.
 * Handles click to toggle, dismiss on outside click/escape, and positioning.
 *
 * @param isOpen - Whether the dropdown is currently open
 * @param onOpenChange - Callback when open state should change
 * @param placement - Where to position the dropdown (default: "bottom-start")
 */
export function useDropdown(
  isOpen: boolean,
  onOpenChange: (open: boolean) => void,
  placement: Placement = "bottom-start"
) {
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange,
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: "end" }),
      shift({ padding: 8 }),
    ],
    placement,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  return { refs, floatingStyles, getReferenceProps, getFloatingProps };
}
