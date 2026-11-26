import { beforeEach, expect, it, vi } from 'vitest';
import type { Session } from '@/types';
import { createExercise } from './exercise-utils';
import { getPageNumbers } from './bulk-pdf-helpers';
const h = vi.hoisted(() => ({ fetch: vi.fn(), merge: vi.fn(), downloadMerge: vi.fn(), download: vi.fn(), open: vi.fn() }));
vi.mock('./file-system', () => ({ isFileSystemAccessSupported: () => false, getFileHandleFromPath: vi.fn(), getCachedPaperlessDocumentId: vi.fn(), setPaperlessPathCache: vi.fn(), downloadBulkFiles: h.download }));
vi.mock('./paperless-utils', () => ({ searchPaperlessByPath: vi.fn() }));
vi.mock('./bulk-pdf-helpers', async original => ({ ...await original<typeof import('./bulk-pdf-helpers')>(), fetchPdfData: h.fetch }));
vi.mock('./pdf-utils', async original => ({ ...await original<typeof import('./pdf-utils')>(), extractBulkPagesForPrint: h.merge, extractBulkPagesForDownload: h.downloadMerge }));
import { groupExercisesByStudent, bulkPrintAllStudents, bulkDownloadByStudent } from './bulk-exercise-download';
const sessions = [
  { id: 2, student_id: 102, school_student_id: '002', student_name: 'Synthetic Bea', location: 'MSB', session_date: '2026-11-27', time_slot: '16:45 - 18:15', exercises: [{ exercise_type: 'CW', pdf_name: 'old-saved.pdf' }] },
  { id: 1, student_id: 101, school_student_id: '001', student_name: 'Synthetic Alex', location: 'MSA', session_date: '2026-11-26', time_slot: '14:30 - 16:00', exercises: [] },
] as unknown as Session[];
const drafts = () => [
  { ...createExercise('CW', 'algebra.pdf'), page_start: '2', page_end: '3', complex_pages: '8' },
  { ...createExercise('CW', 'geometry.pdf'), page_mode: 'custom' as const, complex_pages: '3,1', page_start: '9', page_end: '9' },
  { ...createExercise('CW'), url: 'https://example.test/worksheet' },
];
beforeEach(() => {
  vi.clearAllMocks();
  h.fetch.mockImplementation(async exercise => ({ exercise, arrayBuffer: new ArrayBuffer(8) }));
  h.merge.mockResolvedValue(new Blob(['pdf'])); h.downloadMerge.mockResolvedValue(new Blob(['pdf'])); h.download.mockResolvedValue(null);
  vi.stubGlobal('open', h.open); h.open.mockReturnValue({});
  URL.createObjectURL = vi.fn(() => 'blob:pack'); URL.revokeObjectURL = vi.fn();
});
it('uses only drafts and active pages with correct student filenames, without mutating source data', () => {
  const draft = drafts(), before = JSON.stringify([sessions, draft]);
  const groups = groupExercisesByStudent(sessions, 'CW', draft);
  expect(groups.map(g => g.studentId)).toEqual([101, 102]);
  expect(groups.map(g => g.filename)).toEqual(['CW_001_Synthetic_Alex_20261126', 'CW_002_Synthetic_Bea_20261127']);
  for (const group of groups) {
    expect(group.exercises.map(ex => ex.pdf_name)).toEqual(['algebra.pdf', 'geometry.pdf']);
    expect(group.exercises.map(ex => getPageNumbers(ex))).toEqual([[2, 3], [3, 1]]);
    expect(group.exercises[0].stamp).toEqual(group.stamp);
  }
  expect(JSON.stringify([sessions, draft])).toBe(before);
});
it('keeps each lesson date inside one student pack and ignores repeated session selections', () => {
  const other = { ...sessions[1], id: 3, session_date: '2026-11-28', time_slot: '10:00 - 11:30' };
  const groups = groupExercisesByStudent([sessions[1], other, sessions[1]], 'CW', drafts());
  expect(groups).toHaveLength(1);
  expect(groups[0].exercises.map(ex => ex.stamp?.sessionDate)).toEqual(['2026-11-26', '2026-11-26', '2026-11-28', '2026-11-28']);
});
it('prints together with per-lesson stamps without requiring the local drive API', async () => {
  expect(await bulkPrintAllStudents(groupExercisesByStudent(sessions, 'CW', drafts()))).toBeNull();
  expect(h.merge.mock.calls[0][0].map((item: { stamp: { studentName: string } }) => item.stamp.studentName)).toEqual(['Synthetic Alex', 'Synthetic Alex', 'Synthetic Bea', 'Synthetic Bea']);
  expect(h.open).toHaveBeenCalledTimes(1);
});
it('does not print incomplete packs when a worksheet cannot be loaded', async () => {
  h.fetch.mockImplementation(async exercise => ({ exercise, arrayBuffer: exercise.pdf_name === 'geometry.pdf' ? null : new ArrayBuffer(8) }));
  expect(await bulkPrintAllStudents(groupExercisesByStudent(sessions, 'CW', drafts()))).toBe('print_failed');
  expect(h.merge).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
});
it('downloads one merged pack per student and counts failed downloads', async () => {
  h.download.mockRejectedValueOnce(new Error('Network unavailable'));
  expect(await bulkDownloadByStudent(groupExercisesByStudent(sessions, 'CW', drafts()))).toEqual({ succeeded: 1, failed: 1, skipped: 0 });
  expect(h.download.mock.calls.map(call => call[1])).toEqual(['CW_001_Synthetic_Alex_20261126', 'CW_002_Synthetic_Bea_20261127']);
  expect(h.download.mock.calls[0][2].studentName).toBe('Synthetic Alex');
  expect(h.download.mock.calls[1][2].studentName).toBe('Synthetic Bea');
});
it('preserves saved-exercise grouping when no drafts are supplied', () => {
  const groups = groupExercisesByStudent(sessions, 'CW');
  expect(groups).toHaveLength(1); expect(groups[0].exercises[0].pdf_name).toBe('old-saved.pdf');
  expect(groupExercisesByStudent(sessions, 'HW', drafts())).toEqual([]);
});

it('passes the draft per-item stamps into the real merged-download helper', async () => {
  const { downloadBulkFiles } = await vi.importActual<typeof import('./file-system')>('./file-system');
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const group = groupExercisesByStudent(sessions, 'CW', drafts())[0];
  expect(await downloadBulkFiles(group.exercises, group.filename, group.stamp, vi.fn())).toBeNull();
  expect(h.downloadMerge.mock.calls[0][0].map((item: { stamp: { studentName: string } }) => item.stamp.studentName)).toEqual(['Synthetic Alex', 'Synthetic Alex']);
  expect(click).toHaveBeenCalledTimes(1); click.mockRestore();
});
it('does not download an incomplete PDF when one source is unavailable', async () => {
  const { downloadBulkFiles } = await vi.importActual<typeof import('./file-system')>('./file-system');
  h.fetch.mockImplementation(async exercise => ({ exercise, arrayBuffer: exercise.pdf_name === 'geometry.pdf' ? null : new ArrayBuffer(8) }));
  const group = groupExercisesByStudent(sessions, 'CW', drafts())[0];
  expect(await downloadBulkFiles(group.exercises, group.filename, group.stamp, vi.fn())).toBe('download_failed');
  expect(h.downloadMerge).not.toHaveBeenCalled();
});
