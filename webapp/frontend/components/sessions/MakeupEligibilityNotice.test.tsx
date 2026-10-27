import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MakeupEligibilityNotice } from './MakeupEligibilityNotice';
import type { MakeupEligibility } from '@/types';

const eligible: MakeupEligibility = { policy: 'academic_year', status: 'available', can_book: true, valid_until: '2027-06-30', paid_through: '2027-03-31', reason: null, advance_booking: false };
describe('compact makeup eligibility', () => {
  it('makes an advance payment follow-up explicit without blocking the booking', () => {
    render(<MakeupEligibilityNotice eligibility={eligible} targetDate="2027-04-10" compact />);
    expect(screen.getByText('Makeup available')).toBeVisible();
    expect(screen.getByText('Check payment before this lesson.')).toBeVisible();
  });
  it('does not label a future participation pause as an expired makeup', () => {
    render(<MakeupEligibilityNotice eligibility={{ ...eligible, participation_blocks: [{ from_date: '2027-04-01', through_date: '2027-04-30', status: 'Paused' }] }} targetDate="2027-04-10" />);
    expect(screen.getByText('Cannot book this date')).toBeVisible();
    expect(screen.getByText('The student is paused on this date.')).toBeVisible();
    expect(screen.queryByText('Past makeup deadline')).not.toBeInTheDocument();
  });
  it('leaves legacy sessions without a new policy notice', () => {
    render(<MakeupEligibilityNotice />);
    expect(screen.queryByLabelText('Makeup eligibility')).not.toBeInTheDocument();
  });
});
