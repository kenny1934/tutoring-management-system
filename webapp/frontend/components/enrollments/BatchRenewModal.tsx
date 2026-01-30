"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/contexts/ToastContext";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCcw,
  AlertCircle,
  Plus,
  Minus,
  Calendar,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { enrollmentsAPI } from "@/lib/api";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { formatShortDate } from "@/lib/formatters";

interface EligibilityResult {
  enrollment_id: number;
  eligible: boolean;
  reason: string | null;
  student_name: string;
  details: string | null;
  // Student info
  student_id: number | null;
  school_student_id: string | null;
  grade: string | null;
  lang_stream: string | null;
  school: string | null;
  // Schedule info
  assigned_day: string | null;
  assigned_time: string | null;
  suggested_first_lesson_date: string | null;
  // Override
  overridable: boolean;
}

interface BatchRenewResult {
  original_enrollment_id: number;
  new_enrollment_id: number | null;
  success: boolean;
  error: string | null;
}

interface BatchRenewModalProps {
  isOpen: boolean;
  onClose: () => void;
  enrollmentIds: number[];
  onSuccess: () => void;
}

type ModalStep = "checking" | "results" | "creating" | "done";

const REASON_LABELS: Record<string, string> = {
  pending_makeups: "Pending Makeups",
  conflicts: "Schedule Conflicts",
  extension_pending: "Pending Extension",
  invalid_data: "Invalid Data",
};

const REASON_COLORS: Record<string, string> = {
  pending_makeups: "text-orange-600 dark:text-orange-400",
  conflicts: "text-red-600 dark:text-red-400",
  extension_pending: "text-blue-600 dark:text-blue-400",
  invalid_data: "text-gray-600 dark:text-gray-400",
};

// Animation variants
const itemVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
    }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15 }
  },
};

function ScheduleInfo({ item }: { item: EligibilityResult }) {
  if (!item.assigned_day || !item.assigned_time) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-foreground/60 mt-0.5">
      <span>{item.assigned_day}</span>
      <span>·</span>
      <Clock className="h-3 w-3" />
      <span>{item.assigned_time}</span>
      {item.suggested_first_lesson_date && (
        <>
          <span>·</span>
          <Calendar className="h-3 w-3" />
          <span>Starts {formatShortDate(item.suggested_first_lesson_date)}</span>
        </>
      )}
    </div>
  );
}

export function BatchRenewModal({
  isOpen,
  onClose,
  enrollmentIds,
  onSuccess,
}: BatchRenewModalProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState<ModalStep>("checking");
  const [eligible, setEligible] = useState<EligibilityResult[]>([]);
  const [ineligible, setIneligible] = useState<EligibilityResult[]>([]);
  const [overriddenIds, setOverriddenIds] = useState<Set<number>>(new Set());
  const [createdCount, setCreatedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [renewResults, setRenewResults] = useState<BatchRenewResult[]>([]);
  const [lessonsPaid, setLessonsPaid] = useState(6);
  const [lastOverriddenId, setLastOverriddenId] = useState<number | null>(null);
  const [lastUncheckedId, setLastUncheckedId] = useState<number | null>(null);
  const eligibleListRef = useRef<HTMLDivElement>(null);
  const ineligibleListRef = useRef<HTMLDivElement>(null);

  // Compute final lists based on overrides
  const finalEligible = useMemo(() => {
    const overriddenItems = ineligible.filter(item => overriddenIds.has(item.enrollment_id));
    return [...eligible, ...overriddenItems];
  }, [eligible, ineligible, overriddenIds]);

  const finalIneligible = useMemo(() => {
    return ineligible.filter(item => !overriddenIds.has(item.enrollment_id));
  }, [ineligible, overriddenIds]);

  // Check eligibility when modal opens
  useEffect(() => {
    if (isOpen && enrollmentIds.length > 0) {
      checkEligibility();
    }
    // Reset state when modal closes
    if (!isOpen) {
      setStep("checking");
      setEligible([]);
      setIneligible([]);
      setOverriddenIds(new Set());
      setCreatedCount(0);
      setFailedCount(0);
      setRenewResults([]);
      setLessonsPaid(6);
      setLastOverriddenId(null);
      setLastUncheckedId(null);
    }
  }, [isOpen, enrollmentIds]);

  const checkEligibility = async () => {
    setStep("checking");
    try {
      const response = await enrollmentsAPI.batchRenewCheck(enrollmentIds);
      setEligible(response.eligible);
      setIneligible(response.ineligible);
      setStep("results");
    } catch (error) {
      console.error("Eligibility check failed:", error);
      showToast("Failed to check eligibility", "error");
      onClose();
    }
  };

  const handleToggleOverride = (enrollmentId: number) => {
    setOverriddenIds(prev => {
      const next = new Set(prev);
      if (next.has(enrollmentId)) {
        next.delete(enrollmentId);
        setLastOverriddenId(null);
        setLastUncheckedId(enrollmentId);
      } else {
        next.add(enrollmentId);
        setLastOverriddenId(enrollmentId);
        setLastUncheckedId(null);
      }
      return next;
    });
  };

  // Auto-scroll to newly overridden item in eligible list
  useEffect(() => {
    if (lastOverriddenId && eligibleListRef.current) {
      // Longer delay to ensure DOM is updated after animation starts
      setTimeout(() => {
        const container = eligibleListRef.current;
        if (container) {
          // Scroll to bottom where new overridden items appear
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 300);
    }
  }, [lastOverriddenId]);

  // Auto-scroll to unchecked item in ineligible list
  useEffect(() => {
    if (lastUncheckedId && ineligibleListRef.current) {
      setTimeout(() => {
        const element = ineligibleListRef.current?.querySelector(
          `[data-enrollment-id="${lastUncheckedId}"]`
        );
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [lastUncheckedId]);

  const handleConfirmRenew = async () => {
    if (finalEligible.length === 0) return;

    setStep("creating");
    try {
      const eligibleIds = finalEligible.map((e) => e.enrollment_id);

      // Re-validate eligibility before creating to catch any changes since modal opened
      const freshCheck = await enrollmentsAPI.batchRenewCheck(eligibleIds);
      const newlyIneligible = freshCheck.ineligible.filter(
        item => eligibleIds.includes(item.enrollment_id)
      );

      if (newlyIneligible.length > 0) {
        // Some items became ineligible - refresh and notify user
        showToast(
          `${newlyIneligible.length} enrollment${newlyIneligible.length > 1 ? "s" : ""} became ineligible. Please review.`,
          "info"
        );
        // Refresh the eligibility lists
        setEligible(freshCheck.eligible);
        setIneligible(freshCheck.ineligible);
        setOverriddenIds(new Set()); // Clear overrides since state changed
        setStep("results");
        return;
      }

      const response = await enrollmentsAPI.batchRenew(eligibleIds, lessonsPaid);
      setCreatedCount(response.created_count);
      setFailedCount(response.failed_count);
      setRenewResults(response.results);
      setStep("done");

      if (response.created_count > 0) {
        showToast(
          `Created ${response.created_count} renewal enrollment${response.created_count > 1 ? "s" : ""}`,
          "success"
        );
      }
      if (response.failed_count > 0) {
        showToast(
          `${response.failed_count} renewal${response.failed_count > 1 ? "s" : ""} failed`,
          "error"
        );
      }
    } catch (error) {
      console.error("Batch renew failed:", error);
      showToast("Failed to create renewals", "error");
      setStep("results");
    }
  };

  const handleClose = () => {
    if (step === "done" && createdCount > 0) {
      onSuccess();
    }
    onClose();
  };

  const handleLessonsChange = (delta: number) => {
    setLessonsPaid(prev => Math.max(1, Math.min(52, prev + delta)));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-2">
          <RefreshCcw className="h-5 w-5 text-primary" />
          <span>Batch Renewal</span>
        </div>
      }
      size="lg"
      persistent={step === "checking" || step === "creating"}
    >
      <div className="p-4 space-y-4">
        {/* Checking step */}
        {step === "checking" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-foreground/60">
              Checking eligibility for {enrollmentIds.length} enrollment
              {enrollmentIds.length > 1 ? "s" : ""}...
            </p>
          </div>
        )}

        {/* Results step */}
        {step === "results" && (
          <LayoutGroup>
            {/* Summary - animated counts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <motion.div
                layout
                className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <motion.span
                    key={finalEligible.length}
                    initial={{ scale: 1.2 }}
                    animate={{ scale: 1 }}
                    className="text-sm font-medium text-green-700 dark:text-green-300"
                  >
                    {finalEligible.length} Ready to Renew
                  </motion.span>
                </div>
              </motion.div>
              <motion.div
                layout
                className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <motion.span
                    key={finalIneligible.length}
                    initial={{ scale: 1.2 }}
                    animate={{ scale: 1 }}
                    className="text-sm font-medium text-amber-700 dark:text-amber-300"
                  >
                    {finalIneligible.length} Need Attention
                  </motion.span>
                </div>
              </motion.div>
            </div>

            {/* Ineligible list - with override checkboxes */}
            <AnimatePresence mode="popLayout">
              {finalIneligible.length > 0 && (
                <motion.div
                  layout
                  className="space-y-2"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <h4 className="text-sm font-medium text-foreground/80">
                    Cannot auto-renew:
                  </h4>
                  <div ref={ineligibleListRef} className="max-h-36 sm:max-h-48 overflow-y-auto space-y-1.5">
                    <AnimatePresence mode="popLayout">
                      {finalIneligible.map((item) => (
                        <motion.div
                          key={item.enrollment_id}
                          layoutId={`renewal-item-${item.enrollment_id}`}
                          layout
                          data-enrollment-id={item.enrollment_id}
                          variants={itemVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className="flex items-start gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm"
                        >
                          {/* Override checkbox for overridable items */}
                          {item.overridable && (
                            <motion.input
                              type="checkbox"
                              checked={overriddenIds.has(item.enrollment_id)}
                              onChange={() => handleToggleOverride(item.enrollment_id)}
                              whileTap={{ scale: 0.9 }}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-transform"
                              title="Override and include in renewal"
                            />
                          )}
                          {!item.overridable && (
                            <div className="mt-1 w-4" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <StudentInfoBadges
                                student={{
                                  student_id: item.student_id || undefined,
                                  student_name: item.student_name,
                                  school_student_id: item.school_student_id || undefined,
                                  grade: item.grade || undefined,
                                  lang_stream: item.lang_stream || undefined,
                                  school: item.school || undefined,
                                }}
                              />
                              <span
                                className={cn(
                                  "text-xs flex-shrink-0",
                                  REASON_COLORS[item.reason || ""] || "text-gray-500"
                                )}
                              >
                                {REASON_LABELS[item.reason || ""] || item.reason}
                              </span>
                            </div>
                            {item.details && (
                              <p className="text-xs text-foreground/50 mt-0.5">{item.details}</p>
                            )}
                            <ScheduleInfo item={item} />
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                  {finalIneligible.some(i => i.overridable) && (
                    <p className="text-xs text-foreground/50 italic">
                      Check the box to override and include in renewal
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Eligible list - with schedule preview */}
            <AnimatePresence mode="popLayout">
              {finalEligible.length > 0 && (
                <motion.div
                  layout
                  className="space-y-2"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <h4 className="text-sm font-medium text-foreground/80">
                    Ready to renew:
                  </h4>
                  <div ref={eligibleListRef} className="max-h-36 sm:max-h-48 overflow-y-auto space-y-1.5">
                    <AnimatePresence mode="popLayout">
                      {finalEligible.map((item) => {
                        const isOverridden = overriddenIds.has(item.enrollment_id);
                        return (
                          <motion.div
                            key={item.enrollment_id}
                            layoutId={`renewal-item-${item.enrollment_id}`}
                            layout
                            data-enrollment-id={item.enrollment_id}
                            variants={itemVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className={cn(
                              "flex items-start gap-2 px-3 py-2 rounded-lg text-sm",
                              isOverridden
                                ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                                : "bg-green-50 dark:bg-green-900/20"
                            )}
                          >
                            {/* Checkbox for overridden items (can uncheck), CheckCircle for original eligible */}
                            {isOverridden ? (
                              <motion.input
                                type="checkbox"
                                checked={true}
                                onChange={() => handleToggleOverride(item.enrollment_id)}
                                whileTap={{ scale: 0.9 }}
                                className="mt-1 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer transition-transform"
                                title="Uncheck to remove from renewal"
                              />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <StudentInfoBadges
                                  student={{
                                    student_id: item.student_id || undefined,
                                    student_name: item.student_name,
                                    school_student_id: item.school_student_id || undefined,
                                    grade: item.grade || undefined,
                                    lang_stream: item.lang_stream || undefined,
                                    school: item.school || undefined,
                                  }}
                                />
                                {isOverridden && (
                                  <motion.span
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="text-xs px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200"
                                  >
                                    Override
                                  </motion.span>
                                )}
                              </div>
                              <ScheduleInfo item={item} />
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Lessons configuration */}
            {finalEligible.length > 0 && (
              <motion.div
                layout
                className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 pt-2 border-t border-gray-200 dark:border-gray-700"
              >
                <label className="text-sm text-foreground/70">
                  Lessons per renewal:
                </label>
                <div className="flex items-center gap-1">
                  <motion.button
                    onClick={() => handleLessonsChange(-1)}
                    disabled={lessonsPaid <= 1}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </motion.button>
                  <input
                    type="number"
                    value={lessonsPaid}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 1 && val <= 52) {
                        setLessonsPaid(val);
                      }
                    }}
                    min={1}
                    max={52}
                    className="w-16 px-2 py-1.5 text-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <motion.button
                    onClick={() => handleLessonsChange(1)}
                    disabled={lessonsPaid >= 52}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </LayoutGroup>
        )}

        {/* Creating step */}
        {step === "creating" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-foreground/60">
              Creating {finalEligible.length} renewal
              {finalEligible.length > 1 ? "s" : ""}...
            </p>
          </div>
        )}

        {/* Done step */}
        {step === "done" && (
          <div className="flex flex-col items-center py-8 gap-4">
            {createdCount > 0 ? (
              <>
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <div className="text-center">
                  <p className="text-lg font-medium">
                    {createdCount} Renewal{createdCount > 1 ? "s" : ""} Created
                  </p>
                  {/* Show successful student names */}
                  <div className="mt-2 text-sm text-foreground/60">
                    {renewResults
                      .filter(r => r.success)
                      .slice(0, 5)
                      .map(r => {
                        const item = finalEligible.find(e => e.enrollment_id === r.original_enrollment_id);
                        return item?.student_name;
                      })
                      .filter(Boolean)
                      .join(", ")}
                    {createdCount > 5 && ` +${createdCount - 5} more`}
                  </div>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="h-12 w-12 text-amber-500" />
                <p className="text-lg font-medium">No renewals created</p>
              </>
            )}

            {/* Show failed items with details */}
            {failedCount > 0 && (
              <div className="w-full mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    {failedCount} Failed
                  </span>
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {renewResults
                    .filter(r => !r.success)
                    .map(r => {
                      const item = finalEligible.find(e => e.enrollment_id === r.original_enrollment_id);
                      return (
                        <div key={r.original_enrollment_id} className="text-sm">
                          <span className="font-medium text-foreground/80">
                            {item?.student_name || `Enrollment #${r.original_enrollment_id}`}
                          </span>
                          {r.error && (
                            <span className="text-foreground/50"> — {r.error}</span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {(step === "results" || step === "done") && (
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {step === "results" && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-foreground/70 hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <motion.button
                onClick={handleConfirmRenew}
                disabled={finalEligible.length === 0}
                whileHover={finalEligible.length > 0 ? { scale: 1.02 } : undefined}
                whileTap={finalEligible.length > 0 ? { scale: 0.98 } : undefined}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  finalEligible.length > 0
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed"
                )}
              >
                <RefreshCcw className="h-4 w-4" />
                Renew {finalEligible.length} Enrollment{finalEligible.length !== 1 ? "s" : ""}
              </motion.button>
            </>
          )}
          {step === "done" && (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
