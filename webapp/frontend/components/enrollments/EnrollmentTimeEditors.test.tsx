import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Enrollment } from '@/types';
import EnrollmentDetailPage from '@/app/enrollments/[id]/page';
import { EnrollmentDetailPopover } from './EnrollmentDetailPopover';

const data = vi.hoisted(() => ({
  enrollment: { id: 31, student_id: 1, student_name: 'Synthetic Student', tutor_id: 2,
    tutor_name: 'Synthetic Tutor', assigned_day: 'Wed', assigned_time: '18:00-19:30',
    location: 'MSA', enrollment_type: 'Regular', payment_status: 'Paid', lessons_paid: 6,
    first_lesson_date: '2026-11-04' },
  tutors: [{ id: 2, tutor_name: 'Synthetic Tutor', default_location: 'MSA', is_active_tutor: true }],
  empty: [], update: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: '31' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: () => ({ selectedLocation: 'MSA' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ effectiveRole: 'Admin', isReadOnly: false, canViewAdminPages: true }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/lib/hooks', () => ({
  useEnrollment: () => ({ data: data.enrollment, mutate: vi.fn() }),
  useEnrollmentSessions: () => ({ data: data.empty }), useLocations: () => ({ data: ['MSA'] }),
  useTutors: () => ({ data: data.tutors }), usePageTitle: vi.fn(), useHolidays: () => ({ data: data.empty }),
  useHideSupersededSessions: () => [false, vi.fn()], useSummerApplication: () => ({}),
}));
vi.mock('swr', () => ({ default: () => ({ data: data.empty }), mutate: vi.fn() }));
vi.mock('@/lib/api', () => ({ tutorsAPI: { getAll: () => Promise.resolve(data.tutors) },
  discountsAPI: { getAll: vi.fn() }, enrollmentsAPI: { update: data.update }, summerAPI: {} }));
vi.mock('@/hooks/usePopoverSheet', () => ({
  useAsSheet: () => false, usePopoverSheet: () => ({}), fitToScreen: () => null,
  PopoverShell: ({ header, children }: { header: ReactNode; children: ReactNode }) => <div>{header}{children}</div>,
}));
vi.mock('@/components/sessions/SessionDetailPopover', () => ({ SessionDetailPopover: () => null }));
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/components/tutors/TutorLink', () => ({ TutorLink: () => <span>Synthetic Tutor</span> }));
vi.mock('./ScheduleChangeReviewModal', () => ({
  ScheduleChangeReviewModal: ({ isOpen, newSchedule }: { isOpen: boolean; newSchedule: { time: string } }) => isOpen ? <div data-testid="schedule-review">{newSchedule.time}</div> : null,
}));

beforeEach(() => {
  data.enrollment.assigned_time = '18:00-19:30';
  data.update.mockReset().mockResolvedValue(data.enrollment);
});

for (const surface of ['page', 'popover'] as const) {
  describe(`enrollment ${surface} time editing`, () => {
    async function open() {
      await act(async () => { render(surface === 'page' ? <EnrollmentDetailPage /> : <EnrollmentDetailPopover
        enrollment={data.enrollment as Enrollment} isOpen onClose={vi.fn()} clickPosition={{ x: 20, y: 20 }} />); });
      fireEvent.click(screen.getByRole('button', { name: 'Edit schedule' }));
    }
    it('opens unspaced custom times in clocks and reviews a formatted valid change', async () => {
      await open();
      expect(screen.getByLabelText('Start time')).toHaveValue('18:00');
      expect(screen.getByLabelText('End time')).toHaveValue('19:30');
      const save = screen.getByRole('button', { name: 'Save' });
      fireEvent.change(screen.getByLabelText('End time'), { target: { value: '17:30' } });
      expect(save).toBeDisabled();
      expect(screen.queryByTestId('schedule-review')).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('End time'), { target: { value: '19:45' } });
      expect(save).toBeEnabled();
      fireEvent.click(save);
      expect(screen.getByTestId('schedule-review')).toHaveTextContent('18:00 - 19:45');
      expect(data.update).not.toHaveBeenCalled();
    });
    it('recognises an unspaced preset and still offers structured custom entry', async () => {
      data.enrollment.assigned_time = '16:45-18:15';
      await open();
      const time = screen.getByLabelText('Time');
      expect(time).toHaveValue('16:45 - 18:15');
      fireEvent.change(time, { target: { value: '__custom__' } });
      expect(screen.getByLabelText('Start time')).toHaveAttribute('type', 'time');
      expect(screen.getByLabelText('End time')).toHaveAttribute('type', 'time');
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
  });
}
