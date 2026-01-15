import {
  CheckCircle2,
  UserX,
  CalendarClock,
  Ambulance,
  CloudRain,
  CalendarPlus,
  PenTool,
  Home,
  MessageSquarePlus,
  Undo2,
  Pencil,
} from 'lucide-react';
import type { Session } from '@/types';
import type { ActionConfig } from './types';

// ============================================
// VISIBILITY HELPERS
// Edit these functions to change when actions appear
// ============================================

/**
 * Sessions that haven't been attended yet.
 * These can be marked as Attended, No Show, or rescheduled.
 */
const isNotAttended = (s: Session): boolean =>
  ['Scheduled', 'Trial Class', 'Make-up Class'].includes(s.session_status);

/**
 * Sessions pending a make-up class to be scheduled.
 */
const isPendingMakeup = (s: Session): boolean =>
  s.session_status?.includes('Pending Make-up') ?? false;

/**
 * Sessions where CW/HW buttons should be hidden.
 * These are sessions that won't have classwork assigned.
 */
const hideCwHw = (s: Session): boolean =>
  s.session_status === 'Make-up Booked' || s.session_status === 'Cancelled';

/**
 * Sessions that can be undone (have a previous status to revert to).
 */
const canUndo = (s: Session): boolean =>
  !!s.previous_session_status;

// ============================================
// SESSION ACTIONS CONFIGURATION
// Add, remove, or modify actions here.
// Changes apply across all session views automatically.
// ============================================

export const sessionActions: ActionConfig<Session>[] = [
  // ----------------------------------------
  // Attendance Actions
  // ----------------------------------------
  {
    id: 'attended',
    label: 'Mark Attended (A)',
    shortLabel: 'Attended',
    icon: CheckCircle2,
    colorClass: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    isVisible: isNotAttended,
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: true,
      method: 'PATCH',
      endpoint: '/api/sessions/{id}/attended',
    },
    successMessage: 'Session marked as attended',
  },
  {
    id: 'no-show',
    label: 'Mark No Show (N)',
    shortLabel: 'No Show',
    icon: UserX,
    colorClass: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    isVisible: isNotAttended,
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: true,
      method: 'PATCH',
      endpoint: '/api/sessions/{id}/no-show',
    },
    successMessage: 'Session marked as no show',
  },

  // ----------------------------------------
  // Request Actions
  // ----------------------------------------
  {
    id: 'reschedule',
    label: 'Request Reschedule',
    shortLabel: 'Reschedule',
    icon: CalendarClock,
    colorClass: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    isVisible: isNotAttended,
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: true,
      method: 'PATCH',
      endpoint: '/api/sessions/{id}/reschedule',
    },
    successMessage: 'Session marked as rescheduled',
  },
  {
    id: 'sick-leave',
    label: 'Mark Sick Leave',
    shortLabel: 'Sick',
    icon: Ambulance,
    colorClass: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    isVisible: isNotAttended,
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: true,
      method: 'PATCH',
      endpoint: '/api/sessions/{id}/sick-leave',
    },
    successMessage: 'Session marked as sick leave',
  },
  {
    id: 'weather-cancelled',
    label: 'Weather Cancelled',
    shortLabel: 'Weather',
    icon: CloudRain,
    colorClass: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    isVisible: isNotAttended,
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: true,
      method: 'PATCH',
      endpoint: '/api/sessions/{id}/weather-cancelled',
    },
    successMessage: 'Session marked as weather cancelled',
  },

  // ----------------------------------------
  // Make-up Scheduling
  // ----------------------------------------
  {
    id: 'schedule-makeup',
    label: 'Schedule Make-up Class',
    shortLabel: 'Make-up',
    icon: CalendarPlus,
    colorClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    isVisible: isPendingMakeup,
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: true,
      method: 'POST',
      endpoint: '/api/sessions/{id}/schedule-makeup',
    },
  },

  // ----------------------------------------
  // Exercise Actions (CW/HW)
  // ----------------------------------------
  {
    id: 'cw',
    label: 'Add Classwork (C)',
    shortLabel: 'CW',
    icon: PenTool,
    colorClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    iconColorClass: 'text-red-500 dark:text-red-400',
    isVisible: (s) => !hideCwHw(s),
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: false,
      method: 'POST',
      endpoint: '/api/sessions/{id}/exercises',
      getPayload: () => ({ type: 'CW' }),
    },
  },
  {
    id: 'hw',
    label: 'Add Homework (H)',
    shortLabel: 'HW',
    icon: Home,
    colorClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    iconColorClass: 'text-blue-500 dark:text-blue-400',
    isVisible: (s) => !hideCwHw(s),
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: false,
      method: 'POST',
      endpoint: '/api/sessions/{id}/exercises',
      getPayload: () => ({ type: 'HW' }),
    },
  },

  // ----------------------------------------
  // Feedback Actions
  // ----------------------------------------
  {
    id: 'rate',
    label: 'Rate & Comment (R)',
    shortLabel: 'Rate',
    icon: MessageSquarePlus,
    colorClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    isVisible: () => true, // Always visible
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: false,
      method: 'POST',
      endpoint: '/api/sessions/{id}/rating',
    },
  },

  // ----------------------------------------
  // Undo Action
  // ----------------------------------------
  {
    id: 'undo',
    label: 'Undo Status Change',
    shortLabel: 'Undo',
    icon: Undo2,
    colorClass: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    isVisible: canUndo,
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: false,
      method: 'PATCH',
      endpoint: '/api/sessions/{id}/undo',
    },
    confirmMessage: 'Revert to previous status?',
  },

  // ----------------------------------------
  // Edit Action (always last)
  // ----------------------------------------
  {
    id: 'edit',
    label: 'Edit Session (E)',
    shortLabel: 'Edit',
    icon: Pencil,
    colorClass: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    isVisible: () => true,
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: true, // Handled specially - opens modal
      method: 'PATCH',
      endpoint: '/api/sessions/{id}',
    },
  },
];

/**
 * Get visible session actions for a given session.
 * Filters by visibility conditions only (not permissions).
 */
export const getVisibleSessionActions = (session: Session): ActionConfig<Session>[] =>
  sessionActions.filter((action) => action.isVisible(session));

/**
 * Get visible session actions filtered by user role.
 */
export const getSessionActionsForRole = (
  session: Session,
  userRole: string
): ActionConfig<Session>[] =>
  sessionActions.filter(
    (action) =>
      action.isVisible(session) &&
      action.allowedRoles.includes(userRole as any)
  );
