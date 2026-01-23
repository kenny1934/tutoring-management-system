"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { updateSessionInCache, removeSessionFromCache } from "@/lib/session-cache";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/contexts/ToastContext";
import type { ActionConfig, ActionButtonsProps } from "@/lib/actions/types";
import type { Session } from "@/types";
import { sessionActions } from "@/lib/actions";
import { sessionsAPI } from "@/lib/api";
import { EditSessionModal } from "@/components/sessions/EditSessionModal";
import { ExtensionRequestModal } from "@/components/sessions/ExtensionRequestModal";
import { ExerciseModal } from "@/components/sessions/ExerciseModal";
import { RateSessionModal } from "@/components/sessions/RateSessionModal";
import { ScheduleMakeupModal } from "@/components/sessions/ScheduleMakeupModal";

// Size configurations for buttons
const sizeClasses = {
  sm: "px-1 py-0.5 text-[8px]",
  md: "px-1.5 py-0.5 text-[10px]",
} as const;

const iconSizeClasses = {
  sm: "h-2.5 w-2.5",
  md: "h-3 w-3",
} as const;

/**
 * Generic action buttons component that renders action buttons from configuration.
 * Use this component to display consistent action buttons across all entity views.
 *
 * @example
 * // Session actions with labels
 * <ActionButtons
 *   actions={sessionActions}
 *   item={session}
 *   size="md"
 *   showLabels
 * />
 *
 * @example
 * // Compact session actions (icons only)
 * <ActionButtons
 *   actions={sessionActions}
 *   item={session}
 *   size="sm"
 * />
 */
export function ActionButtons<T>({
  actions,
  item,
  size = "md",
  showLabels = false,
  userRole,
  onAction,
  className,
}: ActionButtonsProps<T>) {
  // Filter actions by visibility and optionally by role
  const visibleActions = actions.filter((action) => {
    // Check visibility condition
    if (!action.isVisible(item)) return false;

    // Check role permission if userRole is provided
    if (userRole && !action.allowedRoles.includes(userRole)) return false;

    return true;
  });

  if (visibleActions.length === 0) return null;

  const handleClick = (
    e: React.MouseEvent,
    action: ActionConfig<T>
  ) => {
    e.stopPropagation(); // Prevent card click events

    if (!action.api.enabled) {
      // Action not yet implemented - could show a toast here
      return;
    }

    onAction?.(action.id, item);
  };

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} onClick={(e) => e.stopPropagation()}>
      {visibleActions.map((action) => {
        const Icon = action.icon;
        const isEnabled = action.api.enabled;
        const label = showLabels
          ? action.shortLabel || action.label
          : undefined;

        return (
          <button
            key={action.id}
            disabled={!isEnabled}
            onClick={(e) => handleClick(e, action)}
            className={cn(
              "flex items-center gap-1 rounded font-medium transition-all",
              sizeClasses[size],
              isEnabled
                ? cn(action.colorClass, "hover:opacity-90 hover:scale-[1.05] hover:shadow-sm active:scale-[0.95]")
                : cn(action.colorClass, "cursor-not-allowed opacity-50")
            )}
            title={isEnabled ? action.label : "Coming soon"}
          >
            <Icon className={iconSizeClasses[size]} />
            {label && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Session-specific action buttons with built-in modal handling.
 * Handles the Edit action by opening the EditSessionModal.
 */
interface SessionActionButtonsProps {
  session: Session;
  size?: "sm" | "md";
  showLabels?: boolean;
  userRole?: "tutor" | "admin" | "super_admin";
  currentTutorId?: number;  // For propose mode in ScheduleMakeupModal
  onAction?: (actionId: string, session: Session) => void;
  onLoadingChange?: (sessionId: number, isLoading: boolean, actionId?: string) => void;
  loadingActionId?: string | null;  // External loading state from parent (keyboard shortcuts)
  className?: string;
}

export function SessionActionButtons({
  session,
  size = "md",
  showLabels = false,
  userRole,
  currentTutorId,
  onAction,
  onLoadingChange,
  loadingActionId,
  className,
}: SessionActionButtonsProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [exerciseModalType, setExerciseModalType] = useState<"CW" | "HW" | null>(null);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [isMakeupModalOpen, setIsMakeupModalOpen] = useState(false);
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [confirmCancelMakeup, setConfirmCancelMakeup] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const { showToast } = useToast();

  // Combine internal loadingAction with external loadingActionId
  const effectiveLoadingAction = loadingActionId || loadingAction;

  // Filter actions by visibility and optionally by role
  const visibleActions = sessionActions.filter((action) => {
    if (!action.isVisible(session)) return false;
    if (userRole && !action.allowedRoles.includes(userRole)) return false;
    return true;
  });

  // Check if session has CW/HW exercises (for active indicator)
  const hasCW = session.exercises?.some(
    (ex) => ex.exercise_type === "Classwork" || ex.exercise_type === "CW"
  ) ?? false;
  const hasHW = session.exercises?.some(
    (ex) => ex.exercise_type === "Homework" || ex.exercise_type === "HW"
  ) ?? false;
  const hasRating = !!(session.performance_rating || session.notes);

  if (visibleActions.length === 0) return null;

  const handleClick = async (
    e: React.MouseEvent,
    action: ActionConfig<Session>
  ) => {
    e.stopPropagation();

    // Special handling for edit action
    if (action.id === "edit") {
      setIsEditModalOpen(true);
      return;
    }

    // Special handling for CW/HW actions - open exercise modal
    if (action.id === "cw") {
      setExerciseModalType("CW");
      return;
    }
    if (action.id === "hw") {
      setExerciseModalType("HW");
      return;
    }

    // Special handling for rate action - open rate modal
    if (action.id === "rate") {
      setIsRateModalOpen(true);
      return;
    }

    // Special handling for schedule-makeup action - open makeup modal
    if (action.id === "schedule-makeup") {
      setIsMakeupModalOpen(true);
      return;
    }

    // Special handling for request-extension action - open modal immediately (modal fetches data)
    if (action.id === "request-extension") {
      setIsExtensionModalOpen(true);
      return;
    }

    // Special handling for cancel-makeup action - show confirm dialog
    if (action.id === "cancel-makeup") {
      setConfirmCancelMakeup(true);
      return;
    }

    if (!action.api.enabled) {
      return;
    }

    // Handle "attended" action with API call
    if (action.id === "attended") {
      setLoadingAction("attended");
      onLoadingChange?.(session.id, true, "attended");
      try {
        const updatedSession = await sessionsAPI.markAttended(session.id);
        updateSessionInCache(updatedSession);
        showToast("Session marked as attended", "success");
        onAction?.("attended", updatedSession);
      } catch (error) {
        console.error("Failed to mark session as attended:", error);
        showToast("Failed to mark as attended", "error");
      } finally {
        setLoadingAction(null);
        onLoadingChange?.(session.id, false);
      }
      return;
    }

    // Handle "no-show" action with API call
    if (action.id === "no-show") {
      setLoadingAction("no-show");
      onLoadingChange?.(session.id, true, "no-show");
      try {
        const updatedSession = await sessionsAPI.markNoShow(session.id);
        updateSessionInCache(updatedSession);
        showToast("Session marked as no show", "success");
        onAction?.("no-show", updatedSession);
      } catch (error) {
        console.error("Failed to mark session as no show:", error);
        showToast("Failed to mark as no show", "error");
      } finally {
        setLoadingAction(null);
        onLoadingChange?.(session.id, false);
      }
      return;
    }

    // Handle "reschedule" action with API call
    if (action.id === "reschedule") {
      setLoadingAction("reschedule");
      onLoadingChange?.(session.id, true, "reschedule");
      try {
        const updatedSession = await sessionsAPI.markRescheduled(session.id);
        updateSessionInCache(updatedSession);
        showToast("Session marked as rescheduled", "success");
        onAction?.("reschedule", updatedSession);
      } catch (error) {
        console.error("Failed to mark session as rescheduled:", error);
        showToast("Failed to mark as rescheduled", "error");
      } finally {
        setLoadingAction(null);
        onLoadingChange?.(session.id, false);
      }
      return;
    }

    // Handle "sick-leave" action with API call
    if (action.id === "sick-leave") {
      setLoadingAction("sick-leave");
      onLoadingChange?.(session.id, true, "sick-leave");
      try {
        const updatedSession = await sessionsAPI.markSickLeave(session.id);
        updateSessionInCache(updatedSession);
        showToast("Session marked as sick leave", "success");
        onAction?.("sick-leave", updatedSession);
      } catch (error) {
        console.error("Failed to mark session as sick leave:", error);
        showToast("Failed to mark as sick leave", "error");
      } finally {
        setLoadingAction(null);
        onLoadingChange?.(session.id, false);
      }
      return;
    }

    // Handle "weather-cancelled" action with API call
    if (action.id === "weather-cancelled") {
      setLoadingAction("weather-cancelled");
      onLoadingChange?.(session.id, true, "weather-cancelled");
      try {
        const updatedSession = await sessionsAPI.markWeatherCancelled(session.id);
        updateSessionInCache(updatedSession);
        showToast("Session marked as weather cancelled", "success");
        onAction?.("weather-cancelled", updatedSession);
      } catch (error) {
        console.error("Failed to mark session as weather cancelled:", error);
        showToast("Failed to mark as weather cancelled", "error");
      } finally {
        setLoadingAction(null);
        onLoadingChange?.(session.id, false);
      }
      return;
    }

    // Handle "undo" action - show confirmation dialog
    if (action.id === "undo") {
      setConfirmUndo(true);
      return;
    }

    onAction?.(action.id, session);
  };

  const handleSave = (sessionId: number, updates: Partial<Session>) => {
    // Future: call API to save updates
    console.log("Session saved:", sessionId, updates);
    onAction?.("edit-saved", session);
  };

  const handleCancelMakeup = async () => {
    setLoadingAction("cancel-makeup");
    onLoadingChange?.(session.id, true, "cancel-makeup");

    try {
      // Determine which session ID to pass to API
      // For "Make-up Class" sessions, use own ID
      // For "Make-up Booked" sessions, use rescheduled_to_id
      const makeupSessionId = session.session_status === "Make-up Class"
        ? session.id
        : session.rescheduled_to_id;

      if (!makeupSessionId) {
        showToast("Cannot find linked make-up session", "error");
        return;
      }

      const originalSession = await sessionsAPI.cancelMakeup(makeupSessionId);

      // Update cache
      removeSessionFromCache(makeupSessionId);
      updateSessionInCache(originalSession);

      showToast("Make-up cancelled", "success");
      onAction?.("cancel-makeup", originalSession);
    } catch (error) {
      console.error("Failed to cancel make-up:", error);
      showToast("Failed to cancel make-up", "error");
    } finally {
      setLoadingAction(null);
      onLoadingChange?.(session.id, false);
    }
  };

  const handleUndo = async () => {
    setLoadingAction("undo");
    onLoadingChange?.(session.id, true, "undo");
    try {
      const updatedSession = await sessionsAPI.undoStatus(session.id);
      updateSessionInCache(updatedSession);

      if (updatedSession.undone_from_status) {
        const undoneFromStatus = updatedSession.undone_from_status;
        const sessionId = session.id;
        showToast(
          `Reverted to ${updatedSession.session_status}`,
          "success",
          {
            label: "Undo",
            onClick: async () => {
              try {
                const redoneSession = await sessionsAPI.redoStatus(sessionId, undoneFromStatus);
                updateSessionInCache(redoneSession);
                showToast("Status restored", "success");
              } catch (error) {
                console.error("Failed to redo status:", error);
                showToast("Failed to restore status", "error");
              }
            },
          }
        );
      } else {
        showToast("Status reverted", "success");
      }
      onAction?.("undo", updatedSession);
    } catch (error) {
      console.error("Failed to undo status:", error);
      showToast("Failed to undo status", "error");
    } finally {
      setLoadingAction(null);
      onLoadingChange?.(session.id, false);
    }
  };

  return (
    <>
      <div className={cn("flex flex-wrap gap-1.5", className)} onClick={(e) => e.stopPropagation()}>
        {visibleActions.map((action) => {
          const Icon = action.icon;
          // Edit, CW, HW, Rate, Schedule-makeup, Request-extension, Cancel-makeup actions are always enabled (open modals/dialogs)
          const isEnabled = ["edit", "cw", "hw", "rate", "schedule-makeup", "request-extension", "cancel-makeup", "undo"].includes(action.id) || action.api.enabled;
          const isLoading = effectiveLoadingAction === action.id;
          const label = showLabels
            ? action.shortLabel || action.label
            : undefined;
          // Check if this action has active content (CW/HW assigned, or rating/notes)
          const isActive = action.id === "cw" ? hasCW : action.id === "hw" ? hasHW : action.id === "rate" ? hasRating : false;

          return (
            <button
              key={action.id}
              disabled={!isEnabled || isLoading}
              onClick={(e) => handleClick(e, action)}
              className={cn(
                "flex items-center gap-1 rounded font-medium transition-all",
                sizeClasses[size],
                isEnabled && !isLoading
                  ? cn(action.colorClass, "hover:opacity-90 hover:scale-[1.05] hover:shadow-sm active:scale-[0.95]")
                  : cn(action.colorClass, "cursor-not-allowed opacity-50"),
                isActive && "ring-1 ring-green-400 ring-offset-1"
              )}
              title={isLoading ? "Processing..." : isEnabled ? action.label : "Coming soon"}
            >
              <Icon className={cn(iconSizeClasses[size], isLoading && "animate-pulse", action.iconColorClass)} />
              {label && <span>{isLoading ? "..." : label}</span>}
            </button>
          );
        })}
      </div>

      {/* Edit Session Modal */}
      <EditSessionModal
        session={session}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSave}
      />

      {/* Exercise Modal for CW/HW */}
      {exerciseModalType && (
        <ExerciseModal
          session={session}
          exerciseType={exerciseModalType}
          isOpen={true}
          onClose={() => setExerciseModalType(null)}
        />
      )}

      {/* Rate Session Modal */}
      <RateSessionModal
        session={session}
        isOpen={isRateModalOpen}
        onClose={() => setIsRateModalOpen(false)}
      />

      {/* Schedule Makeup Modal */}
      {isMakeupModalOpen && (
        <ScheduleMakeupModal
          session={session}
          isOpen={isMakeupModalOpen}
          onClose={() => setIsMakeupModalOpen(false)}
          proposerTutorId={currentTutorId}
        />
      )}

      {/* Extension Request Modal */}
      {isExtensionModalOpen && (currentTutorId || session.tutor_id) && (
        <ExtensionRequestModal
          session={session}
          isOpen={isExtensionModalOpen}
          onClose={() => setIsExtensionModalOpen(false)}
          onRequestSubmitted={() => {
            setIsExtensionModalOpen(false);
            showToast("Extension request submitted successfully", "success");
          }}
          tutorId={(currentTutorId || session.tutor_id)!}
          isProactive={true}
        />
      )}

      {/* Cancel Make-up Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmCancelMakeup}
        onConfirm={() => {
          setConfirmCancelMakeup(false);
          handleCancelMakeup();
        }}
        onCancel={() => setConfirmCancelMakeup(false)}
        title="Cancel Make-up Session"
        message="Cancel this make-up? The make-up session will be deleted and the original session will return to 'Pending Make-up' status."
        confirmText="Cancel Make-up"
        variant="danger"
        loading={loadingAction === "cancel-makeup"}
      />

      {/* Undo Status Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmUndo}
        onConfirm={() => {
          setConfirmUndo(false);
          handleUndo();
        }}
        onCancel={() => setConfirmUndo(false)}
        title="Undo Status Change"
        message={`Revert session status from "${session.session_status}" to "${session.previous_session_status}"?`}
        confirmText="Undo"
        variant="warning"
        loading={loadingAction === "undo"}
      />
    </>
  );
}
