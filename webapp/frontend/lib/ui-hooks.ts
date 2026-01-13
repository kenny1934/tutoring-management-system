/**
 * UI state management hooks.
 * These hooks handle common UI patterns like dirty tracking, confirmations, etc.
 */

import { useState, useEffect, useCallback } from 'react';

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
