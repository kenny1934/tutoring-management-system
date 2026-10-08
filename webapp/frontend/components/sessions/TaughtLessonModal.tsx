"use client";

/**
 * Records a lesson taught but not in CSM yet: a student came to a lesson that
 * CSM doesn't have, usually because their enrolment wasn't renewed in time.
 *
 * The tutor picks the student and adds classwork and homework through the
 * same exercise window as a real lesson, with its file search and page
 * ranges, plus notes and a rating. There is no attendance field, because
 * recording the lesson says the student came. Admins see the waiting ones on
 * the Renewals page. Once CSM has the lesson, it is filled in from this
 * record and marked attended (services/unlisted_lessons.py on the server).
 *
 * Opened from a time slot, it starts with that slot's date, time, branch and
 * tutor. Given a lesson that is still waiting, it edits it instead.
 */
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Home, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { StudentSearch } from "@/components/ui/student-search";
import { Button, Field, Input, Label, Select, Textarea } from "@/components/controls";
import { ExerciseModal, type CollectedExercise } from "@/components/sessions/ExerciseModal";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useActiveTutors, useCacheInvalidation, revalidateUnlistedLessons } from "@/lib/hooks";
import { unlistedLessonsAPI } from "@/lib/api";
import { WEEKDAY_TIME_SLOTS, WEEKEND_TIME_SLOTS } from "@/lib/constants";
import { getExerciseDisplayName } from "@/lib/exercise-utils";
import { ratingToEmoji } from "@/lib/formatters";
import { toDateString } from "@/lib/calendar-utils";
import { formatError } from "@/lib/utils";
import type { Session, Student, UnlistedLesson, UnlistedLessonExercise } from "@/types";

export interface TaughtLessonPrefill {
  date?: string;
  timeSlot?: string | null;
  location?: string | null;
  /** The tutor whose slot it was opened from. Only an admin can record for someone else. */
  tutorId?: number | null;
}

interface TaughtLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefill?: TaughtLessonPrefill;
  /** A lesson that is still waiting, to edit. */
  lesson?: UnlistedLesson | null;
  onSaved?: (lesson: UnlistedLesson) => void;
}

const LOCATIONS = ["MSA", "MSB"];

function toInputExercise(ex: CollectedExercise): UnlistedLessonExercise {
  return {
    exercise_type: ex.exercise_type === "HW" ? "HW" : "CW",
    pdf_name: ex.pdf_name,
    url: ex.url,
    url_title: ex.url_title,
    page_start: ex.page_start,
    page_end: ex.page_end,
    remarks: ex.remarks,
    answer_pdf_name: ex.answer_pdf_name,
    answer_page_start: ex.answer_page_start,
    answer_page_end: ex.answer_page_end,
    answer_remarks: ex.answer_remarks,
  };
}

function pagesLabel(ex: UnlistedLessonExercise): string {
  if (ex.page_start && ex.page_end && ex.page_end !== ex.page_start) return ` p.${ex.page_start}-${ex.page_end}`;
  if (ex.page_start) return ` p.${ex.page_start}`;
  return "";
}

export function TaughtLessonModal({ isOpen, onClose, prefill, lesson, onSaved }: TaughtLessonModalProps) {
  const { user, isAdmin, isImpersonating, impersonatedTutor } = useAuth();
  // Whose lesson it is by default. A Super Admin viewing as a tutor records it
  // for that tutor, and the server checks the real role.
  const ownTutorId = isImpersonating && impersonatedTutor?.id ? impersonatedTutor.id : user?.id ?? null;
  const { showToast } = useToast();
  const { invalidateAfterSessionUpdate } = useCacheInvalidation();
  const { data: tutors = [] } = useActiveTutors();
  const editing = !!lesson;

  const [student, setStudent] = useState<Student | null>(null);
  const [lessonDate, setLessonDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [location, setLocation] = useState("");
  const [tutorId, setTutorId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);
  const [exercises, setExercises] = useState<UnlistedLessonExercise[]>([]);
  const [exerciseWindow, setExerciseWindow] = useState<"CW" | "HW" | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Start from the lesson being edited, or from the slot it was opened from.
  useEffect(() => {
    if (!isOpen) return;
    setConfirmDelete(false);
    if (lesson) {
      setStudent({
        id: lesson.student_id,
        student_name: lesson.student_name,
        school_student_id: lesson.school_student_id ?? undefined,
        grade: lesson.grade ?? undefined,
        lang_stream: lesson.lang_stream ?? undefined,
        school: lesson.school ?? undefined,
      } as Student);
      setLessonDate(lesson.lesson_date);
      setTimeSlot(lesson.time_slot ?? "");
      setLocation(lesson.location ?? "");
      setTutorId(lesson.tutor_id);
      setNotes(lesson.notes ?? "");
      setRating(parseStarRating(lesson.performance_rating));
      setExercises(lesson.exercises ?? []);
    } else {
      setStudent(null);
      setLessonDate(prefill?.date ?? toDateString(new Date()));
      setTimeSlot(prefill?.timeSlot ?? "");
      setLocation(prefill?.location ?? "");
      setTutorId(isAdmin ? prefill?.tutorId ?? ownTutorId : ownTutorId);
      setNotes("");
      setRating(0);
      setExercises([]);
    }
  }, [isOpen, lesson, prefill, isAdmin, ownTutorId]);

  // A student picked from search knows their branch.
  useEffect(() => {
    if (!editing && student?.home_location && !prefill?.location) setLocation(student.home_location);
  }, [student, editing, prefill?.location]);

  const slotChoices = useMemo(() => {
    const day = lessonDate ? new Date(`${lessonDate}T00:00:00`).getDay() : 1;
    const slots: string[] = [...(day === 0 || day === 6 ? WEEKEND_TIME_SLOTS : WEEKDAY_TIME_SLOTS)];
    if (timeSlot && !slots.includes(timeSlot)) slots.unshift(timeSlot);
    return slots;
  }, [lessonDate, timeSlot]);

  // The exercise window wants a lesson to look at. This stand-in carries
  // what it reads: the student, their school and grade, the day and slot,
  // and the exercises so far. Its id is 0, so nothing is saved to a lesson.
  const standIn = useMemo(() => ({
    id: 0,
    student_id: student?.id ?? 0,
    student_name: student?.student_name ?? "",
    school_student_id: student?.school_student_id,
    grade: student?.grade,
    lang_stream: student?.lang_stream,
    school: student?.school,
    location: location || undefined,
    session_date: lessonDate,
    time_slot: timeSlot,
    session_status: "Scheduled",
    exercises: exercises.map((ex, i) => ({ ...ex, id: -(i + 1), session_id: 0 })),
  }) as unknown as Session, [student, location, lessonDate, timeSlot, exercises]);

  const today = toDateString(new Date());
  const canSave = !!student && !!lessonDate && lessonDate <= today && !!timeSlot && !!location && !saving;

  const save = async () => {
    if (!student || !canSave) return;
    setSaving(true);
    const body = {
      student_id: student.id,
      lesson_date: lessonDate,
      time_slot: timeSlot || null,
      location: location || null,
      notes: notes.trim() || null,
      performance_rating: rating > 0 ? ratingToEmoji(rating) : null,
      exercises,
      ...(!editing && tutorId && tutorId !== user?.id ? { tutor_id: tutorId } : {}),
    };
    try {
      const saved = editing
        ? await unlistedLessonsAPI.update(lesson!.id, body)
        : await unlistedLessonsAPI.create(body);
      revalidateUnlistedLessons();
      if (saved.status === "filled") {
        invalidateAfterSessionUpdate({ sessionId: saved.filled_session_id ?? undefined, studentId: saved.student_id });
        showToast("CSM already had this lesson, so it has been filled in and marked attended.", "success");
      } else {
        showToast("Saved. It will be filled in once the lesson is in CSM.", "success");
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      showToast(formatError(err, "Couldn't save the lesson"), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!lesson) return;
    setSaving(true);
    try {
      await unlistedLessonsAPI.delete(lesson.id);
      revalidateUnlistedLessons();
      showToast("Deleted.", "success");
      onClose();
    } catch (err) {
      showToast(formatError(err, "Couldn't delete the lesson"), "error");
    } finally {
      setSaving(false);
    }
  };

  const ofType = (kind: "CW" | "HW") => exercises.filter((ex) => ex.exercise_type === kind);

  const exerciseRow = (kind: "CW" | "HW") => {
    const items = ofType(kind);
    const Icon = kind === "CW" ? BookOpen : Home;
    return (
      <div className="flex items-start justify-between gap-3 py-2">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-1.5 text-sm font-medium">
            <Icon className={kind === "CW" ? "h-3.5 w-3.5 text-red-600 dark:text-red-400" : "h-3.5 w-3.5 text-blue-600 dark:text-blue-400"} aria-hidden="true" />
            {kind === "CW" ? "Classwork" : "Homework"}
          </p>
          {items.length === 0 ? (
            <p className="m-0 mt-0.5 text-xs text-ink-subtle">None yet</p>
          ) : (
            <ul className="m-0 mt-0.5 list-none space-y-0.5 p-0 text-xs text-ink-subtle">
              {items.map((ex, i) => (
                <li key={i} className="truncate">
                  {getExerciseDisplayName({ pdf_name: ex.pdf_name, url: ex.url ?? undefined, url_title: ex.url_title ?? undefined })}
                  {pagesLabel(ex)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button size="sm" onClick={() => setExerciseWindow(kind)} disabled={!student}>
          {items.length === 0 ? "Add" : "Change"}
        </Button>
      </div>
    );
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={editing ? "Taught but not in CSM yet" : "Add a student who isn't listed"}
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-3">
            <div>
              {editing && (confirmDelete ? (
                <span className="flex items-center gap-2 text-sm">
                  Delete this record?
                  <Button size="sm" variant="danger" onClick={remove} loading={saving}>Delete</Button>
                  <Button size="sm" onClick={() => setConfirmDelete(false)}>Keep</Button>
                </span>
              ) : (
                <Button size="sm" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete</Button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={!canSave} loading={saving}>Save</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="m-0 text-sm text-ink-subtle">
            For a student who came to a lesson that CSM doesn&apos;t have yet. Once the lesson is in CSM, it is filled in from
            what you record here and marked attended.
          </p>

          <div>
            <Label>Student</Label>
            <StudentSearch value={student} onChange={setStudent} disabled={editing} location={location || undefined} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field id="taught-date" label="Date">
              <Input type="date" value={lessonDate} max={today} onChange={(e) => setLessonDate(e.target.value)} />
            </Field>
            <Field id="taught-slot" label="Time">
              <Select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}>
                <option value="" disabled>Pick a time</option>
                {slotChoices.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
              </Select>
            </Field>
            <Field id="taught-location" label="Branch">
              <Select value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="" disabled>Pick a branch</option>
                {LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
              </Select>
            </Field>
          </div>

          {isAdmin && !editing && (
            <Field id="taught-tutor" label="Tutor">
              <Select value={tutorId ?? ""} onChange={(e) => setTutorId(e.target.value ? Number(e.target.value) : null)}>
                {tutors.map((t) => <option key={t.id} value={t.id}>{t.tutor_name}</option>)}
              </Select>
            </Field>
          )}

          <div className="divide-y divide-line rounded-md border border-line px-3">
            {exerciseRow("CW")}
            {exerciseRow("HW")}
          </div>

          <Field id="taught-notes" label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="resize-none" />
          </Field>

          <div>
            <Label>Rating</Label>
            <StarRating rating={rating} onChange={setRating} size="lg" />
          </div>

          {lessonDate > today && (
            <p className="m-0 text-sm text-red-600 dark:text-red-400">The date can&apos;t be in the future.</p>
          )}
        </div>
      </Modal>

      {exerciseWindow && student && (
        <ExerciseModal
          session={standIn}
          exerciseType={exerciseWindow}
          isOpen
          onClose={() => setExerciseWindow(null)}
          onCollect={(collected) => {
            const kind = exerciseWindow;
            setExercises((prev) => [
              ...prev.filter((ex) => ex.exercise_type !== kind),
              ...collected.map(toInputExercise),
            ]);
          }}
        />
      )}
    </>
  );
}
