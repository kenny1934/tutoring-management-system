"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { updateSessionInCache } from "@/lib/session-cache";
import { useToast } from "@/contexts/ToastContext";
import type { ActionConfig, ActionButtonsProps } from "@/lib/actions/types";
import type { Session } from "@/types";
import { sessionActions } from "@/lib/actions";
import { sessionsAPI } from "@/lib/api";
import { EditSessionModal } from "@/components/sessions/EditSessionModal";
import { ExerciseModal } from "@/components/sessions/ExerciseModal";
import { RateSessionModal } from "@/components/sessions/RateSessionModal";

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
    <div className={cn("flex flex-wrap gap-1.5", className)}>
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
  onAction?: (actionId: string, session: Session) => void;
  className?: string;
}

export function SessionActionButtons({
  session,
  size = "md",
  showLabels = false,
  userRole,
  onAction,
  className,
}: SessionActionButtonsProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [exerciseModalType, setExerciseModalType] = useState<"CW" | "HW" | null>(null);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const { showToast } = useToast();

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

    if (!action.api.enabled) {
      return;
    }

    // Handle "attended" action with API call
    if (action.id === "attended") {
      setLoadingAction("attended");
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
      }
      return;
    }

    // Handle "no-show" action with API call
    if (action.id === "no-show") {
      setLoadingAction("no-show");
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
      }
      return;
    }

    // Handle "reschedule" action with API call
    if (action.id === "reschedule") {
      setLoadingAction("reschedule");
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
      }
      return;
    }

    // Handle "sick-leave" action with API call
    if (action.id === "sick-leave") {
      setLoadingAction("sick-leave");
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
      }
      return;
    }

    // Handle "weather-cancelled" action with API call
    if (action.id === "weather-cancelled") {
      setLoadingAction("weather-cancelled");
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
      }
      return;
    }

    onAction?.(action.id, session);
  };

  const handleSave = (sessionId: number, updates: Partial<Session>) => {
    // Future: call API to save updates
    console.log("Session saved:", sessionId, updates);
    onAction?.("edit-saved", session);
  };

  return (
    <>
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {visibleActions.map((action) => {
          const Icon = action.icon;
          // Edit, CW, HW, Rate actions are always enabled (open modals)
          const isEnabled = ["edit", "cw", "hw", "rate"].includes(action.id) || action.api.enabled;
          const isLoading = loadingAction === action.id;
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
    </>
  );
}
