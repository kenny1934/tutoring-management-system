import {
  CheckCircle2,
  UserX,
  CalendarClock,
  Ambulance,
  CalendarPlus,
  PenTool,
  Home,
  MessageSquarePlus,
  Pencil,
  Undo2,
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
    label: 'Mark Attended',
    shortLabel: 'Attended',
    icon: CheckCircle2,
    colorClass: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    isVisible: isNotAttended,
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: false, // Set to true when API is ready
      method: 'PATCH',
      endpoint: '/api/sessions/{id}/status',
      getPayload: () => ({ status: 'Attended' }),
    },
    successMessage: 'Session marked as attended',
  },
  {
    id: 'no-show',
    label: 'Mark No Show',
    shortLabel: 'No Show',
    icon: UserX,
    colorClass: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    isVisible: isNotAttended,
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: false,
      method: 'PATCH',
      endpoint: '/api/sessions/{id}/status',
      getPayload: () => ({ status: 'No Show' }),
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
    colorClass: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    isVisible: isNotAttended,
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: false,
      method: 'POST',
      endpoint: '/api/sessions/{id}/reschedule-request',
    },
    confirmMessage: 'Request to reschedule this session?',
  },
  {
    id: 'sick-leave',
    label: 'Request Sick Leave',
    shortLabel: 'Sick',
    icon: Ambulance,
    colorClass: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    isVisible: isNotAttended,
    allowedRoles: ['tutor', 'admin', 'super_admin'],
    api: {
      enabled: false,
      method: 'POST',
      endpoint: '/api/sessions/{id}/sick-leave',
    },
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
      enabled: false,
      method: 'POST',
      endpoint: '/api/sessions/{id}/schedule-makeup',
    },
  },

  // ----------------------------------------
  // Exercise Actions (CW/HW)
  // ----------------------------------------
  {
    id: 'cw',
    label: 'Add Classwork',
    shortLabel: 'CW',
    icon: PenTool,
    colorClass: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
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
    label: 'Add Homework',
    shortLabel: 'HW',
    icon: Home,
    colorClass: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
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
    label: 'Rate & Comment',
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
  // Edit Action (Admin only)
  // ----------------------------------------
  {
    id: 'edit',
    label: 'Edit Session',
    shortLabel: 'Edit',
    icon: Pencil,
    colorClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
    isVisible: () => true, // Always visible (permission controls access)
    allowedRoles: ['admin', 'super_admin'], // Only admins can edit
    api: {
      enabled: false,
      method: 'PUT',
      endpoint: '/api/sessions/{id}',
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
