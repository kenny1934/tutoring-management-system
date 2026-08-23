"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useProspectMatches } from "@/lib/hooks";
import type { LucideIcon } from "lucide-react";
import {
  Link2,
  Phone,
  School,
  User,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  Clock,
} from "lucide-react";
import { useOverlayLayer } from "@/hooks/useOverlayLayer";
import { useStableKeyboardHandler } from "@/hooks/useStableKeyboardHandler";
import { applicationSearchHref, prospectsAPI } from "@/lib/api";
import { parseHKTimestamp } from "@/lib/formatters";
import { BRANCH_INFO } from "@/lib/summer-utils";
import {
  IntentionBadge,
  BranchBadges,
  OutreachBadge,
  ProspectStatusBadge,
  CourseStateBadge,
  StudentCodeBadge,
  OUTREACH_OPTIONS,
  STATUS_OPTIONS,
} from "@/components/summer/prospect-badges";
import { StatusBadge as ApplicationStatusBadge } from "@/components/admin/SummerApplicationCard";
import type {
  PrimaryProspect,
  PrimaryProspectMatchResult,
  ProspectCourse,
  ProspectOutreachStatus,
  ProspectStatus,
} from "@/types";
import { OUTREACH_STATUS_HINTS } from "@/types";

const inputSmall =
  "text-xs border-2 border-border rounded-lg px-2 py-1.5 bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-colors duration-200";

export function ProspectDetailModal({
  prospect,
  onClose,
  onSave,
  siblings,
  onNavigate,
  readOnly = false,
}: {
  prospect: PrimaryProspect;
  onClose: () => void;
  onSave: () => void;
  siblings?: PrimaryProspect[];
  onNavigate?: (next: PrimaryProspect) => void;
  readOnly?: boolean;
}) {
  const idx = siblings ? siblings.findIndex((p) => p.id === prospect.id) : -1;
  const canNavigate = siblings && onNavigate && idx >= 0;
  const goPrev = canNavigate && idx > 0 ? () => onNavigate!(siblings![idx - 1]) : null;
  const goNext = canNavigate && idx < siblings!.length - 1 ? () => onNavigate!(siblings![idx + 1]) : null;

  // Mounting is opening here, so the layer lasts as long as the component.
  // The application modals stack this one on top of themselves, and only the
  // stack can tell either of them apart from the other's keypresses. Scroll is
  // already frozen by whatever opened this.
  const { isTopmost, zIndex } = useOverlayLayer(true);

  // Keyboard navigation: ← / → to flip prospects, Escape to close.
  // Arrow keys are ignored while focus is in an input/textarea/select.
  // Suspended whenever something is stacked above, so the keys reach it alone.
  useStableKeyboardHandler((e) => {
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (e.key === "ArrowLeft" && goPrev) { e.preventDefault(); goPrev(); }
    else if (e.key === "ArrowRight" && goNext) { e.preventDefault(); goNext(); }
    else if (e.key === "Escape") onClose();
  }, isTopmost);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [outreachStatus, setOutreachStatus] = useState(prospect.outreach_status);
  const [status, setStatus] = useState(prospect.status);
  const [contactNotes, setContactNotes] = useState(prospect.contact_notes || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Reset local form state when navigating to a different prospect (no remount).
  useEffect(() => {
    setOutreachStatus(prospect.outreach_status);
    setStatus(prospect.status);
    setContactNotes(prospect.contact_notes || "");
    setSaveError(null);
    setShowHistory(false);
  }, [prospect.id]);

  const hasChanges = outreachStatus !== prospect.outreach_status
    || status !== prospect.status
    || (contactNotes || "") !== (prospect.contact_notes || "");

  // Both go through the shared hook, so the list's quick-link popover reuses
  // whichever of these has already loaded. Neither fetches for a course the
  // prospect is already linked to.
  const { data: matchResult } = useProspectMatches(
    prospect.id,
    "summer",
    !prospect.summer_application_id,
  );
  const { data: regularMatchResult } = useProspectMatches(
    prospect.id,
    "regular",
    !prospect.regular_application_id,
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await prospectsAPI.adminUpdate(prospect.id, {
        outreach_status: outreachStatus,
        status,
        contact_notes: contactNotes || undefined,
      });
      onSave();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Link (applicationId) and unlink (null) share one save flow.
  const handleLink = async (course: ProspectCourse, applicationId: number | null) => {
    setSaveError(null);
    try {
      await prospectsAPI.linkCourseApplication(prospect.id, course, applicationId);
      onSave();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Update failed");
    }
  };

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      <motion.div
        key="prospect-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ zIndex }}
        className="fixed inset-0 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={() => { if (isTopmost) onClose(); }}
        role="dialog"
        aria-modal="true"
        aria-label={`Prospect details: ${prospect.student_name}`}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="bg-background rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="bg-gradient-to-r from-primary/10 to-transparent p-6 pb-4 rounded-t-2xl">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground">{prospect.student_name}</h2>
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${BRANCH_INFO[prospect.source_branch]?.badge || "bg-gray-100"}`}>{prospect.source_branch}</span>
                {prospect.primary_student_id || "No ID"} &middot; {prospect.grade}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {canNavigate && (
                <>
                  <button
                    onClick={goPrev ?? undefined}
                    disabled={!goPrev}
                    aria-label="Previous prospect"
                    title="Previous (←)"
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-background/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-xs text-muted-foreground tabular-nums px-1">
                    {idx + 1} / {siblings!.length}
                  </span>
                  <button
                    onClick={goNext ?? undefined}
                    disabled={!goNext}
                    aria-label="Next prospect"
                    title="Next (→)"
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-background/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
              <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <InfoItem icon={School} label="School" value={prospect.school} />
            <InfoItem icon={User} label="Tutor" value={prospect.tutor_name} />
            <InfoItem icon={Phone} label="Phone 1" value={prospect.phone_1 ? `${prospect.phone_1}${prospect.phone_1_relation ? ` (${prospect.phone_1_relation})` : ""}` : null} />
            <InfoItem icon={Phone} label="Phone 2" value={prospect.phone_2 ? `${prospect.phone_2}${prospect.phone_2_relation ? ` (${prospect.phone_2_relation})` : ""}` : null} />
            <InfoItem icon={MessageSquare} label="WeChat" value={prospect.wechat_id} />
            <div className="flex items-start gap-2.5 text-sm">
              <School className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Branch Choice</div>
                <BranchBadges branches={prospect.preferred_branches || []} />
              </div>
            </div>
            <InfoItem icon={Clock} label="Time / Tutor Pref" value={[prospect.preferred_time_note, prospect.preferred_tutor_note].filter(Boolean).join(" / ") || null} />
          </div>

          {prospect.tutor_remark && (
            <div className="border-l-4 border-primary/30 bg-primary/5 rounded-r-xl p-4">
              <div className="text-[10px] font-semibold text-primary/60 uppercase tracking-wider mb-1">Tutor Remark</div>
              <p className="text-sm text-foreground">{prospect.tutor_remark}</p>
            </div>
          )}

          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Wants Summer?</span>
              <IntentionBadge value={prospect.wants_summer} />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Wants Regular (Sept)?</span>
              <IntentionBadge value={prospect.wants_regular} />
            </div>
          </div>

          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Summer</span>
              <CourseStateBadge state={prospect.summer_state} />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Regular (Sept)</span>
              <CourseStateBadge state={prospect.regular_state} />
            </div>
          </div>

          <div className="border-t border-border pt-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Outreach Status</label>
                {readOnly ? (
                  <div className="py-1"><OutreachBadge status={outreachStatus} /></div>
                ) : (
                  <select
                    value={outreachStatus}
                    onChange={(e) => setOutreachStatus(e.target.value as ProspectOutreachStatus)}
                    className={`w-full ${inputSmall}`}
                  >
                    {OUTREACH_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-muted-foreground mt-1 italic">
                  {OUTREACH_STATUS_HINTS[outreachStatus as ProspectOutreachStatus]}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Status</label>
                {readOnly ? (
                  <div className="py-1"><ProspectStatusBadge status={status} /></div>
                ) : (
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProspectStatus)}
                    className={`w-full ${inputSmall}`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Contact Notes</label>
              {readOnly ? (
                contactNotes ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{contactNotes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No contact notes.</p>
                )
              ) : (
                <textarea
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  className={`w-full ${inputSmall} resize-y`}
                  rows={2}
                  placeholder="Internal notes about contacting this parent..."
                />
              )}
            </div>

            {saveError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{saveError}</span>
                <button onClick={() => setSaveError(null)} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {!readOnly && (
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="w-full py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm font-medium transition-colors duration-200"
              >
                {saving ? "Saving..." : hasChanges ? "Save Changes" : "No Changes"}
              </button>
            )}
          </div>

          {prospect.summer_application_id ? (
            <LinkedAppBlock
              key={`summer-link-${prospect.id}`}
              title="Linked Summer Application"
              refCode={prospect.matched_application_ref}
              appStatus={prospect.matched_application_status}
              studentCode={prospect.matched_student_code}
              studentId={prospect.matched_student_id}
              viewHref={applicationSearchHref("summer", prospect.matched_application_ref)}
              onUnlink={() => handleLink("summer", null)}
              readOnly={readOnly}
            />
          ) : matchResult && matchResult.matches.length > 0 ? (
            <MatchList
              title={`Potential Summer Matches (${matchResult.matches.length})`}
              matches={matchResult.matches}
              onLink={(id) => handleLink("summer", id)}
              readOnly={readOnly}
            />
          ) : null}

          {prospect.regular_application_id ? (
            <LinkedAppBlock
              key={`regular-link-${prospect.id}`}
              title="Linked Regular Application"
              refCode={prospect.matched_regular_ref}
              appStatus={prospect.matched_regular_status}
              studentCode={prospect.matched_regular_student_code}
              studentId={prospect.matched_regular_student_id}
              viewHref={applicationSearchHref("regular", prospect.matched_regular_ref)}
              onUnlink={() => handleLink("regular", null)}
              readOnly={readOnly}
            />
          ) : regularMatchResult && regularMatchResult.matches.length > 0 ? (
            <MatchList
              title={`Potential Regular Matches (${regularMatchResult.matches.length})`}
              matches={regularMatchResult.matches}
              onLink={(id) => handleLink("regular", id)}
              readOnly={readOnly}
            />
          ) : null}

          {prospect.edit_history && prospect.edit_history.length > 0 && (
            <div className="border-t border-border pt-4">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Edit History ({prospect.edit_history.length})
              </button>
              {showHistory && (
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {prospect.edit_history.map((h, i) => (
                    <div key={i} className="text-xs text-muted-foreground font-mono">
                      {parseHKTimestamp(h.timestamp).toLocaleString()} — {h.field}: {h.old_value ?? "null"} &rarr; {h.new_value ?? "null"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
    </AnimatePresence>,
    document.body
  );
}

function LinkedAppBlock({
  title,
  refCode,
  appStatus,
  studentCode,
  studentId,
  viewHref,
  onUnlink,
  readOnly,
}: {
  title: string;
  refCode: string | null;
  appStatus: string | null;
  /** The enrolled student's MSA/MSB code + id; unset until an enrollment
   *  publishes. The badge deep-links to the student page. */
  studentCode?: string | null;
  studentId?: number | null;
  viewHref: string;
  onUnlink: () => void;
  readOnly: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className="border-t border-border pt-5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</div>
      <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium">{refCode}</span>
          {appStatus && <ApplicationStatusBadge status={appStatus} />}
          {studentCode && studentId && (
            <a
              href={`/students/${studentId}?tab=profile`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Open student page"
              className="hover:opacity-80 transition-opacity"
            >
              <StudentCodeBadge code={studentCode} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a href={viewHref} className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            View &rarr;
          </a>
          {!readOnly && (
            <button
              onClick={() => {
                if (!confirming) {
                  setConfirming(true);
                  clearTimeout(timerRef.current);
                  timerRef.current = setTimeout(() => setConfirming(false), 3000);
                  return;
                }
                clearTimeout(timerRef.current);
                setConfirming(false);
                onUnlink();
              }}
              className={`text-xs font-medium transition-colors ${confirming ? "bg-red-500 text-white px-2 py-0.5 rounded" : "text-red-600 hover:text-red-700"}`}
            >
              {confirming ? "Sure? Click again" : "Unlink"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchList({
  title,
  matches,
  onLink,
  readOnly,
}: {
  title: string;
  matches: PrimaryProspectMatchResult["matches"];
  onLink: (applicationId: number) => void;
  readOnly: boolean;
}) {
  return (
    <div className="border-t border-border pt-5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</div>
      <div className="space-y-2">
        {matches.map((m) => (
          <div
            key={m.application_id}
            className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-4 flex items-center justify-between"
          >
            <div>
              <span className="text-sm font-medium">{m.student_name}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {m.reference_code} &middot; {m.contact_phone} &middot; {m.match_type}
              </span>
            </div>
            {!readOnly && (
              <button
                onClick={() => onLink(m.application_id)}
                className="inline-flex items-center gap-1.5 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 font-medium transition-colors"
              >
                <Link2 className="h-3 w-3" />
                Link
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
      <div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="font-medium text-foreground">{value || "-"}</div>
      </div>
    </div>
  );
}
