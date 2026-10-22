import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BillingChecks } from './BillingChecks';
import { billingCheck, orderedBillingIssues } from '@/lib/billing-presentation';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import type { BillingGapEvidence, BillingGapLesson } from '@/types/billing';

describe('billing presentation checks', () => {
  it('explains the exact questioned date and an existing unpaid enrollment', () => {
    const lesson: BillingGapLesson = { session_id: 120, enrollment_id: 12, date: '2026-11-12', status: 'Scheduled', payment_status: 'Pending Payment', time_slot: '16:00 - 17:30', location: 'MSA' };
    const gap: BillingGapEvidence = { date: lesson.date, weekday: 'Thu', time_slot: lesson.time_slot!, location: 'MSA', selected: true, enrollment_id: 13, kind: 'recorded_unpaid', before: { ...lesson, session_id: 110, enrollment_id: 11, date: '2026-11-05', payment_status: 'Paid' }, after: { ...lesson, session_id: 130, enrollment_id: 13, date: '2026-11-19', payment_status: 'Paid' }, matching_lessons: [lesson], nearby_lessons: [] };
    render(<BillingChecks compact issues={[{ code: 'PAID_COVERAGE_GAP', message: 'Check these dates against the enrollment records.', period: null, gap_evidence: [gap] }]} />);
    expect(screen.queryByText('Missing lesson date')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByText('Unpaid session recorded')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Enrollment #12' })).toHaveAttribute('href', '/enrollments/12');
    expect(screen.getByText('Previous recorded')).toBeVisible();
    expect(screen.getByText('Next recorded')).toBeVisible();
    expect(screen.getAllByText('Nov 12, 2026').length).toBe(2);
  });

  it('identifies an unselected timetable and shows nearby dates without calling them replacements', () => {
    const moved: BillingGapLesson = { session_id: 105, enrollment_id: 11, date: '2026-10-16', status: 'Attended', payment_status: 'Paid', time_slot: '16:00 - 17:30', location: 'MSA' };
    const gap: BillingGapEvidence = { date: '2026-10-15', weekday: 'Thu', time_slot: '16:00 - 17:30', location: 'MSA', selected: false, enrollment_id: 11, kind: 'timetable_difference', before: null, after: null, matching_lessons: [], nearby_lessons: [moved] };
    render(<BillingChecks issues={[{ code: 'CONDITIONAL_COVERAGE_GAP', message: 'Check the recorded timetable.', period: null, gap_evidence: [gap] }]} />);
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByText('Other timetable')).toBeVisible();
    expect(screen.getByText('Other lesson dates nearby')).toBeVisible();
    expect(screen.getByText('Oct 16, 2026')).toBeVisible();
    expect(screen.queryByText(/replacement/i)).not.toBeInTheDocument();
  });

  it('shows identical paid and conditional date evidence once without changing either source check', () => {
    const gap: BillingGapEvidence = { date: '2026-10-15', weekday: 'Thu', time_slot: '16:00 - 17:30', location: 'MSA', selected: true, enrollment_id: 11, kind: 'between_enrollments', before: null, after: null, matching_lessons: [], nearby_lessons: [] };
    const issues = [
      { code: 'PAID_COVERAGE_GAP', message: 'Check paid dates.', period: null, gap_evidence: [gap] },
      { code: 'CONDITIONAL_COVERAGE_GAP', message: 'Check paid and unpaid dates.', period: null, gap_evidence: [gap] },
    ];
    render(<BillingChecks issues={issues} />);
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getAllByLabelText('Lesson dates to check')).toHaveLength(1);
    expect(screen.getByText('Check these dates against the enrollment records.')).toBeVisible();
    expect(issues.map(issue => issue.message)).toEqual(['Check paid dates.', 'Check paid and unpaid dates.']);
    expect(issues.map(issue => issue.code)).toEqual(['PAID_COVERAGE_GAP', 'CONDITIONAL_COVERAGE_GAP']);
  });

  it('keeps date checks separate when the supporting records or payment periods differ', () => {
    const gap: BillingGapEvidence = { date: '2026-10-15', weekday: 'Thu', time_slot: '16:00 - 17:30', location: 'MSA', selected: true, enrollment_id: 11, kind: 'between_enrollments', before: null, after: null, matching_lessons: [], nearby_lessons: [] };
    render(<BillingChecks issues={[
      { code: 'PAID_COVERAGE_GAP', message: 'Check paid dates.', period: 1, gap_evidence: [gap] },
      { code: 'CONDITIONAL_COVERAGE_GAP', message: 'Check other records.', period: 1, gap_evidence: [{ ...gap, enrollment_id: 12 }] },
      { code: 'CONDITIONAL_COVERAGE_GAP', message: 'Check another payment.', period: 2, gap_evidence: [gap] },
    ]} />);
    fireEvent.click(screen.getByText('+1 detail'));
    expect(screen.getAllByLabelText('Lesson dates to check')).toHaveLength(3);
    expect(screen.getByText('Check other records.')).toBeVisible();
    expect(screen.getByText('Check another payment.')).toBeVisible();
  });

  it('prioritises blocking checks over warnings and removes only exact duplicates', () => {
    const issues = [
      { code: 'PENDING_BILLS', message: 'There is an unpaid enrollment.', period: null },
      { code: 'PAYMENT_PREFERENCE_REQUIRED', message: 'Record the parent’s preference.', period: null },
      { code: 'SOURCE_OWNERSHIP_REVIEW', message: 'Check the owner of these lessons.', period: null },
      { code: 'SOURCE_OWNERSHIP_REVIEW', message: 'Check the owner of these lessons.', period: null },
      { code: 'SOURCE_OWNERSHIP_REVIEW', message: 'Another enrollment has a different owner.', period: 2 },
    ];
    expect(orderedBillingIssues(issues).map(issue => issue.code)).toEqual(['SOURCE_OWNERSHIP_REVIEW', 'SOURCE_OWNERSHIP_REVIEW', 'PAYMENT_PREFERENCE_REQUIRED', 'PENDING_BILLS']);
    render(<BillingChecks compact maxVisible={1} issues={issues} />);
    expect(screen.getByLabelText('3 payment checks').querySelector('summary')).toHaveTextContent('Check lesson owner');
    expect(screen.getByText('Record the parent’s preference.')).not.toBeVisible();
    fireEvent.click(screen.getByText('+3 details'));
    expect(screen.getByText('Another enrollment has a different owner.')).toBeVisible();
    expect(screen.getByText('Record the parent’s preference.')).toBeVisible();
  });

  it('prioritises a missing amount over routine notes without losing explanations', () => {
    render(<BillingChecks compact maxVisible={1} issues={[
      { code: 'COUPON_SAVED', message: 'Save this coupon for January.', period: 1 },
      { code: 'MATERIALS_UNCONFIRMED', message: 'The materials charge needs confirming.', period: 1 },
    ]} />);
    expect(screen.getByText('Confirm materials fee')).toBeVisible();
    expect(screen.getByText('The materials charge needs confirming.')).not.toBeVisible();
    fireEvent.click(screen.getByText('+1 detail'));
    expect(screen.getByText('Save this coupon for January.')).toBeVisible();
    expect(screen.getByText('The materials charge needs confirming.')).toBeVisible();
  });

  it('retains an unknown future server check as an actionable warning', () => {
    expect(billingCheck('NEW_POLICY_CHECK').severity).toBe('warning');
    render(<BillingChecks issues={[{ code: 'NEW_POLICY_CHECK', message: 'Review this new arrangement.', period: null }]} />);
    expect(screen.getAllByText('Check arrangement').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByText('Review this new arrangement.')).toBeVisible();
  });

  it('keeps routine status notes neutral and uses the singular count', () => {
    expect(billingCheck('PENDING_BILLS').severity).toBe('info');
    render(<BillingChecks compact issues={[{ code: 'PENDING_BILLS', message: 'There is an unpaid enrollment.', period: null }]} />);
    expect(screen.getByText('1 note')).toBeVisible();
  });

  it('does not invent a method or payment status from an unrecorded preference', () => {
    render(<PaymentMethodBadge method={null} />);
    expect(screen.getByText('Not set')).toBeVisible();
    expect(screen.queryByText('Manual')).not.toBeInTheDocument();
    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
  });
});
