import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentSearchShortcuts } from './StudentSearchShortcuts';
const mocks = vi.hoisted(() => ({ search: vi.fn(), location: 'MSA' }));
vi.mock('@/lib/api', () => ({ api: { stats: { search: mocks.search } } }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: () => ({ selectedLocation: mocks.location }) }));
const empty = { students: [], sessions: [], enrollments: [], exams: [] };
const student = { id: 9, student_name: 'Learner' };
beforeEach(() => { mocks.search.mockReset(); mocks.location = 'MSA'; });
describe('Student shortcuts', () => {
  it('opens the exact next lesson within the selected pupil, centre and tutor scope', async () => {
    mocks.search.mockResolvedValue({ ...empty, sessions: [{ id: 71 }] }); const onSession = vi.fn();
    render(<StudentSearchShortcuts student={student} tutorId={5} onSession={onSession} onNavigate={vi.fn()} onRecords={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Your next lesson' }));
    await waitFor(() => expect(onSession).toHaveBeenCalledWith(71));
    expect(mocks.search.mock.calls[0][4]).toMatchObject({ category: 'sessions', student_id: 9, tutor_id: 5, status: 'upcoming' });
  });
  it('reports an unavailable next lesson and recovers from lookup failures', async () => {
    mocks.search.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(empty);
    render(<StudentSearchShortcuts student={student} onSession={vi.fn()} onNavigate={vi.fn()} onRecords={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next lesson' })); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Next lesson' })); expect(await screen.findByRole('status')).toHaveTextContent('No upcoming lesson at MSA');
  });
  it('does not open a lesson after its source has closed', async () => {
    let resolve!: (value: unknown) => void; mocks.search.mockReturnValue(new Promise(yes => { resolve = yes; }));
    const onSession = vi.fn(); const view = render(<StudentSearchShortcuts student={student} onSession={onSession} onNavigate={vi.fn()} onRecords={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next lesson' })); view.unmount();
    await act(async () => resolve({ ...empty, sessions: [{ id: 71 }] })); expect(onSession).not.toHaveBeenCalled();
  });
  it('carries the actual student ID into contact and enrolment workflows', () => {
    const onNavigate = vi.fn(), onRecords = vi.fn(); render(<StudentSearchShortcuts student={student} onSession={vi.fn()} onNavigate={onNavigate} onRecords={onRecords} />);
    fireEvent.click(screen.getByRole('button', { name: 'Parent contacts' })); expect(onNavigate).toHaveBeenCalledWith('/students/9?tab=contacts');
    fireEvent.click(screen.getByRole('button', { name: 'Enrolments' })); expect(onRecords).toHaveBeenCalledWith('enrollments', { id: 9, name: 'Learner' });
  });
});
