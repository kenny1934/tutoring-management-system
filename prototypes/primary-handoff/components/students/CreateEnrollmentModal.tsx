"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  CalendarPlus,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  usePrimaryStore,
  type CreateEnrollmentInput,
} from "@/lib/store/PrimaryStore";
import { tutors, rooms } from "@/lib/mock-data/sessions";
import type {
  EnrollmentType,
  Student,
  WeekdayNum,
} from "@/lib/types";
import {
  computeFee,
  effectiveEndDate,
  generateSessions,
  sessionCountFor,
  weekdayLabel,
} from "@/lib/enrollment-utils";

type Props = {
  student: Student;
  defaultFirstLessonDate?: string;
  onClose: () => void;
  onCreated?: (enrollmentId: string) => void;
};

const ENROLLMENT_TYPES: { id: EnrollmentType; label: string; hint: string }[] = [
  {
    id: "Regular",
    label: "Regular",
    hint: "Weekly package · HK$250 per lesson",
  },
  {
    id: "Assessment",
    label: "Assessment",
    hint: "Single trial lesson · HK$200 flat",
  },
  {
    id: "One-Time",
    label: "One-Time",
    hint: "Drop-in lesson · HK$250",
  },
];

const WEEKDAYS: WeekdayNum[] = [1, 2, 3, 4, 5, 6, 7];

export function CreateEnrollmentModal({
  student,
  defaultFirstLessonDate,
  onClose,
  onCreated,
}: Props) {
  const { createEnrollment } = usePrimaryStore();

  const defaults = {
    tutorId: tutors[0].id,
    enrollmentType: "Regular" as EnrollmentType,
    assignedDay: 2 as WeekdayNum,
    assignedTime: "16:00",
    durationMins: 60,
    room: rooms[2],
    firstLessonDate: defaultFirstLessonDate ?? "2026-06-02",
    lessonsPaid: 8,
    isNewStudent: false,
    discount: 0,
    remark: "",
  };

  const [tutorId, setTutorId] = useState(defaults.tutorId);
  const [enrollmentType, setEnrollmentType] = useState<EnrollmentType>(
    defaults.enrollmentType
  );
  const [assignedDay, setAssignedDay] = useState<WeekdayNum>(defaults.assignedDay);
  const [assignedTime, setAssignedTime] = useState(defaults.assignedTime);
  const [durationMins, setDurationMins] = useState(defaults.durationMins);
  const [room, setRoom] = useState(defaults.room);
  const [firstLessonDate, setFirstLessonDate] = useState(
    defaults.firstLessonDate
  );
  const [lessonsPaid, setLessonsPaid] = useState(defaults.lessonsPaid);
  const [isNewStudent, setIsNewStudent] = useState(defaults.isNewStudent);
  const [discount, setDiscount] = useState(defaults.discount);
  const [remark, setRemark] = useState(defaults.remark);

  const dialogRef = useRef<HTMLDivElement>(null);
  // Pristine = nothing changed from the initial values; controls backdrop close.
  const dirty =
    tutorId !== defaults.tutorId ||
    enrollmentType !== defaults.enrollmentType ||
    assignedDay !== defaults.assignedDay ||
    assignedTime !== defaults.assignedTime ||
    durationMins !== defaults.durationMins ||
    room !== defaults.room ||
    firstLessonDate !== defaults.firstLessonDate ||
    lessonsPaid !== defaults.lessonsPaid ||
    isNewStudent !== defaults.isNewStudent ||
    discount !== defaults.discount ||
    remark !== defaults.remark;

  // Restore focus to whatever was focused before the modal opened, and move
  // focus into the dialog on open.
  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    dialogRef.current
      ?.querySelector<HTMLElement>(
        'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
      )
      ?.focus();
    return () => prevFocused?.focus?.();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const onBackdrop = () => {
    if (!dirty) onClose();
  };

  const preview = useMemo(
    () =>
      generateSessions({
        enrollmentType,
        firstLessonDate,
        assignedDay,
        lessonsPaid,
      }),
    [enrollmentType, firstLessonDate, assignedDay, lessonsPaid]
  );

  const endDate = effectiveEndDate(preview);
  const skipped = preview.filter((p) => p.kind === "skipped");
  const fee = computeFee({
    enrollmentType,
    lessonsPaid,
    isNewStudent,
    discount,
  });

  const tutor = tutors.find((t) => t.id === tutorId)!;
  const sessionCount = sessionCountFor(enrollmentType, lessonsPaid);

  const submit = () => {
    const input: CreateEnrollmentInput = {
      student_id: student.id,
      tutor_id: tutorId,
      tutor_name: tutor.name,
      enrollment_type: enrollmentType,
      assigned_day: assignedDay,
      assigned_time: assignedTime,
      duration_mins: durationMins,
      room,
      first_lesson_date: firstLessonDate,
      lessons_paid: lessonsPaid,
      is_new_student: isNewStudent,
      remark: remark || undefined,
    };
    const id = createEnrollment(input);
    onCreated?.(id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink-900/40 p-0 sm:p-4"
      onClick={onBackdrop}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-enrollment-title"
        className="surface w-full sm:max-w-4xl bg-white max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3 sticky top-0 bg-white z-10">
          <div>
            <div className="flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 text-mc-red-600" />
              <span
                id="create-enrollment-title"
                className="text-lg font-semibold text-ink-900"
              >
                New enrollment
              </span>
            </div>
            <div className="text-xs text-ink-500 mt-0.5">
              For {student.name} ({student.code}) · {student.grade} ·{" "}
              {student.school}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 -mr-2 p-2"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid sm:grid-cols-5 gap-0">
          <div className="sm:col-span-2 p-5 space-y-3 border-r border-ink-100">
            <FieldGroup label="Type">
              <div className="space-y-1">
                {ENROLLMENT_TYPES.map((t) => (
                  <label
                    key={t.id}
                    className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer ${
                      enrollmentType === t.id
                        ? "border-ink-800 bg-ink-50"
                        : "border-ink-200 hover:border-ink-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="enrollment-type"
                      checked={enrollmentType === t.id}
                      onChange={() => setEnrollmentType(t.id)}
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      <div className="font-medium text-ink-900">{t.label}</div>
                      <div className="text-xs text-ink-500">{t.hint}</div>
                    </div>
                  </label>
                ))}
              </div>
            </FieldGroup>

            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label="Tutor">
                <select
                  value={tutorId}
                  onChange={(e) => setTutorId(e.target.value)}
                  className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm bg-white"
                >
                  {tutors.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Room">
                <select
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm bg-white"
                >
                  {rooms.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </FieldGroup>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <FieldGroup label="Day">
                <select
                  value={assignedDay}
                  onChange={(e) =>
                    setAssignedDay(Number(e.target.value) as WeekdayNum)
                  }
                  className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm bg-white"
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {weekdayLabel(d)}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Time">
                <input
                  type="time"
                  value={assignedTime}
                  step={300}
                  onChange={(e) => setAssignedTime(e.target.value)}
                  className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm bg-white"
                />
              </FieldGroup>
              <FieldGroup label="Mins">
                <input
                  type="number"
                  min={30}
                  max={180}
                  step={15}
                  value={durationMins}
                  onChange={(e) => setDurationMins(Number(e.target.value))}
                  className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm"
                />
              </FieldGroup>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label="First lesson">
                <input
                  type="date"
                  value={firstLessonDate}
                  onChange={(e) => setFirstLessonDate(e.target.value)}
                  className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm"
                />
              </FieldGroup>
              <FieldGroup
                label={enrollmentType === "Regular" ? "Lessons paid" : "Lessons"}
              >
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={lessonsPaid}
                  onChange={(e) => setLessonsPaid(Number(e.target.value))}
                  disabled={enrollmentType !== "Regular"}
                  className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm disabled:bg-ink-50 disabled:text-ink-400"
                />
              </FieldGroup>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label="Discount (HK$)">
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm"
                />
              </FieldGroup>
              <FieldGroup label="New student?">
                <label className="flex items-center gap-2 text-sm h-[34px]">
                  <input
                    type="checkbox"
                    checked={isNewStudent}
                    onChange={(e) => setIsNewStudent(e.target.checked)}
                  />
                  <span className="text-ink-700">
                    Adds HK$100 reg fee
                  </span>
                </label>
              </FieldGroup>
            </div>

            <FieldGroup label="Remark (optional)">
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={2}
                placeholder="Anything to note about this enrollment"
                className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm resize-none"
              />
            </FieldGroup>
          </div>

          <div className="sm:col-span-3 p-5 space-y-3 bg-ink-50/50">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-ink-900">
                  Sessions to be created
                </div>
                <div className="text-xs text-ink-500">
                  {sessionCount}{" "}
                  {sessionCount === 1 ? "session" : "sessions"} ·{" "}
                  {weekdayLabel(assignedDay)} {assignedTime} · {tutor.name} ·{" "}
                  {room}
                </div>
              </div>
              {endDate && (
                <div className="text-xs text-ink-500">
                  Ends <span className="font-medium text-ink-700">{endDate}</span>
                </div>
              )}
            </div>

            {skipped.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-1.5">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  {skipped.length}{" "}
                  {skipped.length === 1 ? "date is" : "dates are"} a holiday;
                  the schedule advances to the next week.
                </span>
              </div>
            )}

            <div className="surface bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-ink-600 text-xs">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium w-12">#</th>
                    <th className="px-3 py-1.5 text-left font-medium">Date</th>
                    <th className="px-3 py-1.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) =>
                    row.kind === "lesson" ? (
                      <tr
                        key={`l-${row.lesson_number}`}
                        className="border-t border-ink-100"
                      >
                        <td className="px-3 py-1.5 text-ink-500 tabular-nums">
                          {row.lesson_number}
                        </td>
                        <td className="px-3 py-1.5 text-ink-800 tabular-nums">
                          {formatDate(row.session_date)}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            On schedule
                          </span>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={`s-${i}-${row.session_date}`}
                        className="border-t border-ink-100 bg-amber-50/60"
                      >
                        <td className="px-3 py-1.5 text-ink-400 tabular-nums">
                          —
                        </td>
                        <td className="px-3 py-1.5 text-ink-500 tabular-nums line-through">
                          {formatDate(row.session_date)}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="text-xs text-amber-800">
                            Holiday · {row.holiday_label}
                          </span>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>

            <FeeSummary fee={fee} />
          </div>
        </div>

        <footer className="border-t border-ink-200 px-5 py-3 flex items-center justify-end gap-2 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="rounded-md border border-ink-200 text-ink-700 px-3 py-1.5 text-sm hover:bg-ink-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded-md bg-ink-800 text-white px-3 py-1.5 text-sm font-medium hover:bg-ink-900"
          >
            Create {sessionCount}{" "}
            {sessionCount === 1 ? "session" : "sessions"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-ink-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function FeeSummary({
  fee,
}: {
  fee: {
    base: number;
    perLesson: number;
    count: number;
    discount: number;
    regFee: number;
    total: number;
  };
}) {
  const baseLabel =
    fee.count === 1
      ? "Lesson"
      : `Base · ${fee.count} × HK$${fee.perLesson}`;
  return (
    <div className="surface bg-white p-3 text-sm">
      <div className="text-xs text-ink-500 mb-1.5">Fee</div>
      <div className="space-y-0.5">
        <FeeLine label={baseLabel} value={`HK$${fee.base.toLocaleString()}`} />
        {fee.discount > 0 && (
          <FeeLine
            label="Discount"
            value={`− HK$${fee.discount.toLocaleString()}`}
          />
        )}
        {fee.discount > fee.base + fee.regFee && (
          <div className="text-xs text-amber-700 mt-0.5">
            Discount exceeds base — total clamps to HK$0
          </div>
        )}
        {fee.regFee > 0 && (
          <FeeLine label="Registration fee" value={`+ HK$${fee.regFee}`} />
        )}
        <div className="border-t border-ink-100 mt-1.5 pt-1.5">
          <FeeLine
            label="Total"
            value={`HK$${fee.total.toLocaleString()}`}
            bold
          />
        </div>
      </div>
    </div>
  );
}

function FeeLine({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span
        className={`text-xs ${bold ? "text-ink-900 font-medium" : "text-ink-600"}`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${
          bold ? "text-ink-900 font-semibold" : "text-ink-700"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00+08:00`);
  return d.toLocaleDateString("en-HK", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
