import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrialsQuickLink } from './TrialsQuickLink';

const mocks = vi.hoisted(() => ({ create: vi.fn(), detail: vi.fn(), refresh: vi.fn() }));
const trial = { enrollment_id: 70, student_id: 4, student_name: 'Example Student', tutor_id: 9, tutor_name: 'Tutor Nine', session_id: 71,
  session_date: new Date().toISOString().slice(0, 10), time_slot: '16:00 - 17:30', location: 'MSA', trial_status: 'pending' };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, isAdmin: true, effectiveRole: 'Admin' }) }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: () => ({ selectedLocation: 'MSA' }) }));
vi.mock('@/lib/api', () => ({ enrollmentsAPI: { getTrials: vi.fn() } }));
vi.mock('swr', () => ({ default: () => ({ data: [trial], isLoading: false, mutate: mocks.refresh }) }));
vi.mock('@/components/ui/student-info-badges', () => ({ StudentInfoBadges: () => <span>Example Student</span> }));
vi.mock('@/components/tutors/TutorLink', () => ({ TutorLink: () => <span>Tutor Nine</span> }));
vi.mock('@/components/parent-contacts/RecordContactModal', () => ({ RecordContactModal: () => null }));
vi.mock('@/components/enrollments/EnrollmentDetailModal', () => ({ EnrollmentDetailModal: (props: { onClose: () => void }) => { mocks.detail(props); return <button onClick={props.onClose}>Close original trial</button>; } }));
vi.mock('@/components/enrollments/CreateEnrollmentModal', () => ({ CreateEnrollmentModal: (props: { onBusyChange: (value: boolean) => void; onSuccess: () => void }) => {
  mocks.create(props); return <div><input aria-label="Selected first regular lesson" defaultValue="2026-11-13" /><button onClick={() => props.onBusyChange(true)}>Hold creation</button><button onClick={() => props.onBusyChange(false)}>Release creation</button><button onClick={props.onSuccess}>Done creating</button></div>;
} }));
vi.mock('@/hooks/usePopoverSheet', () => ({ fitToScreen: () => ({}) }));
vi.mock('@floating-ui/react', () => ({
  useFloating: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => ({ refs: { setReference: vi.fn(), setFloating: vi.fn() }, floatingStyles: {}, context: props }),
  offset: vi.fn(), flip: vi.fn(), shift: vi.fn(), useClick: (context: unknown) => context, useDismiss: vi.fn(),
  useInteractions: (values: { open: boolean; onOpenChange: (open: boolean) => void }[]) => ({ getReferenceProps: () => ({ onClick: () => values[0].onOpenChange(!values[0].open) }), getFloatingProps: () => ({}) }),
  FloatingPortal: ({ children }: { children: React.ReactNode }) => children,
}));

let availableWidth = 800;
let notify: () => void;
let originalObserver: typeof ResizeObserver;
beforeEach(() => {
  vi.clearAllMocks(); availableWidth = 800;
  const host = document.createElement('div'); host.setAttribute('data-dashboard-frame', '');
  const main = document.createElement('main'); main.id = 'main-content'; host.append(main); document.body.append(host);
  originalObserver = global.ResizeObserver;
  global.ResizeObserver = class { constructor(callback: ResizeObserverCallback) { notify = () => callback([], this as unknown as ResizeObserver); } observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { width: this.hasAttribute('data-trial-workspace') ? availableWidth : 0, height: 800, x: 0, y: 0, top: 0, left: 0, bottom: 800, right: availableWidth, toJSON: () => ({}) };
  });
});
afterEach(() => { document.querySelectorAll('[data-dashboard-frame]').forEach(element => element.remove()); global.ResizeObserver = originalObserver; vi.restoreAllMocks(); });

function openConversion() {
  fireEvent.click(screen.getByRole('button', { name: /^Trials/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Convert' }));
}

describe('dashboard trial conversion', () => {
  it('uses the shared app-width workspace and retains the chosen first date across sidebar changes', async () => {
    render(<TrialsQuickLink />); openConversion();
    await screen.findByLabelText('Selected first regular lesson');
    const overlay = document.querySelector('[data-trial-workspace="conversion"]')!;
    expect(overlay.parentElement).toHaveAttribute('data-dashboard-frame');
    expect(overlay).toHaveAttribute('data-workspace-layout', 'tabs');
    expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ convertFromTrial: trial, standalone: false, onBusyChange: expect.any(Function) }));
    const input = screen.getByLabelText('Selected first regular lesson');
    fireEvent.change(input, { target: { value: '2026-11-20' } });
    for (const width of [1000, 1200, 800, 1100]) act(() => { availableWidth = width; notify(); });
    expect(screen.getByLabelText('Selected first regular lesson')).toBe(input);
    expect(input).toHaveValue('2026-11-20');
  });

  it('guards parent dismissal during creation and refreshes the quick link after completion', async () => {
    render(<TrialsQuickLink />); openConversion();
    fireEvent.click(await screen.findByRole('button', { name: 'Hold creation' }));
    const overlay = document.querySelector('[data-trial-workspace="conversion"]')!;
    fireEvent.click(overlay.firstElementChild!);
    act(() => mocks.detail.mock.lastCall![0].onClose());
    expect(screen.getByRole('tab', { name: 'Trial details' })).toBeDisabled();
    expect(screen.getByLabelText('Selected first regular lesson')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Release creation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done creating' }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.querySelector('[data-trial-workspace="conversion"]')).not.toBeInTheDocument());
  });
});
