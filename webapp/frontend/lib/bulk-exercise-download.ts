/**
 * Bulk exercise download/print utilities for multi-session operations.
 * Groups exercises by student and orchestrates per-student downloads
 * or combined print jobs with per-student stamps.
 */

import type { Session, SessionExercise } from '@/types';
import type { BulkPrintExercise } from './bulk-pdf-helpers';
import type { PrintStampInfo, BulkPrintItem } from './pdf-utils';
import { getPageNumbers, fetchPdfData, FileSystemUtils } from './bulk-pdf-helpers';
import { extractBulkPagesForPrint } from './pdf-utils';
import {
  isFileSystemAccessSupported,
  getFileHandleFromPath,
  getCachedPaperlessDocumentId,
  setPaperlessPathCache,
  downloadBulkFiles,
} from './file-system';
import { searchPaperlessByPath } from './paperless-utils';

// Re-create fsUtils matching file-system.ts pattern (avoids circular import)
const createFsUtils = (): FileSystemUtils => ({
  isSupported: isFileSystemAccessSupported,
  getFileHandle: getFileHandleFromPath,
  getCachedDocId: getCachedPaperlessDocumentId,
  setCachedDocId: setPaperlessPathCache,
});

export interface StudentExerciseGroup {
  studentId: number;
  studentName: string;
  schoolStudentId: string;
  location: string;
  sessionDate: string;
  timeSlot: string;
  exercises: BulkPrintExercise[];
  stamp: PrintStampInfo;
  filename: string;
}

export interface BulkResult {
  succeeded: number;
  failed: number;
  skipped: number;  // students with no exercises of the requested type
}

/**
 * Group exercises from selected sessions by student.
 * Each student gets their own exercise list and stamp info.
 */
export function groupExercisesByStudent(
  sessions: Session[],
  type: 'CW' | 'HW'
): StudentExerciseGroup[] {
  const exerciseType = type;
  const groupMap = new Map<number, StudentExerciseGroup>();

  for (const session of sessions) {
    const exercises = session.exercises?.filter(e => e.exercise_type === exerciseType) ?? [];
    if (exercises.length === 0) continue;

    const existing = groupMap.get(session.student_id);
    if (existing) {
      // Add exercises from additional sessions for same student
      existing.exercises.push(...exercises.map(toBulkExercise));
    } else {
      const dateStr = session.session_date?.replace(/-/g, '') ?? '';
      const studentName = (session.student_name ?? 'Unknown').replace(/\s+/g, '_');
      const schoolStudentId = session.school_student_id ?? '';
      const location = session.location ?? '';

      groupMap.set(session.student_id, {
        studentId: session.student_id,
        studentName: session.student_name ?? 'Unknown',
        schoolStudentId,
        location,
        sessionDate: session.session_date,
        timeSlot: session.time_slot,
        exercises: exercises.map(toBulkExercise),
        stamp: {
          location,
          schoolStudentId,
          studentName: session.student_name,
          sessionDate: session.session_date,
          sessionTime: session.time_slot,
        },
        filename: `${type}_${schoolStudentId ? schoolStudentId + '_' : ''}${studentName}_${dateStr}`,
      });
    }
  }

  // Sort by school student ID for consistent ordering
  return Array.from(groupMap.values()).sort((a, b) =>
    a.schoolStudentId.localeCompare(b.schoolStudentId)
  );
}

/**
 * Download exercises as per-student PDFs.
 * Each student's exercises are merged into one PDF with their stamp.
 */
export async function bulkDownloadByStudent(
  groups: StudentExerciseGroup[],
  onProgress?: (current: number, total: number) => void
): Promise<BulkResult> {
  const result: BulkResult = { succeeded: 0, failed: 0, skipped: 0 };

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    onProgress?.(i, groups.length);

    if (group.exercises.length === 0) {
      result.skipped++;
      continue;
    }

    const error = await downloadBulkFiles(
      group.exercises,
      group.filename,
      group.stamp,
      searchPaperlessByPath
    );

    if (error) {
      result.failed++;
    } else {
      result.succeeded++;
    }

    // Small delay between downloads to avoid browser throttling
    if (i < groups.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  onProgress?.(groups.length, groups.length);
  return result;
}

/**
 * Print all students' exercises in a single print job.
 * Each page is stamped with the correct student's info.
 */
export async function bulkPrintAllStudents(
  groups: StudentExerciseGroup[]
): Promise<'not_supported' | 'no_valid_files' | 'print_failed' | null> {
  const fsSupported = isFileSystemAccessSupported();
  if (!fsSupported) {
    return 'not_supported';
  }

  // Flatten all exercises with their per-student stamps
  const allExercisesWithStamps: Array<{ exercise: BulkPrintExercise; stamp: PrintStampInfo }> = [];
  for (const group of groups) {
    for (const exercise of group.exercises) {
      if (exercise.pdf_name?.trim()) {
        allExercisesWithStamps.push({ exercise, stamp: group.stamp });
      }
    }
  }

  if (allExercisesWithStamps.length === 0) {
    return 'no_valid_files';
  }

  // Fetch all PDFs in parallel
  const fsUtils = createFsUtils();
  const results = await Promise.all(
    allExercisesWithStamps.map(({ exercise }) =>
      fetchPdfData(exercise, fsUtils, searchPaperlessByPath, '[BulkPrintAll]')
    )
  );

  // Build BulkPrintItems with per-item stamps
  const bulkItems: BulkPrintItem[] = [];
  for (let i = 0; i < results.length; i++) {
    const { exercise, arrayBuffer } = results[i];
    if (arrayBuffer) {
      bulkItems.push({
        pdfData: arrayBuffer,
        pageNumbers: getPageNumbers(exercise, '[BulkPrintAll]'),
        label: exercise.pdf_name,
        stamp: allExercisesWithStamps[i].stamp,
      });
    }
  }

  if (bulkItems.length === 0) {
    return 'no_valid_files';
  }

  try {
    // Combine all pages with per-item stamps into single printable document
    const combinedBlob = await extractBulkPagesForPrint(bulkItems);

    const url = URL.createObjectURL(combinedBlob);
    const printWindow = window.open(url, '_blank', 'width=800,height=600');

    if (!printWindow) {
      URL.revokeObjectURL(url);
      return 'print_failed';
    }

    printWindow.onload = () => {
      const studentNames = groups.map(g => g.schoolStudentId || g.studentName).join('_');
      printWindow.document.title = `Bulk_Print_${studentNames}`;
      setTimeout(() => printWindow.print(), 500);
    };

    printWindow.onafterprint = () => {
      printWindow.close();
      URL.revokeObjectURL(url);
    };

    return null;
  } catch {
    return 'print_failed';
  }
}

/** Convert SessionExercise to BulkPrintExercise format */
function toBulkExercise(ex: SessionExercise): BulkPrintExercise {
  return {
    pdf_name: ex.pdf_name,
    page_start: ex.page_start,
    page_end: ex.page_end,
    remarks: ex.remarks,
  };
}
