import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ConfirmProvider } from "@/contexts/ConfirmContext";
import { BulkExerciseModal } from "./BulkExerciseModal";
import type { Session } from "@/types";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn(), cache: vi.fn(), close: vi.fn(), toast: vi.fn(), print: vi.fn(), download: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: mocks.auth }));
vi.mock("@/contexts/LocationContext", () => ({ useLocation: () => ({ selectedLocation: "Main Center" }) }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("@/lib/useHaptic", () => ({ useHaptic: () => ({ trigger: () => {} }) }));
vi.mock("@/lib/hooks", () => ({ useSession: () => ({ data: undefined, isLoading: false }) }));
vi.mock("@/lib/api", () => ({ sessionsAPI: { saveExercises: mocks.save, getExerciseHistory: async () => ({ sessions: [], has_more: false }) } }));
vi.mock("@/lib/session-cache", () => ({ updateSessionInCache: mocks.cache }));
vi.mock("@/lib/file-system", () => ({ isFileSystemAccessSupported: () => false }));
vi.mock("@/lib/paperless-utils", () => ({ searchPaperlessByPath: vi.fn() }));
vi.mock("@/components/ui/folder-tree-modal", () => ({ FolderTreeModal: () => null }));
vi.mock("@/components/ui/paperless-search-modal", () => ({ PaperlessSearchModal: () => null }));
vi.mock("@/components/ui/file-search-modal", () => ({ FileSearchModal: () => null }));
vi.mock("./ExerciseHistoryPanel", () => ({ ExerciseHistoryPanel: () => null }));
vi.mock("./TrendingCoursewareSection", () => ({ TrendingCoursewareSection: () => null }));
vi.mock("./CurriculumSuggestionSection", () => ({ CurriculumSuggestionSection: () => null }));
vi.mock("./SummerMaterialsSection", () => ({ SummerMaterialsSection: () => null, SummerBulkAssignSection: () => null }));
vi.mock("@/components/homework/useHomeworkMarked", () => ({ useHomeworkMarked: () => vi.fn() }));
vi.mock("@/components/homework/HomeworkCheckList", () => ({ HomeworkCheckList: () => null }));
vi.mock("./RecapExerciseItem", () => ({ RecapExerciseItem: () => null }));

vi.mock("@/lib/bulk-exercise-download", async original => ({ ...await original<typeof import("@/lib/bulk-exercise-download")>(), bulkPrintAllStudents: mocks.print, bulkDownloadByStudent: mocks.download }));
const sessions = [
  { id: 100, tutor_id: 2, student_id: 1, student_name: 'Synthetic Alex', school_student_id: '001', session_date: '2026-11-26', time_slot: '14:30 - 16:00', location: 'MSA', exercises: [{ exercise_type: 'CW', pdf_name: 'existing.pdf' }] },
  { id: 101, tutor_id: 2, student_id: 2, student_name: 'Synthetic Bea', school_student_id: '002', session_date: '2026-11-27', time_slot: '16:45 - 18:15', location: 'MSB', exercises: [] },
] as unknown as Session[];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ user: { id: 2 }, effectiveRole: 'Tutor', isReadOnly: false, impersonatedTutor: null });
  mocks.print.mockResolvedValue(null); mocks.download.mockResolvedValue({ succeeded: 2, failed: 0, skipped: 0 });
});
function showDraft() {
  render(<ConfirmProvider><BulkExerciseModal sessions={sessions} exerciseType="CW" isOpen onClose={mocks.close} /></ConfirmProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Add classwork' }));
  fireEvent.change(screen.getByPlaceholderText('PDF path or URL (drag & drop supported)'), { target: { value: 'draft.pdf' } });
}
function notSaved() { expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled(); expect(mocks.close).not.toHaveBeenCalled(); }
it('prints unsaved worksheets per student and keeps assignment available afterwards', async () => {
  showDraft(); fireEvent.click(screen.getByRole('button', { name: 'Print all' }));
  await waitFor(() => expect(mocks.print).toHaveBeenCalledTimes(1));
  const groups = mocks.print.mock.calls[0][0];
  expect(groups.map((g: { exercises: { pdf_name: string }[] }) => g.exercises.map(e => e.pdf_name))).toEqual([['draft.pdf'], ['draft.pdf']]);
  expect(groups.map((g: { stamp: { studentName: string } }) => g.stamp.studentName)).toEqual(['Synthetic Alex', 'Synthetic Bea']);
  notSaved(); expect(screen.getByDisplayValue('draft.pdf')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Assign to 2 sessions' }));
  expect(screen.getByText('Confirm bulk assignment')).toBeInTheDocument(); notSaved();
});
it('downloads current page ranges before saving without local drive support', async () => {
  showDraft();
  fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '2' } });
  fireEvent.change(screen.getByPlaceholderText('To'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
  await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
  expect(mocks.download.mock.calls[0][0][0].exercises[0]).toMatchObject({ pdf_name: 'draft.pdf', page_start: '2', page_end: '4' });
  notSaved(); expect(mocks.toast).toHaveBeenCalledWith('CW download: 2 downloaded', 'success');
});
it('blocks output for invalid ranges', () => {
  showDraft();
  fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '5' } });
  fireEvent.change(screen.getByPlaceholderText('To'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Print all' }));
  expect(mocks.print).not.toHaveBeenCalled(); notSaved();
  expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('End page'), 'error');
});
it('prevents overlapping export jobs and resets after an unexpected print failure', async () => {
  let reject!: (error: Error) => void;
  mocks.print.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  showDraft(); fireEvent.click(screen.getByRole('button', { name: 'Print all' }));
  expect(screen.getByRole('button', { name: 'Download all' })).toBeDisabled();
  reject(new Error('Broken print'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download all' })).toBeEnabled());
  expect(mocks.toast).toHaveBeenCalledWith("Couldn't load the file for printing", 'error'); notSaved();
});
