import type { LucideIcon } from 'lucide-react';

/**
 * User roles in the system.
 * Hierarchy: Tutor < Admin < Super Admin
 * Note: Values match database column values exactly (case-sensitive)
 */
export type UserRole = 'Tutor' | 'Admin' | 'Super Admin';

/**
 * Context passed to visibility checks for user-specific logic.
 * Used to check session ownership for tutors.
 */
export interface VisibilityContext {
  userId?: number | null;
  effectiveRole?: string | null;
}

/**
 * Configuration for an action button.
 * This defines both the UI appearance and the API contract for an action.
 *
 * @template T - The type of entity this action operates on (e.g., Session, Enrollment)
 */
export interface ActionConfig<T = any> {
  /** Unique identifier for this action */
  id: string;

  // ============================================
  // UI Configuration
  // ============================================

  /** Full label for the action (used in tooltips and larger buttons) */
  label: string;

  /** Short label for compact views (e.g., "CW" instead of "Add Classwork") */
  shortLabel?: string;

  /** Lucide icon component to display */
  icon: LucideIcon;

  /** Tailwind classes for button styling (e.g., "bg-green-100 text-green-600") */
  colorClass: string;

  /** Optional override for icon color (e.g., for CW/HW colored icons) */
  iconColorClass?: string;

  // ============================================
  // Visibility & Permissions
  // ============================================

  /**
   * Function to determine if this action should be visible for a given item.
   * Return true to show the button, false to hide it.
   * Optional context provides user info for ownership checks.
   */
  isVisible: (item: T, ctx?: VisibilityContext) => boolean;

  /**
   * Which roles can see and use this action.
   * If user's role is not in this list, the button is hidden.
   */
  allowedRoles: UserRole[];

  // ============================================
  // API Contract (what this action WILL do)
  // ============================================

  api: {
    /**
     * Whether the API endpoint is implemented and ready.
     * - false: Button shows as disabled with "Coming soon" tooltip
     * - true: Button is clickable and will call the API
     */
    enabled: boolean;

    /** HTTP method for the API call */
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';

    /**
     * API endpoint template. Use {id} for the entity ID.
     * Example: '/api/sessions/{id}/status'
     */
    endpoint: string;

    /**
     * Function to build the request payload.
     * If not provided, no body is sent with the request.
     */
    getPayload?: (item: T) => Record<string, any>;
  };

  // ============================================
  // UI Behavior
  // ============================================

  /**
   * If set, show a confirmation dialog before executing the action.
   * The value is the message shown in the dialog.
   */
  confirmMessage?: string;

  /** Toast message to show on successful action completion */
  successMessage?: string;

  /** If true, this action (and all after it) are pushed to the right edge of the button row */
  pushRight?: boolean;
}

/**
 * Helper type for action button component props
 */
export interface ActionButtonsProps<T> {
  /** Array of action configurations */
  actions: ActionConfig<T>[];

  /** The entity item to render actions for */
  item: T;

  /** Button size variant */
  size?: 'sm' | 'md';

  /** Whether to show text labels alongside icons */
  showLabels?: boolean;

  /** Current user's role (used for permission filtering) */
  userRole?: UserRole;

  /** Callback when an action button is clicked */
  onAction?: (actionId: string, item: T) => void;

  /** Additional CSS classes for the container */
  className?: string;
}
