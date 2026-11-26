import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Session } from '@/types';
import { ZenExerciseAssign } from './ZenExerciseAssign';
const h = vi.hoisted(() => ({ save: vi.fn(), close: vi.fn(), updated: vi.fn() }));
vi.mock('@/lib/api', () => ({ sessionsAPI: { saveExercises: h.save } }));
vi.mock('@/lib/session-cache', () => ({ updateSessionInCache: h.updated }));
vi.mock('@/lib/file-system', () => ({ getSavedFolders: async () => [] }));
vi.mock('@/lib/paperless-utils', () => ({ searchPaperlessByPath: () => { throw new Error('Shelv search is disabled'); } }));
vi.mock('@/components/sessions/TrendingCoursewareSection', () => ({ TrendingCoursewareSection: () => null }));
vi.mock('@/components/courseware/CoursewarePicker', () => ({ CoursewarePicker: ({ isOpen, onClose, onMultiSelect }: { isOpen: boolean; onClose: () => void; onMultiSelect: (files: unknown[]) => void }) => isOpen ? <div role="dialog" aria-label="Courseware fixture" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
  <button onClick={() => { onMultiSelect([{ path: '[Center]\\First.pdf', pageSelection: { pageStart: 2, pageEnd: 4 } }, { path: '[MSA Staff]\\scan\\Second.pdf', pageSelection: { complexRange: '1, 3' } }]); onClose(); }}>Add selected files</button>
  <button onClick={onClose}>Cancel courseware</button>
</div> : null }));
const session = { id: 22, student_name: 'Fixture Student', session_date: '2026-11-26', location: 'Main Center', exercises: [{ pdf_name: '[Center]\\Existing.pdf', exercise_type: 'CW', page_start: 1, page_end: 2 }] } as Session;
beforeEach(() => { vi.clearAllMocks(); h.save.mockResolvedValue(session); });
it('preserves existing draft exercises and selected page ranges until the tutor explicitly saves', async () => {
  await act(async () => { render(<ZenExerciseAssign session={session} exerciseType="CW" onClose={h.close} />); });
  fireEvent.click(screen.getByRole('button', { name: 'Search courseware [/]' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add selected files' }));
  expect(h.save).not.toHaveBeenCalled(); expect(h.close).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('[Center]\\Existing.pdf')).toBeVisible();
  expect(screen.getByDisplayValue('[Center]\\First.pdf')).toBeVisible();
  expect(screen.getByDisplayValue('[MSA Staff]\\scan\\Second.pdf')).toBeVisible();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Assign (3)' })); });
  expect(h.save).toHaveBeenCalledWith(22, 'CW', [
    expect.objectContaining({ pdf_name: '[Center]\\Existing.pdf', page_start: 1, page_end: 2 }),
    expect.objectContaining({ pdf_name: '[Center]\\First.pdf', page_start: 2, page_end: 4 }),
    expect.objectContaining({ pdf_name: '[MSA Staff]\\scan\\Second.pdf', page_start: null, page_end: null, remarks: 'Pages: 1, 3' }),
  ]);
});
it('lets Escape close the picker without discarding the parent lesson draft', async () => {
  await act(async () => { render(<ZenExerciseAssign session={session} exerciseType="CW" onClose={h.close} />); });
  fireEvent.click(screen.getByRole('button', { name: 'Search courseware [/]' }));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel courseware' }), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByDisplayValue('[Center]\\Existing.pdf')).toBeVisible();
  expect(h.save).not.toHaveBeenCalled(); expect(h.close).not.toHaveBeenCalled();
});
