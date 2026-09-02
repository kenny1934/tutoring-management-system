"use client";

import { motion } from "framer-motion";
import { StickyNote } from "lucide-react";
import type { HandoverProspect } from "@/types";
import { formatShortDate } from "@/lib/formatters";
import { formatProspectCode } from "@/lib/summer-utils";

interface HandoverBannerProps {
  prospect: HandoverProspect;
}

/**
 * The note a primary-branch tutor wrote when they handed this student up, shown
 * on the session page the first time this tutor teaches them.
 *
 * The student reaches us either through a summer application or straight through
 * a regular one, and the note reads the same either way, so nothing here cares
 * which route it was. The session popover shows a tighter version of the same
 * thing; this one has room for the parent's preferences and the sibling note as
 * well, which are the other things worth knowing before you meet a new student.
 */
export function HandoverBanner({ prospect }: HandoverBannerProps) {
  const extras = [
    { label: "Sibling info", value: prospect.sibling_info },
    { label: "Preferred tutor", value: prospect.preferred_tutor_note },
    { label: "Preferred time", value: prospect.preferred_time_note },
  ].filter((e) => e.value && e.value.trim().length > 0);

  const code = formatProspectCode(prospect.source_branch, prospect.primary_student_id);
  const byline = [
    prospect.tutor_name ? `Written by ${prospect.tutor_name}` : null,
    prospect.submitted_at ? formatShortDate(prospect.submitted_at) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40 border-4 border-amber-400 dark:border-amber-600 rounded-lg shadow-lg desk-shadow-medium overflow-hidden"
    >
      {/* Paper texture, so the note sits with the rest of the desk */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23paper)' opacity='0.5'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="absolute top-0 right-0 w-0 h-0 border-t-[30px] border-t-amber-600 dark:border-t-amber-700 border-l-[30px] border-l-transparent" />

      <div className="relative p-3 sm:p-5">
        <div className="flex items-center gap-2 sm:gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-amber-500 dark:bg-amber-600 rounded-full shadow-md shrink-0">
            <StickyNote className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-amber-900 dark:text-amber-100 uppercase tracking-wide">
              First lesson — handover from {code}
              {prospect.student_name && ` ${prospect.student_name}`}
            </h3>
            {byline && (
              <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-300">
                {byline}
              </p>
            )}
          </div>
        </div>

        {prospect.tutor_remark && prospect.tutor_remark.trim().length > 0 ? (
          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {prospect.tutor_remark}
          </p>
        ) : (
          <p className="text-sm italic text-gray-500 dark:text-gray-400">
            No handover notes were left.
          </p>
        )}

        {extras.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {extras.map((e) => (
              <div key={e.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200 mb-0.5">
                  {e.label}
                </p>
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {e.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
