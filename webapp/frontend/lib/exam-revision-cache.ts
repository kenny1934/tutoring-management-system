import { mutate } from 'swr';
import type { ExamWithRevisionSlots, ExamRevisionSlot, EligibleStudent } from '@/types';

/**
 * Add a new revision slot to the exams cache optimistically.
 * Call this after creating a slot to update the UI immediately.
 */
export function addSlotToExamsCache(examId: number, newSlot: ExamRevisionSlot) {
  mutate(
    (key) => Array.isArray(key) && key[0] === 'exams-with-slots',
    (currentData: ExamWithRevisionSlots[] | undefined) => {
      if (!currentData) return currentData;
      return currentData.map(exam =>
        exam.id === examId
          ? { ...exam, revision_slots: [...exam.revision_slots, newSlot] }
          : exam
      );
    },
    { revalidate: false }
  );
}

/**
 * Update enrolled count after a student is enrolled in a revision slot.
 * Updates both the exam's total_enrolled and eligible_count, and the slot's enrolled_count.
 */
export function updateExamEnrollmentCount(examId: number, slotId: number) {
  mutate(
    (key) => Array.isArray(key) && key[0] === 'exams-with-slots',
    (currentData: ExamWithRevisionSlots[] | undefined) => {
      if (!currentData) return currentData;
      return currentData.map(exam =>
        exam.id === examId
          ? {
              ...exam,
              total_enrolled: exam.total_enrolled + 1,
              eligible_count: Math.max(0, exam.eligible_count - 1),
              revision_slots: exam.revision_slots.map(slot =>
                slot.id === slotId
                  ? { ...slot, enrolled_count: slot.enrolled_count + 1 }
                  : slot
              )
            }
          : exam
      );
    },
    { revalidate: false }
  );
}

/**
 * Remove a student from the eligible students list cache.
 * Call this after enrolling a student to immediately remove them from the eligible list.
 */
export function removeFromEligibleCache(slotId: number, studentId: number) {
  mutate(
    ['eligible-students', slotId],
    (currentData: EligibleStudent[] | undefined) => {
      if (!currentData) return currentData;
      return currentData.filter(s => s.student_id !== studentId);
    },
    { revalidate: false }
  );
}
