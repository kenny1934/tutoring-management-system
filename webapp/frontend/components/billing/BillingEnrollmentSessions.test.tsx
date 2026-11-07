import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/types';
import { BillingEnrollmentSessions } from './BillingEnrollmentSessions';

const mocks = vi.hoisted(() => ({ sessions: vi.fn(), reload: vi.fn(), popover: vi.fn() }));
vi.mock('@/lib/hooks', () => ({ useEnrollmentSessions: mocks.sessions }));
vi.mock('@/components/sessions/SessionDetailPopover', () => ({ SessionDetailPopover: (props: { session: Session; onClose: () => void }) => { mocks.popover(props); return <div role="dialog" aria-label="Session detail">Session {props.session.id}<button onClick={props.onClose}>Close session</button></div>; } }));

function session(values: Partial<Session> = {}): Session {
  return { id: 1, enrollment_id: 10, student_id: 4, tutor_id: 1, session_date: '2026-12-04',
    time_slot: '16:45 - 18:15', location: 'MSA', session_status: 'Scheduled', lesson_number: 1, ...values };
}

beforeEach(() => {
  mocks.reload.mockReset(); mocks.sessions.mockReset(); mocks.popover.mockReset();
  mocks.sessions.mockReturnValue({ data: [], isLoading: false, error: undefined, mutate: mocks.reload });
});

describe('actual billing enrollment sessions', () => {
  it('fetches the enrollment records and keeps loading separate from an empty result', () => {
    mocks.sessions.mockReturnValue({ data: undefined, isLoading: true, mutate: mocks.reload });
    render(<BillingEnrollmentSessions enrollmentId={10} studentId={4} />);
    expect(mocks.sessions).toHaveBeenCalledWith(10);
    expect(screen.getByRole('status')).toHaveTextContent('Loading sessions');
    expect(screen.queryByText('No sessions found.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dec|Nov/ })).not.toBeInTheDocument();
  });

  it('shows an empty loaded enrollment without inventing scheduled lessons', () => {
    render(<BillingEnrollmentSessions enrollmentId={10} studentId={4} />);
    expect(screen.getByRole('heading', { name: 'Sessions (0)' })).toBeInTheDocument();
    expect(screen.getByText('No sessions found.')).toBeInTheDocument();
    expect(screen.queryByTitle('Scheduled')).not.toBeInTheDocument();
  });

  it('shows chronological actual dates, numbers, attendance and booked make-up status', () => {
    const records = [
      session({ id: 4, session_date: '2026-12-11', time_slot: '10:00 - 11:30', session_status: 'Make-up Class', lesson_number: 2, make_up_for_id: 2 }),
      session({ id: 3, session_date: '2026-12-11', time_slot: '9:00 - 10:00', session_status: 'Attended', previous_session_status: 'Trial Class', lesson_number: 3 }),
      session({ id: 2, session_date: '2026-12-04', session_status: 'Sick Leave - Make-up Booked', lesson_number: null, moved_lesson_number: 2 }),
      session({ id: 1, session_date: '2026-11-27', session_status: 'Attended' }),
    ];
    mocks.sessions.mockReturnValue({ data: records, isLoading: false, mutate: mocks.reload });
    render(<BillingEnrollmentSessions enrollmentId={10} studentId={4} />);
    const list = screen.getByRole('region', { name: 'Enrollment session list' });
    const links = within(list).getAllByRole('button');
    expect(links.map(link => link.textContent)).toEqual([expect.stringContaining('Nov 27'), expect.stringContaining('Dec 4'), expect.stringContaining('9:00 - 10:00'), expect.stringContaining('10:00 - 11:30')]);
    expect(within(list).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sessions (4)' })).toBeInTheDocument();
    expect(within(links[0]).getByTitle('Lesson 1')).toHaveTextContent('L1');
    expect(within(links[0]).getByTitle('Attended')).toBeInTheDocument();
    expect(within(links[1]).getByTitle('Lesson 2 (moved to booked make-up)')).toHaveTextContent('L2');
    expect(within(links[1]).getByTitle('Sick Leave - Make-up Booked')).toBeInTheDocument();
    expect(within(links[2]).getByTitle('Attended (Trial)')).toBeInTheDocument();
    expect(within(links[3]).getByTitle('Make-up Class')).toBeInTheDocument();
    expect(within(links[3]).getByText('10:00 - 11:30 · MSA')).toBeInTheDocument();
    expect(screen.queryByTitle('Scheduled')).not.toBeInTheDocument();
    expect(records.map(record => record.id)).toEqual([4, 3, 2, 1]);
  });

  it('withholds cached sessions on a failed refresh and offers a read-only reload', () => {
    mocks.sessions.mockReturnValue({ data: [session()], isLoading: false, error: new Error('Request failed'), mutate: mocks.reload });
    render(<BillingEnrollmentSessions enrollmentId={10} studentId={4} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load sessions');
    expect(screen.queryByRole('button', { name: /Dec|Nov/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload sessions' }));
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it.each([
    [session({ student_id: 99 })],
    [session({ enrollment_id: 99 })],
    [session(), session()],
    [session({ session_date: '2026-02-30' })],
    { sessions: [session()] },
  ])('withholds an unexpected response instead of showing another enrollment: %j', data => {
    mocks.sessions.mockReturnValue({ data, isLoading: false, mutate: mocks.reload });
    render(<BillingEnrollmentSessions enrollmentId={10} studentId={4} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dec|Nov/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Sessions \(/ })).not.toBeInTheDocument();
  });

  it('withholds old rows during an enrollment switch and shows only the new enrollment after loading', () => {
    mocks.sessions.mockReturnValue({ data: [session()], isLoading: false, mutate: mocks.reload });
    const { rerender } = render(<BillingEnrollmentSessions enrollmentId={10} studentId={4} />);
    expect(screen.getByRole('button')).toHaveAccessibleName(expect.stringContaining('Dec 4'));
    rerender(<BillingEnrollmentSessions enrollmentId={20} studentId={4} />);
    expect(mocks.sessions).toHaveBeenLastCalledWith(20);
    expect(screen.queryByRole('button', { name: /Dec|Nov/ })).not.toBeInTheDocument();
    mocks.sessions.mockReturnValue({ data: [session({ id: 20, enrollment_id: 20 })], isLoading: false, mutate: mocks.reload });
    rerender(<BillingEnrollmentSessions enrollmentId={20} studentId={4} />);
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.popover).toHaveBeenLastCalledWith(expect.objectContaining({ session: expect.objectContaining({ id: 20, enrollment_id: 20 }) }));
  });

  it('keeps every actual session accessible, including cancelled rows and extra make-ups', () => {
    const data = Array.from({ length: 60 }, (_, index) => session({ id: index + 1,
      session_date: new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10),
      session_status: index === 59 ? 'Cancelled' : 'Make-up Class' }));
    mocks.sessions.mockReturnValue({ data, isLoading: false, mutate: mocks.reload });
    render(<BillingEnrollmentSessions enrollmentId={10} studentId={4} />);
    const list = screen.getByRole('region', { name: 'Enrollment session list' });
    expect(list).toHaveAttribute('tabindex', '0');
    expect(within(list).getAllByRole('button')).toHaveLength(60);
    expect(screen.getByRole('heading', { name: 'Sessions (60)' })).toBeInTheDocument();
    expect(within(list).getByTitle('Cancelled').closest('button')).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('opens the shared popover in place and returns focus to its session row', async () => {
    const record = session();
    mocks.sessions.mockReturnValue({ data: [record], isLoading: false, mutate: mocks.reload });
    render(<BillingEnrollmentSessions enrollmentId={10} studentId={4} />);
    const row = screen.getByRole('button');
    row.getBoundingClientRect = () => ({ left: 20, width: 100, bottom: 80 } as DOMRect);
    row.focus(); fireEvent.click(row);
    expect(screen.getByRole('dialog', { name: 'Session detail' })).toBeInTheDocument();
    expect(mocks.popover).toHaveBeenLastCalledWith(expect.objectContaining({ session: record, isOpen: true, clickPosition: { x: 70, y: 80 } }));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close session' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(row).toHaveFocus());
  });

  it('closes the selected popover when its enrollment or source records change', () => {
    mocks.sessions.mockReturnValue({ data: [session()], isLoading: false, mutate: mocks.reload });
    const view = render(<BillingEnrollmentSessions enrollmentId={10} studentId={4} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    view.rerender(<BillingEnrollmentSessions enrollmentId={11} studentId={4} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not fetch when the student identity is missing', () => {
    render(<BillingEnrollmentSessions enrollmentId={10} studentId={0} />);
    expect(mocks.sessions).toHaveBeenCalledWith(null);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dec|Nov/ })).not.toBeInTheDocument();
  });
});
