"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ActionConfig, ActionButtonsProps } from "@/lib/actions/types";
import type { Session } from "@/types";
import { sessionActions } from "@/lib/actions";
import { EditSessionModal } from "@/components/sessions/EditSessionModal";

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

  if (visibleActions.length === 0) return null;

  const handleClick = (
    e: React.MouseEvent,
    action: ActionConfig<Session>
  ) => {
    e.stopPropagation();

    // Special handling for edit action
    if (action.id === "edit") {
      setIsEditModalOpen(true);
      return;
    }

    if (!action.api.enabled) {
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
          // Edit action is always enabled (opens modal)
          const isEnabled = action.id === "edit" || action.api.enabled;
          const label = showLabels
            ? action.shortLabel || action.label
            : undefined;
          // Check if this action has active content (CW/HW assigned)
          const isActive = action.id === "cw" ? hasCW : action.id === "hw" ? hasHW : false;

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
                  : cn(action.colorClass, "cursor-not-allowed opacity-50"),
                isActive && "ring-1 ring-green-400 ring-offset-1"
              )}
              title={isEnabled ? action.label : "Coming soon"}
            >
              <Icon className={iconSizeClasses[size]} />
              {label && <span>{label}</span>}
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
    </>
  );
}
