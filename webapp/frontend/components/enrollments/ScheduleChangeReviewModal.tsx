"use client";

import { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/contexts/ToastContext";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Calendar,
  CalendarDays,
  ArrowRight,
  Clock,
  MapPin,
  User,
  AlertCircle,
  XCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  enrollmentsAPI,
  ScheduleChangeRequest,
  ScheduleChangePreviewResponse,
  UpdatableSession,
} from "@/lib/api";
import { formatShortDate } from "@/lib/formatters";
import { Popover } from "@/components/ui/popover";

interface ScheduleChangeReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  enrollmentId: number;
  currentSchedule: {
    day: string;
    time: string;
    location: string;
    tutorId: number;
    tutorName: string;
  };
  newSchedule: {
    day: string;
    time: string;
    location: string;
    tutorId: number;
    tutorName: string;
  };
  onSuccess: () => void;
}

export function ScheduleChangeReviewModal({
  isOpen,
  onClose,
  enrollmentId,
  currentSchedule,
  newSchedule,
  onSuccess,
}: ScheduleChangeReviewModalProps) {
  const { showToast } = useToast();

  // Preview state
  const [preview, setPreview] = useState<ScheduleChangePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual overrides: session_id -> { date?, time? }
  const [overrides, setOverrides] = useState<Record<number, { date?: string; time?: string }>>({});

  // Helper to get the effective date for a session (override or calculated)
  const getEffectiveDate = (session: UpdatableSession): string => {
    if (overrides[session.session_id]?.date) {
      return overrides[session.session_id].date!;
    }
    // Use shifted_date if present (holiday/collision shift), otherwise new_date
    return session.shifted_date || session.new_date;
  };

  // Helper to get the effective time for a session (override or calculated)
  const getEffectiveTime = (session: UpdatableSession): string => {
    if (overrides[session.session_id]?.time) {
      return overrides[session.session_id].time!;
    }
    return session.new_time_slot;
  };

  // Check if session has any override (date or time)
  const hasOverride = (sessionId: number): boolean => {
    const override = overrides[sessionId];
    return !!(override?.date || override?.time);
  };

  // Helper to parse time slot format "14:30 - 16:00" into start/end
  const parseTimeSlot = (timeSlot: string): { start: string; end: string } => {
    const parts = timeSlot.split(' - ');
    return { start: parts[0] || '', end: parts[1] || '' };
  };

  // Handle date override change
  const handleDateOverride = (sessionId: number, newDate: string) => {
    setOverrides(prev => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], date: newDate }
    }));
  };

  // Handle time override change (combines start and end times)
  const handleTimeOverride = (sessionId: number, start: string, end: string) => {
    const combined = `${start} - ${end}`;
    setOverrides(prev => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], time: combined }
    }));
  };

  // Clear all overrides for a session
  const clearOverride = (sessionId: number) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  };

  // Fetch preview when modal opens
  useEffect(() => {
    if (isOpen && enrollmentId) {
      fetchPreview();
    } else {
      // Reset state when closing
      setPreview(null);
      setPreviewError(null);
      setOverrides({});
    }
  }, [isOpen, enrollmentId, newSchedule.day, newSchedule.time, newSchedule.location, newSchedule.tutorId]);

  const fetchPreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const request: ScheduleChangeRequest = {
        assigned_day: newSchedule.day,
        assigned_time: newSchedule.time,
        location: newSchedule.location,
        tutor_id: newSchedule.tutorId,
      };
      const result = await enrollmentsAPI.previewScheduleChange(enrollmentId, request);
      setPreview(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to preview schedule change";
      setPreviewError(message);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle applying changes (update sessions)
  const handleApplyChanges = async () => {
    setIsSubmitting(true);
    try {
      // Build date and time overrides from the combined state
      const dateOverrides: Record<number, string> = {};
      const timeOverrides: Record<number, string> = {};

      Object.entries(overrides).forEach(([sessionId, override]) => {
        if (override.date) dateOverrides[Number(sessionId)] = override.date;
        if (override.time) timeOverrides[Number(sessionId)] = override.time;
      });

      const result = await enrollmentsAPI.applyScheduleChange(enrollmentId, {
        assigned_day: newSchedule.day,
        assigned_time: newSchedule.time,
        location: newSchedule.location,
        tutor_id: newSchedule.tutorId,
        apply_to_sessions: true,
        date_overrides: Object.keys(dateOverrides).length > 0 ? dateOverrides : undefined,
        time_overrides: Object.keys(timeOverrides).length > 0 ? timeOverrides : undefined,
      });
      showToast(result.message, "success");
      onSuccess();
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to apply schedule change";
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle keeping enrollment update only (no session changes)
  const handleKeepSessions = async () => {
    setIsSubmitting(true);
    try {
      const result = await enrollmentsAPI.applyScheduleChange(enrollmentId, {
        assigned_day: newSchedule.day,
        assigned_time: newSchedule.time,
        location: newSchedule.location,
        tutor_id: newSchedule.tutorId,
        apply_to_sessions: false,
      });
      showToast(result.message, "success");
      onSuccess();
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update enrollment";
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine if there are updatable sessions
  const hasUpdatableSessions = preview?.updatable_sessions && preview.updatable_sessions.length > 0;
  const hasUnchangeableSessions = preview?.unchangeable_sessions && preview.unchangeable_sessions.length > 0;
  const hasConflicts = preview?.conflicts && preview.conflicts.length > 0;
  const hasWarnings = preview?.warnings && preview.warnings.length > 0;
  const canApply = preview?.can_apply ?? true;

  // Format schedule change summary
  const changeSummary = useMemo(() => {
    const parts: string[] = [];
    if (currentSchedule.day !== newSchedule.day) {
      parts.push(`${currentSchedule.day} → ${newSchedule.day}`);
    }
    if (currentSchedule.time !== newSchedule.time) {
      parts.push(`${currentSchedule.time} → ${newSchedule.time}`);
    }
    if (currentSchedule.tutorId !== newSchedule.tutorId) {
      parts.push(`${currentSchedule.tutorName} → ${newSchedule.tutorName}`);
    }
    if (currentSchedule.location !== newSchedule.location) {
      parts.push(`${currentSchedule.location} → ${newSchedule.location}`);
    }
    return parts.join(", ");
  }, [currentSchedule, newSchedule]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Schedule Change Impact Review"
      size="lg"
      footer={
        previewLoading ? null : previewError ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-foreground/70 hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="flex justify-between items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-foreground/70 hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <div className="flex gap-3">
              {hasUpdatableSessions && (
                <button
                  type="button"
                  onClick={handleKeepSessions}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-all disabled:opacity-50"
                >
                  Keep All Sessions
                </button>
              )}
              <button
                type="button"
                onClick={handleApplyChanges}
                disabled={!canApply || isSubmitting}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
                  !canApply || hasConflicts
                    ? "bg-gray-300 dark:bg-gray-700 text-foreground/50 cursor-not-allowed"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                )}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {hasUpdatableSessions ? "Apply Changes" : "Update Enrollment"}
              </button>
            </div>
          </div>
        )
      }
    >
      {previewLoading ? (
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-foreground/60">Analyzing schedule change impact...</p>
        </div>
      ) : previewError ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Preview Error</span>
          </div>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{previewError}</p>
        </div>
      ) : preview ? (
        <div className="space-y-4">
          {/* Change Summary Header */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm">
              <Calendar className="h-4 w-4" />
              <span className="font-medium">Changing:</span>
              <span>{changeSummary}</span>
            </div>
          </div>

          {/* Conflicts */}
          {hasConflicts && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
                <XCircle className="h-4 w-4" />
                <span className="font-medium text-sm">Conflicts Found - Cannot Apply</span>
              </div>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                {preview.conflicts.map((conflict, i) => (
                  <li key={i}>
                    • {formatShortDate(conflict.session_date)} {conflict.time_slot} - Existing session with {conflict.existing_tutor_name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {hasWarnings && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium text-sm">Warnings</span>
              </div>
              <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5">
                {preview.warnings.map((warning, i) => (
                  <li key={i}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Unchangeable Sessions */}
          {hasUnchangeableSessions && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-gray-500" />
                  <span className="font-medium text-sm text-foreground">
                    Cannot Change ({preview.unchangeable_sessions.length} sessions)
                  </span>
                </div>
              </div>
              <div className="max-h-[150px] overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {preview.unchangeable_sessions.map((session) => (
                      <tr key={session.session_id} className="bg-gray-50/50 dark:bg-gray-800/50">
                        <td className="px-3 py-1.5 font-medium">
                          {formatShortDate(session.session_date)}
                        </td>
                        <td className="px-3 py-1.5 text-foreground/60">
                          {session.time_slot}
                        </td>
                        <td className="px-3 py-1.5 text-foreground/60">
                          {session.tutor_name}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="text-gray-500 dark:text-gray-400 italic">
                            {session.reason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Updatable Sessions */}
          {hasUpdatableSessions ? (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-green-50 dark:bg-green-900/20">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-sm text-green-700 dark:text-green-300">
                    Will Be Updated ({preview.updatable_sessions.length} sessions)
                  </span>
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-[60]">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-foreground/70">Current</th>
                      <th className="px-3 py-1.5 text-center font-medium text-foreground/70 w-8"></th>
                      <th className="px-3 py-1.5 text-left font-medium text-foreground/70">New</th>
                      <th className="px-3 py-1.5 text-left font-medium text-foreground/70">Tutor</th>
                      <th className="px-3 py-1.5 text-center font-medium text-foreground/70 w-16">Adjust</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {preview.updatable_sessions.map((session) => {
                      const sessionHasOverride = hasOverride(session.session_id);
                      const effectiveDate = getEffectiveDate(session);
                      const effectiveTime = getEffectiveTime(session);
                      const hasTimeOverride = !!overrides[session.session_id]?.time;
                      const hasDateOverride = !!overrides[session.session_id]?.date;

                      return (
                        <tr
                          key={session.session_id}
                          className={cn(
                            session.is_holiday && !sessionHasOverride && "bg-amber-50/50 dark:bg-amber-900/10",
                            sessionHasOverride && "bg-blue-50/50 dark:bg-blue-900/10"
                          )}
                        >
                          <td className="px-3 py-1.5">
                            <div className="font-medium">{formatShortDate(session.current_date)}</div>
                            <div className="text-foreground/50">{session.current_time_slot}</div>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <ArrowRight className="h-3 w-3 text-foreground/40 mx-auto" />
                          </td>
                          <td className="px-3 py-1.5">
                            {sessionHasOverride ? (
                              // Manual override display
                              <div>
                                <div className="font-medium line-through text-foreground/40">
                                  {formatShortDate(session.shifted_date || session.new_date)}
                                </div>
                                <div className="font-medium text-blue-600 dark:text-blue-400">
                                  {formatShortDate(effectiveDate)}
                                </div>
                                <div className={cn(
                                  "text-foreground/50",
                                  hasTimeOverride && "text-blue-500 dark:text-blue-400"
                                )}>
                                  {effectiveTime}
                                </div>
                                <div className="text-blue-500 text-[10px]">
                                  ✏️ Manual
                                </div>
                              </div>
                            ) : session.is_holiday ? (
                              // Holiday shift display
                              <div>
                                <div className="font-medium line-through text-foreground/40">
                                  {formatShortDate(session.new_date)}
                                </div>
                                <div className="font-medium text-amber-600 dark:text-amber-400">
                                  {formatShortDate(session.shifted_date || session.new_date)}
                                </div>
                                <div className="text-foreground/50">{session.new_time_slot}</div>
                                <div className="text-amber-500 text-[10px]">
                                  ⚠️ {session.holiday_name}
                                </div>
                              </div>
                            ) : (
                              // Normal date display
                              <div>
                                <div className="font-medium">{formatShortDate(session.new_date)}</div>
                                <div className="text-foreground/50">{session.new_time_slot}</div>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            {session.current_tutor_name !== session.new_tutor_name ? (
                              <div className="flex items-center gap-1">
                                <span className="text-foreground/40 line-through">{session.current_tutor_name}</span>
                                <ArrowRight className="h-2.5 w-2.5 text-foreground/30" />
                                <span className="text-green-600 dark:text-green-400">{session.new_tutor_name}</span>
                              </div>
                            ) : (
                              <span>{session.new_tutor_name}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Popover
                                trigger={
                                  <button
                                    type="button"
                                    className={cn(
                                      "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                                      sessionHasOverride && "text-blue-600 dark:text-blue-400"
                                    )}
                                    title="Adjust date/time"
                                  >
                                    <CalendarDays className="h-4 w-4" />
                                  </button>
                                }
                                content={
                                  <div className="space-y-3">
                                    <div>
                                      <div className="text-xs font-medium text-foreground/70 mb-1">
                                        Override date
                                      </div>
                                      <input
                                        type="date"
                                        value={overrides[session.session_id]?.date || effectiveDate}
                                        onChange={(e) => handleDateOverride(session.session_id, e.target.value)}
                                        min={new Date().toISOString().split('T')[0]}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-background"
                                      />
                                    </div>
                                    <div>
                                      <div className="text-xs font-medium text-foreground/70 mb-1">
                                        Override time
                                      </div>
                                      {(() => {
                                        const currentTime = overrides[session.session_id]?.time || session.new_time_slot;
                                        const { start, end } = parseTimeSlot(currentTime);
                                        return (
                                          <div className="flex items-center gap-1">
                                            <input
                                              type="time"
                                              value={start}
                                              onChange={(e) => handleTimeOverride(session.session_id, e.target.value, end)}
                                              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-background"
                                            />
                                            <span className="text-foreground/50">-</span>
                                            <input
                                              type="time"
                                              value={end}
                                              onChange={(e) => handleTimeOverride(session.session_id, start, e.target.value)}
                                              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-background"
                                            />
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    {sessionHasOverride && (
                                      <button
                                        type="button"
                                        onClick={() => clearOverride(session.session_id)}
                                        className="w-full text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 pt-1 border-t border-gray-200 dark:border-gray-700"
                                      >
                                        Reset to calculated
                                      </button>
                                    )}
                                  </div>
                                }
                                className="min-w-[200px]"
                              />
                              {sessionHasOverride && (
                                <button
                                  type="button"
                                  onClick={() => clearOverride(session.session_id)}
                                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                                  title="Clear override"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-foreground/70">
                No future sessions need to be updated.
              </p>
              <p className="text-xs text-foreground/50 mt-1">
                Only the enrollment schedule will be changed.
              </p>
            </div>
          )}

          {/* Summary info */}
          {preview.updatable_sessions.length > 0 && (
            <div className="text-xs text-foreground/60 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>New time: {newSchedule.time}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span>Location: {newSchedule.location}</span>
                </div>
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span>Tutor: {newSchedule.tutorName}</span>
                </div>
              </div>
              {Object.keys(overrides).length > 0 && (
                <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  <CalendarDays className="h-3 w-3" />
                  <span>{Object.keys(overrides).length} session(s) with manual override</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
