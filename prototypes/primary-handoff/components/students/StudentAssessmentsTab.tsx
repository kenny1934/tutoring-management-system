"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  GraduationCap,
  Phone,
  Quote,
  TrendingUp,
  ArrowUpRight,
  ClipboardList,
} from "lucide-react";
import type { Assessment } from "@/lib/types";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";

/** "Assessment" on the student detail page == the originating funnel
 *  record. Same noun as `/assessments` (prospect intake): the booked
 *  evaluation session that produced an entry score, a tutor read, and a
 *  conversion decision. Re-assessments would also land here once we
 *  model them. */
export function StudentAssessmentsTab() {
  const { id } = useParams<{ id: string }>();
  const { assessments } = usePrimaryStore();

  const linked = useMemo(
    () =>
      assessments
        .filter((a) => a.studentId === id)
        .sort((a, b) => b.bookedFor.localeCompare(a.bookedFor)),
    [assessments, id]
  );

  if (linked.length === 0) {
    return (
      <div className="surface p-10 text-center text-sm text-ink-500 max-w-3xl">
        <ClipboardList className="h-6 w-6 mx-auto mb-2 text-ink-300" />
        <div className="text-ink-700 font-medium">No assessment on file</div>
        <p className="mt-1">
          This student joined before assessment tracking, or the funnel
          record wasn&apos;t linked. New intakes get logged on the{" "}
          <Link
            href="/assessments"
            className="text-mc-red-700 hover:underline"
          >
            Assessment board
          </Link>
          .
        </p>
      </div>
    );
  }

  const [entry, ...laters] = linked;

  return (
    <div className="space-y-4 max-w-3xl">
      <AssessmentCard assessment={entry} role="entry" />
      {laters.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-900">
            Later assessments
          </h2>
          {laters.map((a) => (
            <AssessmentCard key={a.id} assessment={a} role="later" />
          ))}
        </section>
      )}
    </div>
  );
}

function AssessmentCard({
  assessment,
  role,
}: {
  assessment: Assessment;
  role: "entry" | "later";
}) {
  const scoreTone =
    typeof assessment.scorePct !== "number"
      ? "bg-ink-100 text-ink-600"
      : assessment.scorePct >= 80
        ? "bg-emerald-100 text-emerald-700"
        : assessment.scorePct >= 65
          ? "bg-amber-100 text-amber-700"
          : "bg-rose-100 text-rose-700";

  return (
    <div className="surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-ink-500">
            {role === "entry" ? "Entry assessment" : "Re-assessment"}
          </div>
          <div className="mt-1 text-sm text-ink-900 flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-ink-400" />
            {formatDateTime(assessment.bookedFor)}
          </div>
        </div>
        <div
          className={`text-sm rounded-md px-2 py-1 font-semibold ${scoreTone}`}
        >
          {typeof assessment.scorePct === "number"
            ? `${assessment.scorePct}%`
            : "Not scored"}
        </div>
      </div>

      <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs text-ink-600">
        <Field
          icon={<GraduationCap className="h-3.5 w-3.5 text-ink-400" />}
          label="Grade at intake"
          value={assessment.childGrade}
        />
        <Field
          icon={<TrendingUp className="h-3.5 w-3.5 text-ink-400" />}
          label="Source"
          value={assessment.source}
        />
        {assessment.assessingTutorName && (
          <Field
            icon={<ClipboardList className="h-3.5 w-3.5 text-ink-400" />}
            label="Assessed by"
            value={assessment.assessingTutorName}
          />
        )}
        <Field
          icon={<Phone className="h-3.5 w-3.5 text-ink-400" />}
          label="Guardian at intake"
          value={`${assessment.guardianName} · ${assessment.guardianContact}`}
        />
      </div>

      {assessment.notes && (
        <div className="mt-3 text-sm text-ink-700 bg-ink-50 rounded-md px-3 py-2 flex items-start gap-2">
          <Quote className="h-3.5 w-3.5 text-ink-400 mt-1 shrink-0" />
          <span>{assessment.notes}</span>
        </div>
      )}

      <Link
        href={`/assessments?focus=${assessment.id}`}
        className="mt-3 inline-flex items-center gap-1 text-xs text-mc-red-700 hover:underline"
      >
        View on Assessment board
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-1.5">
      {icon}
      <div>
        <div className="text-ink-500">{label}</div>
        <div className="text-ink-800">{value}</div>
      </div>
    </div>
  );
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-HK", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
