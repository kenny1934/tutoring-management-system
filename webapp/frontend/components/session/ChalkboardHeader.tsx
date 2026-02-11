"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  HandCoins,
  Info,
  GraduationCap,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Presentation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSessionStatusConfig, getDisplayStatus } from "@/lib/session-status";
import { sessionActions } from "@/lib/actions";
import { useTutors } from "@/lib/hooks";
import { sessionsAPI, extensionRequestsAPI } from "@/lib/api";
import { updateSessionInCache, removeSessionFromCache } from "@/lib/session-cache";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Session, ExtensionRequestDetail } from "@/types";
import type { ActionConfig } from "@/lib/actions/types";
import { ExerciseModal } from "@/components/sessions/ExerciseModal";
import { RateSessionModal } from "@/components/sessions/RateSessionModal";
import { ScheduleMakeupModal } from "@/components/sessions/ScheduleMakeupModal";
import { ExtensionRequestModal } from "@/components/sessions/ExtensionRequestModal";
import { ExtensionRequestReviewModal } from "@/components/admin/ExtensionRequestReviewModal";
import { SessionStatusTag } from "@/components/ui/session-status-tag";

// Muted dusty chalk palette (top-down view colors)
const CHALK_PALETTE = {
  white: { base: "#f0ebe5", highlight: "#faf8f5", shadow: "#d8d0c8" },
  green: { base: "#9cb89c", highlight: "#b8d4b8", shadow: "#7a9a7a" },
  red: { base: "#d4a0a0", highlight: "#ecc8c8", shadow: "#b87878" },
  yellow: { base: "#dcc890", highlight: "#f0e0b0", shadow: "#c4a868" },
  orange: { base: "#d4a878", highlight: "#ecc8a0", shadow: "#b88850" },
  blue: { base: "#a0b8d0", highlight: "#c0d4e8", shadow: "#7898b8" },
};

// Map actions to chalk colors
const ACTION_TO_COLOR: Record<string, keyof typeof CHALK_PALETTE> = {
  edit: "white",
  attended: "green",
  "schedule-makeup": "green",
  "request-extension": "blue",
  "cancel-makeup": "red",
  "no-show": "red",
  "sick-leave": "orange",
  "weather-cancelled": "orange",
  cw: "yellow",
  hw: "yellow",
  rate: "yellow",
  reschedule: "orange",
  undo: "blue",
};

interface ChalkStubProps {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  colors: typeof CHALK_PALETTE.white;
  onClick: () => void;
  disabled?: boolean;
  index: number;
  active?: boolean;  // Indicates content exists (e.g., CW/HW assigned)
  loading?: boolean; // Shows processing animation
  iconColor?: string; // Optional override for icon color (e.g., red for CW, blue for HW)
}

function ChalkStub({ id, label, shortLabel, icon: Icon, colors, onClick, disabled, index, active, loading, iconColor }: ChalkStubProps) {
  const isDisabled = disabled || loading;
  return (
    <motion.button
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.5 + index * 0.03,
        duration: 0.25,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      whileHover={!isDisabled ? {
        y: -3,
        scale: 1.08,
        transition: { duration: 0.15 },
      } : undefined}
      whileTap={!isDisabled ? {
        scale: 0.95,
        y: 0,
        transition: { duration: 0.08 },
      } : undefined}
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        "relative flex-shrink-0 flex flex-col items-center px-1 pt-1 pb-0",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1",
        isDisabled && !loading && "opacity-40 cursor-not-allowed",
        loading && "cursor-wait"
      )}
      title={loading ? "Processing..." : label}
      aria-label={loading ? "Processing..." : label}
    >
      {/* Chalk stub - top-down view (pill shape lying flat) */}
      <div
        className={cn("relative w-9 h-4 sm:w-11 sm:h-5", loading && "animate-pulse")}
        style={{
          borderRadius: "8px",
          background: `linear-gradient(
            180deg,
            ${colors.highlight} 0%,
            ${colors.highlight} 20%,
            ${colors.base} 45%,
            ${colors.base} 55%,
            ${colors.shadow} 100%
          )`,
          boxShadow: loading
            ? `0 0 10px 3px rgba(251, 191, 36, 0.7), 0 0 16px 6px rgba(251, 191, 36, 0.4), 0 2px 3px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.5)`
            : active
            ? `0 0 8px 2px rgba(134, 239, 172, 0.6), 0 0 12px 4px rgba(134, 239, 172, 0.3), 0 2px 3px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.5)`
            : `0 2px 3px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.5)`,
        }}
      >
        {/* Chalk texture overlay */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            borderRadius: "inherit",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='3'/%3E%3C/filter%3E%3Crect width='20' height='20' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Icon embossed on chalk surface - dark for visibility, or colored for CW/HW */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon
            className="h-3 w-3 sm:h-4 sm:w-4"
            style={{
              color: iconColor || 'rgba(0,0,0,0.55)',
              filter: iconColor
                ? 'drop-shadow(0 1px 0 rgba(255,255,255,0.5))'
                : 'drop-shadow(0 1px 0 rgba(255,255,255,0.35))',
            }}
          />
        </div>
      </div>

      {/* Chalk dust label below stub */}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 + index * 0.03 }}
        className="mt-0.5 text-[8px] sm:text-[9px] font-medium whitespace-nowrap select-none"
        style={{
          color: 'rgba(255,255,255,0.55)',
          textShadow: '0 0 6px rgba(255,255,255,0.25)',
          letterSpacing: '0.03em',
        }}
      >
        {shortLabel}
      </motion.span>
    </motion.button>
  );
}

interface ChalkboardHeaderProps {
  session: Session;
  onEdit?: () => void;
  onLesson?: () => void;
  onAction?: (actionId: string, action: ActionConfig<Session>) => void;
  loadingActionId?: string | null;
}

export function ChalkboardHeader({ session, onEdit, onLesson, onAction, loadingActionId }: ChalkboardHeaderProps) {
  const displayStatus = getDisplayStatus(session);
  const statusConfig = getSessionStatusConfig(displayStatus);
  const { data: tutors } = useTutors();
  const [showAcademicInfo, setShowAcademicInfo] = useState(false);
  const [showMobileStatus, setShowMobileStatus] = useState(false);
  const [popoverAlign, setPopoverAlign] = useState<'left' | 'center' | 'right'>('left');
  const [exerciseModalType, setExerciseModalType] = useState<"CW" | "HW" | null>(null);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [isMakeupModalOpen, setIsMakeupModalOpen] = useState(false);
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [confirmCancelMakeup, setConfirmCancelMakeup] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  // Extension request viewing state
  const [extensionRequestToView, setExtensionRequestToView] = useState<ExtensionRequestDetail | null>(null);
  const [isExtensionReviewModalOpen, setIsExtensionReviewModalOpen] = useState(false);
  const [isLoadingExtensionView, setIsLoadingExtensionView] = useState(false);
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const { showToast } = useToast();
  const { user, effectiveRole, isReadOnly, impersonatedTutor } = useAuth();
  const isAdmin = effectiveRole === "Admin" || effectiveRole === "Super Admin";

  // Get tutor name by email, fallback to username from email
  const getTutorName = (email?: string): string | undefined => {
    if (!email) return undefined;
    if (tutors) {
      const tutor = tutors.find(t => t.user_email === email);
      if (tutor) return tutor.tutor_name;
    }
    // Fallback to username from email
    return email.includes('@') ? email.split('@')[0] : email;
  };

  // Generate "Attendance Marked by" tooltip with tutor name lookup
  const statusTooltip = useMemo(() => {
    if (!session.attendance_marked_by && !session.attendance_mark_time) return undefined;

    const parts: string[] = [];

    if (session.attendance_marked_by) {
      const name = getTutorName(session.attendance_marked_by);
      parts.push(`Attendance Marked by ${name}`);
    }

    if (session.attendance_mark_time) {
      const date = new Date(session.attendance_mark_time);
      const formatted = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      parts.push(session.attendance_marked_by ? `at ${formatted}` : `Attendance Marked at ${formatted}`);
    }

    return parts.join(' ');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.attendance_marked_by, session.attendance_mark_time, tutors]);

  // Combine external loadingActionId with internal loadingAction
  const effectiveLoadingAction = loadingActionId || loadingAction;
  const isAnyStatusLoading = ['attended', 'no-show', 'reschedule', 'sick-leave', 'weather-cancelled', 'undo'].includes(effectiveLoadingAction || '');

  // Get visible actions for this session (filtered by visibility and role)
  // Supervisors can see all admin actions but cannot execute them
  const visibilityContext = { userId: impersonatedTutor?.id ?? user?.id, effectiveRole };
  const visibleActions = sessionActions.filter((action) => {
    if (!action.isVisible(session, visibilityContext)) return false;
    // Allow Supervisor to see actions that Admin can see
    if (effectiveRole === "Supervisor") {
      // Show if Admin is in allowedRoles
      return action.allowedRoles.includes("Admin") || action.allowedRoles.includes("Super Admin");
    }
    if (effectiveRole && !action.allowedRoles.includes(effectiveRole as typeof action.allowedRoles[number])) return false;
    return true;
  });

  // Check if session has CW/HW exercises or rating (for active state on chalk buttons)
  const hasCW = session.exercises?.some(
    (ex) => ex.exercise_type === "Classwork" || ex.exercise_type === "CW"
  ) ?? false;
  const hasHW = session.exercises?.some(
    (ex) => ex.exercise_type === "Homework" || ex.exercise_type === "HW"
  ) ?? false;
  const hasRating = !!(session.performance_rating || session.notes);

  const getChalkColor = (actionId: string) => {
    const colorKey = ACTION_TO_COLOR[actionId] || "white";
    return CHALK_PALETTE[colorKey];
  };

  const handleActionClick = async (action: ActionConfig<Session>) => {
    // Special handling for edit action
    if (action.id === 'edit') {
      onEdit?.();
      return;
    }

    // Special handling for CW/HW actions - open exercise modal
    if (action.id === 'cw') {
      setExerciseModalType("CW");
      return;
    }
    if (action.id === 'hw') {
      setExerciseModalType("HW");
      return;
    }

    // Special handling for rate action - open rate modal
    if (action.id === 'rate') {
      setIsRateModalOpen(true);
      return;
    }

    // Special handling for cancel-makeup action - show confirm dialog
    if (action.id === 'cancel-makeup') {
      setConfirmCancelMakeup(true);
      return;
    }

    // Special handling for schedule-makeup action - open makeup modal
    if (action.id === 'schedule-makeup') {
      setIsMakeupModalOpen(true);
      return;
    }

    // Special handling for request-extension action - open modal immediately (modal fetches data)
    if (action.id === 'request-extension') {
      setIsExtensionModalOpen(true);
      return;
    }

    // Handle "attended" action with API call
    if (action.id === 'attended') {
      setLoadingAction('attended');
      try {
        const updatedSession = await sessionsAPI.markAttended(session.id);
        updateSessionInCache(updatedSession);
        showToast("Session marked as attended", "success");
        onAction?.(action.id, action);
      } catch (error) {
        showToast("Failed to mark as attended", "error");
      } finally {
        setLoadingAction(null);
      }
      return;
    }

    // Handle "no-show" action with API call
    if (action.id === 'no-show') {
      setLoadingAction('no-show');
      try {
        const updatedSession = await sessionsAPI.markNoShow(session.id);
        updateSessionInCache(updatedSession);
        showToast("Session marked as no show", "success");
        onAction?.(action.id, action);
      } catch (error) {
        showToast("Failed to mark as no show", "error");
      } finally {
        setLoadingAction(null);
      }
      return;
    }

    // Handle "reschedule" action with API call
    if (action.id === 'reschedule') {
      setLoadingAction('reschedule');
      try {
        const updatedSession = await sessionsAPI.markRescheduled(session.id);
        updateSessionInCache(updatedSession);
        showToast("Session marked as rescheduled", "success");
        onAction?.(action.id, action);
      } catch (error) {
        showToast("Failed to mark as rescheduled", "error");
      } finally {
        setLoadingAction(null);
      }
      return;
    }

    // Handle "sick-leave" action with API call
    if (action.id === 'sick-leave') {
      setLoadingAction('sick-leave');
      try {
        const updatedSession = await sessionsAPI.markSickLeave(session.id);
        updateSessionInCache(updatedSession);
        showToast("Session marked as sick leave", "success");
        onAction?.(action.id, action);
      } catch (error) {
        showToast("Failed to mark as sick leave", "error");
      } finally {
        setLoadingAction(null);
      }
      return;
    }

    // Handle "weather-cancelled" action with API call
    if (action.id === 'weather-cancelled') {
      setLoadingAction('weather-cancelled');
      try {
        const updatedSession = await sessionsAPI.markWeatherCancelled(session.id);
        updateSessionInCache(updatedSession);
        showToast("Session marked as weather cancelled", "success");
        onAction?.(action.id, action);
      } catch (error) {
        showToast("Failed to mark as weather cancelled", "error");
      } finally {
        setLoadingAction(null);
      }
      return;
    }

    // Handle "undo" action - show confirmation dialog
    if (action.id === 'undo') {
      setConfirmUndo(true);
      return;
    }

    if (onAction) {
      onAction(action.id, action);
    }
  };

  // Handler to view existing extension request
  const handleViewExtensionRequest = useCallback(async () => {
    if (!session.extension_request_id) return;
    setIsLoadingExtensionView(true);
    try {
      const detail = await extensionRequestsAPI.getById(session.extension_request_id);
      setExtensionRequestToView(detail);
      setIsExtensionReviewModalOpen(true);
    } catch {
      showToast("Failed to load extension request", "error");
    } finally {
      setIsLoadingExtensionView(false);
    }
  }, [session.extension_request_id, showToast]);

  const handleCancelMakeup = async () => {
    setLoadingAction('cancel-makeup');
    try {
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
      removeSessionFromCache(makeupSessionId);
      updateSessionInCache(originalSession);
      showToast("Make-up cancelled", "success");
      onAction?.('cancel-makeup', sessionActions.find(a => a.id === 'cancel-makeup')!);
    } catch (error) {
      showToast("Failed to cancel make-up", "error");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleUndo = async () => {
    setLoadingAction('undo');
    try {
      const updatedSession = await sessionsAPI.undoStatus(session.id);
      updateSessionInCache(updatedSession);

      // Show toast with redo action (10 second duration when action is provided)
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
                showToast("Failed to restore status", "error");
              }
            },
          }
        );
      } else {
        showToast("Status reverted", "success");
      }
      onAction?.('undo', sessionActions.find(a => a.id === 'undo')!);
    } catch (error) {
      showToast("Failed to undo status", "error");
    } finally {
      setLoadingAction(null);
    }
  };

  // Calculate popover alignment based on available space
  const handleInfoMouseEnter = () => {
    if (infoButtonRef.current) {
      const rect = infoButtonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const popoverWidth = 280;
      const padding = 16;

      const spaceOnRight = viewportWidth - rect.left;
      const spaceOnLeft = rect.right;
      const needed = popoverWidth + padding;

      if (spaceOnRight >= needed) {
        setPopoverAlign('left');
      } else if (spaceOnLeft >= needed) {
        setPopoverAlign('right');
      } else {
        setPopoverAlign('center');
      }
    }
    setShowAcademicInfo(true);
  };

  const sessionDate = new Date(session.session_date);
  const formattedDate = sessionDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.38, 1.21, 0.22, 1.00] }}
      className="relative w-full rounded-[20px] sm:rounded-[28px] group z-50"
      style={{
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
        transition: 'all 350ms cubic-bezier(0.38, 1.21, 0.22, 1.00)',
      }}
    >
      {/* Wood Frame - Outer (3D dimensional) - extends to include tray */}
      <div className="absolute inset-0 rounded-[20px] sm:rounded-[28px] bg-gradient-to-br from-[#b89968] via-[#a67c52] to-[#8b6f47]">
        {/* Wood grain texture */}
        <div className="absolute inset-0 rounded-[20px] sm:rounded-[28px] opacity-40" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='wood'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.05,0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23wood)' opacity='0.3'/%3E%3C/svg%3E")`,
        }} />

        {/* Inner shadow for depth */}
        <div className="absolute inset-0 rounded-[20px] sm:rounded-[28px]" style={{
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.2), inset 0 -1px 3px rgba(255,255,255,0.15)',
        }} />
      </div>

      {/* Chalkboard Surface - Inner (stops before ledge) */}
      <div
        className="absolute left-2 right-2 top-2 sm:left-3 sm:right-3 sm:top-3 bg-[#2d4739] dark:bg-[#1a2821] rounded-[14px] sm:rounded-[20px] transition-colors duration-350 bottom-[56px] sm:bottom-[64px]"
      >
        {/* Chalk dust texture overlay */}
        <div className="absolute inset-0 rounded-[14px] sm:rounded-[20px] opacity-30 transition-opacity duration-350 group-hover:opacity-40" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.3'/%3E%3C/svg%3E")`,
        }} />

        {/* Chalkboard inner shadow */}
        <div className="absolute inset-0 rounded-[14px] sm:rounded-[20px]" style={{
          boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.35), inset 0 0 12px rgba(0,0,0,0.15)',
        }} />
      </div>

      {/* Wooden Ledge/Tray - contains chalk buttons */}
      <div
        className="absolute left-2 right-2 sm:left-3 sm:right-3 bottom-2 sm:bottom-3 h-11 sm:h-12 z-10"
        style={{
          background: 'linear-gradient(180deg, #9a7b5a 0%, #8b6f47 30%, #7a6040 70%, #6b5a3a 100%)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2), inset 0 -1px 2px rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.2)',
          borderRadius: '4px 4px 12px 12px',
        }}
      >
        {/* Wood grain texture */}
        <div className="absolute inset-0 opacity-25" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='wood'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.02,0.4' numOctaves='2'/%3E%3C/filter%3E%3Crect width='200' height='40' filter='url(%23wood)' opacity='0.3'/%3E%3C/svg%3E")`,
          borderRadius: 'inherit',
        }} />

        {/* Groove/channel for chalk (subtle depression) */}
        <div
          className="absolute left-1 right-1 top-1 bottom-1"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.08) 40%, transparent 100%)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
            borderRadius: '2px 2px 10px 10px',
          }}
        />

        {/* Chalk stubs container */}
        <div className="relative h-full flex items-center justify-start gap-0.5 sm:gap-2 px-2 sm:px-3 overflow-x-auto scrollbar-hide">
          {/* All actions from sessionActions (including edit at the end) */}
          {visibleActions.map((action, index) => (
            <ChalkStub
              key={action.id}
              id={action.id}
              label={isReadOnly ? `${action.label} (Read-only)` : action.label}
              shortLabel={action.shortLabel || action.label}
              icon={action.icon}
              colors={getChalkColor(action.id)}
              onClick={() => handleActionClick(action)}
              disabled={(isReadOnly && !['cw', 'hw', 'rate', 'schedule-makeup'].includes(action.id)) || (!['edit', 'cw', 'hw', 'rate', 'attended', 'no-show', 'reschedule', 'sick-leave', 'weather-cancelled', 'cancel-makeup', 'schedule-makeup', 'request-extension'].includes(action.id) && !action.api.enabled)}
              loading={effectiveLoadingAction === action.id}
              index={index}
              active={action.id === 'cw' ? hasCW : action.id === 'hw' ? hasHW : action.id === 'rate' ? hasRating : undefined}
              iconColor={action.id === 'cw' ? '#ef4444' : action.id === 'hw' ? '#3b82f6' : undefined}
            />
          ))}

          {/* Spacer to push nav buttons right */}
          <div className="flex-1" />

          {/* Session Navigation + Lesson */}
          <div className="flex items-center gap-1 sm:gap-2">
            {session.nav_previous_id && (
              <Link
                href={`/sessions/${session.nav_previous_id}`}
                className="p-1.5 sm:p-2 rounded-full bg-[#6b5a3a]/50 hover:bg-[#6b5a3a] transition-colors"
                title={`← Previous session (#${session.nav_previous_id})`}
              >
                <ChevronLeft className="h-4 w-4 text-white/80" />
              </Link>
            )}

            {/* Lesson ChalkStub — between prev and next */}
            {onLesson && (
              <ChalkStub
                id="lesson"
                label="Lesson Mode (L)"
                shortLabel="Lesson"
                icon={Presentation}
                colors={CHALK_PALETTE.green}
                onClick={onLesson}
                index={visibleActions.length}
              />
            )}

            {session.nav_next_id && (
              <Link
                href={`/sessions/${session.nav_next_id}`}
                className="p-1.5 sm:p-2 rounded-full bg-[#6b5a3a]/50 hover:bg-[#6b5a3a] transition-colors"
                title={`Next session (#${session.nav_next_id}) →`}
              >
                <ChevronRight className="h-4 w-4 text-white/80" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative flex flex-col">
        {/* Chalkboard Content */}
        <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-16 sm:pb-18">
          {/* Left side - Student ID, Name, and Metadata */}
          <div className="flex-1 min-w-0 relative">
            <motion.div
              initial={{ opacity: 0, x: -20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{
                delay: 0.15,
                duration: 0.35,
                ease: [0.38, 1.21, 0.22, 1.00],
              }}
              className="flex items-center gap-2 mb-1"
            >
              <h1
                className="text-lg sm:text-xl lg:text-2xl font-bold text-white/98 truncate"
                style={{
                  textShadow: '2px 2px 6px rgba(0,0,0,0.5), 0 0 12px rgba(255,255,255,0.15)',
                  letterSpacing: '0.03em',
                  fontWeight: 700,
                }}
              >
                {session.school_student_id && (
                  <span className="text-white/85 mr-2">{session.school_student_id}</span>
                )}
                <Link
                  href={`/students/${session.student_id}`}
                  className="hover:text-amber-200 hover:underline decoration-amber-200/50 underline-offset-2 transition-colors"
                >
                  {session.student_name || "Unknown Student"}
                </Link>
              </h1>

              {/* Info Button */}
              <button
                ref={infoButtonRef}
                onMouseEnter={handleInfoMouseEnter}
                onMouseLeave={() => setShowAcademicInfo(false)}
                className="relative flex-shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors"
                aria-label="View academic information"
              >
                <Info className="h-4 w-4 text-white/70 hover:text-white/90 transition-colors" />

                {/* Academic Info Popover */}
                <AnimatePresence>
                  {showAcademicInfo && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -5 }}
                      transition={{ duration: 0.2, ease: [0.38, 1.21, 0.22, 1.00] }}
                      className={cn(
                        "absolute top-full mt-2 w-auto max-w-[90vw] overflow-x-auto p-2.5 bg-[#e6d5b8] dark:bg-[#3d3a32] rounded-lg shadow-xl border border-amber-900/40 dark:border-amber-900/20 z-[9999]",
                        popoverAlign === 'left' && 'left-0',
                        popoverAlign === 'right' && 'right-0',
                        popoverAlign === 'center' && 'left-1/2 -translate-x-1/2'
                      )}
                      style={{ boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}
                    >
                      <div className="space-y-2">
                        {/* Academic Info Row */}
                        {(session.grade || session.lang_stream || session.school) && (
                          <table className="text-center w-full">
                            <thead>
                              <tr>
                                {session.grade && (
                                  <th className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">Grade</th>
                                )}
                                {session.lang_stream && (
                                  <th className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">Lang</th>
                                )}
                                {session.school && (
                                  <th className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">School</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                {session.grade && (
                                  <td className="px-3 py-1 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{session.grade}</td>
                                )}
                                {session.lang_stream && (
                                  <td className="px-3 py-1 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{session.lang_stream}</td>
                                )}
                                {session.school && (
                                  <td className="px-3 py-1 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <GraduationCap className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                                      <span>{session.school}</span>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            </tbody>
                          </table>
                        )}

                        {/* IDs Row */}
                        <table className="text-center w-full">
                          <thead>
                            <tr>
                              <th className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">Session</th>
                              {session.enrollment_id && (
                                <th className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">Enrollment</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="px-3 py-1 text-sm font-mono font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">#{session.id}</td>
                              {session.enrollment_id && (
                                <td className="px-3 py-1 text-sm font-mono font-medium whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-2">
                                    <Link
                                      href={`/enrollments/${session.enrollment_id}`}
                                      className="text-blue-600 dark:text-blue-400 hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      #{session.enrollment_id}
                                    </Link>
                                    {session.enrollment_payment_status === 'Cancelled' && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium font-sans">
                                        Cancelled
                                      </span>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          </tbody>
                        </table>

                        {/* Linked Sessions */}
                        {session.rescheduled_to && (
                          <div className="pt-2 border-t border-amber-900/20 dark:border-amber-900/10">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Make-up Session</span>
                              <Link
                                href={`/sessions/${session.rescheduled_to.id}`}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ArrowRight className="h-3 w-3" />
                                <span className="font-mono">#{session.rescheduled_to.id}</span>
                              </Link>
                            </div>
                            <div className="text-xs text-gray-700 dark:text-gray-300 pl-2 flex items-center justify-between gap-2">
                              <span className="whitespace-nowrap">
                                {new Date(session.rescheduled_to.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                {session.rescheduled_to.time_slot && ` · ${session.rescheduled_to.time_slot}`}
                                {session.rescheduled_to.tutor_name && ` · ${session.rescheduled_to.tutor_name}`}
                              </span>
                              <SessionStatusTag status={session.rescheduled_to.session_status} size="sm" className="text-[10px] px-1 py-0 truncate max-w-[60px] shrink-0" />
                            </div>
                          </div>
                        )}

                        {session.make_up_for && (
                          <div className="pt-2 border-t border-amber-900/20 dark:border-amber-900/10">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Original Session</span>
                              <Link
                                href={`/sessions/${session.make_up_for.id}`}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ArrowRight className="h-3 w-3 rotate-180" />
                                <span className="font-mono">#{session.make_up_for.id}</span>
                              </Link>
                            </div>
                            <div className="text-xs text-gray-700 dark:text-gray-300 pl-2 flex items-center justify-between gap-2">
                              <span className="whitespace-nowrap">
                                {new Date(session.make_up_for.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                {session.make_up_for.time_slot && ` · ${session.make_up_for.time_slot}`}
                                {session.make_up_for.tutor_name && ` · ${session.make_up_for.tutor_name}`}
                              </span>
                              <SessionStatusTag status={session.make_up_for.session_status} size="sm" className="text-[10px] px-1 py-0 truncate max-w-[60px] shrink-0" />
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </motion.div>

            {/* Metadata row */}
            <motion.div
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25, duration: 0.3, ease: [0.38, 1.21, 0.22, 1.00] }}
              className="flex items-center gap-3 text-sm text-white/75 font-medium flex-wrap"
              style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.4)' }}
            >
              {/* Mobile Tutor Display */}
              <span className="md:hidden text-white/60 text-xs">{session.tutor_name || "N/A"}</span>
              <span className="md:hidden text-white/50">•</span>

              {/* Date */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, duration: 0.25, ease: [0.38, 1.21, 0.22, 1.00] }}
                className="flex items-center gap-1.5"
              >
                <Calendar className="h-3.5 w-3.5 text-white/85" />
                <span>{formattedDate}</span>
              </motion.div>

              {session.time_slot && <span className="text-white/50">•</span>}
              {session.time_slot && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35, duration: 0.25, ease: [0.38, 1.21, 0.22, 1.00] }}
                  className="flex items-center gap-1.5"
                >
                  <Clock className="h-3.5 w-3.5 text-white/85" />
                  <span>{session.time_slot}</span>
                </motion.div>
              )}

              {session.location && <span className="text-white/50">•</span>}
              {session.location && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4, duration: 0.25, ease: [0.38, 1.21, 0.22, 1.00] }}
                  className="flex items-center gap-1.5"
                >
                  <MapPin className="h-3.5 w-3.5 text-white/85" />
                  <span>{session.location}</span>
                </motion.div>
              )}

              {(session.financial_status || session.enrollment_payment_status === 'Cancelled') && <span className="text-white/50">•</span>}
              {session.enrollment_payment_status === 'Cancelled' ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.45, duration: 0.25, ease: [0.38, 1.21, 0.22, 1.00] }}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-500/50"
                >
                  <span className="text-gray-300 font-semibold text-xs">Cancelled</span>
                </motion.div>
              ) : session.financial_status && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.45, duration: 0.25, ease: [0.38, 1.21, 0.22, 1.00] }}
                  className="flex items-center gap-1.5"
                >
                  {session.financial_status === "Paid" ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                      <span className="text-green-300 font-semibold">Paid</span>
                    </>
                  ) : (
                    <>
                      <HandCoins className="h-3.5 w-3.5 text-red-400" />
                      <span className="text-red-300 font-semibold">Unpaid</span>
                    </>
                  )}
                </motion.div>
              )}

              {/* Exam Revision Badge */}
              {session.exam_revision_slot_id && (
                <>
                  <span className="text-white/50">•</span>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, duration: 0.25, ease: [0.38, 1.21, 0.22, 1.00] }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/80 text-white"
                    title="Exam Revision Session"
                  >
                    <GraduationCap className="h-3 w-3" />
                    <span className="hidden sm:inline">Exam Revision</span>
                  </motion.div>
                </>
              )}

              {/* Extension Request Badge */}
              {session.extension_request_id && (
                <>
                  <span className="text-white/50">•</span>
                  <motion.button
                    onClick={handleViewExtensionRequest}
                    disabled={isLoadingExtensionView}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, duration: 0.25, ease: [0.38, 1.21, 0.22, 1.00] }}
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity",
                      session.extension_request_status === "Pending"
                        ? "bg-amber-500/80 text-white"
                        : session.extension_request_status === "Approved"
                        ? "bg-green-500/80 text-white"
                        : "bg-red-500/80 text-white"
                    )}
                    title={`Extension Request: ${session.extension_request_status} (click to view)`}
                  >
                    {isLoadingExtensionView ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                    <span className="hidden sm:inline">Extension {session.extension_request_status}</span>
                    <span className="sm:hidden">{session.extension_request_status}</span>
                  </motion.button>
                </>
              )}
            </motion.div>
          </div>

          {/* Center - Tutor (desktop only) */}
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.35, ease: [0.38, 1.21, 0.22, 1.00] }}
            className="hidden md:block text-center px-6"
          >
            <p className="text-xs text-white/70 mb-1 uppercase tracking-wider font-bold">Tutor</p>
            <p className="text-xl text-white/98 font-bold" style={{
              textShadow: '2px 2px 5px rgba(0,0,0,0.5), 0 0 8px rgba(255,255,255,0.1)',
              letterSpacing: '0.02em',
              fontWeight: 700,
            }}>
              {session.tutor_name || "Not Assigned"}
            </p>
          </motion.div>

          {/* Right side - Status Badge */}
          <div className="flex-shrink-0">
            {/* Mobile: Compact icon-only */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
              className="md:hidden relative"
            >
              <button
                onClick={() => setShowMobileStatus(!showMobileStatus)}
                className={cn(
                  "relative w-9 h-9 rounded-full shadow-lg flex items-center justify-center border-2 border-white/40",
                  statusConfig.bgClass
                )}
                aria-label={`Status: ${displayStatus}`}
                title={statusTooltip}
              >
                {isAnyStatusLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <statusConfig.Icon className={cn("h-4 w-4 text-white", statusConfig.iconClass)} />
                )}
              </button>

              <AnimatePresence>
                {showMobileStatus && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -5 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "absolute right-0 top-full mt-2 px-3 py-1.5 rounded-lg shadow-lg text-xs font-bold text-white whitespace-nowrap z-50",
                      statusConfig.bgClass
                    )}
                  >
                    {displayStatus}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Desktop: Full pill */}
            <motion.div
              initial={{ scale: 0, rotate: -10, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
              whileHover={{ scale: 1.08, rotate: 2, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.95, transition: { duration: 0.1 } }}
              className="hidden md:block cursor-pointer"
            >
              <div className="relative">
                <div className="absolute inset-0 -m-3 rounded-full bg-white/25 blur-md transition-all duration-300 group-hover:bg-white/35" />
                <div
                  className={cn(
                    "relative text-sm px-5 py-2 shadow-lg whitespace-nowrap font-bold border-2 border-white/40 rounded-full text-white flex items-center gap-2",
                    statusConfig.bgClass
                  )}
                  style={{
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    transition: 'all 200ms cubic-bezier(0.30, 1.25, 0.40, 1.00)',
                    letterSpacing: '0.02em',
                  }}
                  title={statusTooltip}
                >
                  {isAnyStatusLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <statusConfig.Icon className={cn("h-4 w-4", statusConfig.iconClass)} />
                  )}
                  {displayStatus}
                </div>
              </div>
            </motion.div>
          </div>
        </div>

      </div>

      {/* Eraser marks (subtle animation) - desktop only */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 0.18, 0.12, 0] }}
        transition={{ delay: 0.6, duration: 2, ease: [0.42, 1.15, 0.30, 1.00] }}
        className="hidden sm:block absolute top-4 right-32 w-28 h-10 bg-white/12 rounded-full blur-lg transform -rotate-12"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 0.12, 0.08, 0] }}
        transition={{ delay: 0.8, duration: 2.2, ease: [0.42, 1.15, 0.30, 1.00] }}
        className="hidden sm:block absolute top-5 right-48 w-20 h-8 bg-white/8 rounded-full blur-md transform rotate-6"
      />

      {/* Exercise Modal for CW/HW */}
      {exerciseModalType && (
        <ExerciseModal
          session={session}
          exerciseType={exerciseModalType}
          isOpen={true}
          onClose={() => setExerciseModalType(null)}
          readOnly={isReadOnly}
        />
      )}

      {/* Rate Session Modal */}
      <RateSessionModal
        session={session}
        isOpen={isRateModalOpen}
        onClose={() => setIsRateModalOpen(false)}
        readOnly={isReadOnly}
      />

      {/* Schedule Makeup Modal */}
      {isMakeupModalOpen && (
        <ScheduleMakeupModal
          session={session}
          isOpen={isMakeupModalOpen}
          onClose={() => setIsMakeupModalOpen(false)}
          proposerTutorId={session.tutor_id}
          readOnly={isReadOnly}
        />
      )}

      {/* Extension Request Modal (for creating new requests) */}
      {isExtensionModalOpen && session.tutor_id && (
        <ExtensionRequestModal
          session={session}
          isOpen={isExtensionModalOpen}
          onClose={() => setIsExtensionModalOpen(false)}
          onRequestSubmitted={() => {
            setIsExtensionModalOpen(false);
            showToast("Extension request submitted successfully", "success");
          }}
          tutorId={session.tutor_id}
          isProactive={true}
        />
      )}

      {/* Extension Request Review Modal (for viewing/approving existing requests) */}
      {isExtensionReviewModalOpen && extensionRequestToView && (
        <ExtensionRequestReviewModal
          request={extensionRequestToView}
          isOpen={true}
          onClose={() => {
            setIsExtensionReviewModalOpen(false);
            setExtensionRequestToView(null);
          }}
          onApproved={() => {
            updateSessionInCache({ ...session, extension_request_status: "Approved" });
          }}
          onRejected={() => {
            updateSessionInCache({ ...session, extension_request_status: "Rejected" });
          }}
          adminTutorId={user?.id ?? 0}
          readOnly={!isAdmin}
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
        loading={loadingAction === 'cancel-makeup'}
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
        loading={loadingAction === 'undo'}
      />
    </motion.div>
  );
}
