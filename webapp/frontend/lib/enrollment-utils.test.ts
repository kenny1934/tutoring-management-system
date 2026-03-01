import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDisplayPaymentStatus, getPaymentStatusConfig, getIsNewStudentParam } from './enrollment-utils';
import type { Enrollment } from '@/types';

// Helper to create minimal enrollment for testing
const createEnrollment = (overrides: Partial<Enrollment> = {}): Enrollment => ({
  id: 1,
  student_id: 1,
  student_name: 'Test Student',
  payment_status: 'Paid',
  ...overrides,
} as Enrollment);

describe('getDisplayPaymentStatus', () => {
  beforeEach(() => {
    // Mock current date to 2024-06-15
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns Paid for paid enrollments', () => {
    const enrollment = createEnrollment({ payment_status: 'Paid' });
    expect(getDisplayPaymentStatus(enrollment)).toBe('Paid');
  });

  it('returns Pending Payment for future first lesson', () => {
    const enrollment = createEnrollment({
      payment_status: 'Pending Payment',
      first_lesson_date: '2024-06-20', // Future date
    });
    expect(getDisplayPaymentStatus(enrollment)).toBe('Pending Payment');
  });

  it('returns Overdue when first lesson date has passed', () => {
    const enrollment = createEnrollment({
      payment_status: 'Pending Payment',
      first_lesson_date: '2024-06-10', // Past date
    });
    expect(getDisplayPaymentStatus(enrollment)).toBe('Overdue');
  });

  it('returns Overdue when first lesson is today', () => {
    const enrollment = createEnrollment({
      payment_status: 'Pending Payment',
      first_lesson_date: '2024-06-15', // Today
    });
    expect(getDisplayPaymentStatus(enrollment)).toBe('Overdue');
  });

  it('returns Pending Payment when no first lesson date', () => {
    const enrollment = createEnrollment({
      payment_status: 'Pending Payment',
      first_lesson_date: undefined,
    });
    expect(getDisplayPaymentStatus(enrollment)).toBe('Pending Payment');
  });

  it('returns empty string for null payment status', () => {
    const enrollment = createEnrollment({ payment_status: null as unknown as string });
    expect(getDisplayPaymentStatus(enrollment)).toBe('');
  });
});

describe('getPaymentStatusConfig', () => {
  it('returns green config for Paid status', () => {
    const config = getPaymentStatusConfig('Paid');
    expect(config.bgClass).toBe('bg-green-500');
    expect(config.bgTint).toContain('green');
  });

  it('returns red config for Overdue status', () => {
    const config = getPaymentStatusConfig('Overdue');
    expect(config.bgClass).toBe('bg-red-500');
    expect(config.bgTint).toContain('red');
  });

  it('returns amber config for Pending Payment status', () => {
    const config = getPaymentStatusConfig('Pending Payment');
    expect(config.bgClass).toBe('bg-amber-500');
    expect(config.bgTint).toContain('amber');
  });

  it('returns gray config for unknown status', () => {
    const config = getPaymentStatusConfig('Unknown');
    expect(config.bgClass).toBe('bg-gray-400');
    expect(config.bgTint).toContain('gray');
  });
});

describe('getIsNewStudentParam', () => {
  it('returns undefined for Trial enrollments', () => {
    expect(getIsNewStudentParam({ enrollment_type: 'Trial' })).toBeUndefined();
  });

  it('returns undefined for Trial even when is_new_student is set', () => {
    expect(getIsNewStudentParam({ enrollment_type: 'Trial', is_new_student: true })).toBeUndefined();
  });

  it('returns true when is_new_student is true', () => {
    expect(getIsNewStudentParam({ enrollment_type: 'Regular', is_new_student: true })).toBe(true);
  });

  it('returns false when is_new_student is false', () => {
    expect(getIsNewStudentParam({ enrollment_type: 'Regular', is_new_student: false })).toBe(false);
  });

  it('returns undefined when is_new_student is undefined', () => {
    expect(getIsNewStudentParam({ enrollment_type: 'Regular' })).toBeUndefined();
  });
});
