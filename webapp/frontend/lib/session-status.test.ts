import { describe, it, expect } from 'vitest';
import {
  getSessionStatusConfig,
  getStatusSortOrder,
  getDisplayStatus,
  getProposalIndicatorConfig,
  isCountableSession,
} from './session-status';

describe('getSessionStatusConfig', () => {
  it('returns correct config for Scheduled status', () => {
    const config = getSessionStatusConfig('Scheduled');
    expect(config.bgClass).toBe('bg-sky-400');
    expect(config.textClass).toContain('sky');
    expect(config.strikethrough).toBeUndefined();
  });

  it('returns correct config for Attended status', () => {
    const config = getSessionStatusConfig('Attended');
    expect(config.bgClass).toBe('bg-green-600');
    expect(config.textClass).toContain('green');
  });

  it('returns correct config for Trial Class', () => {
    const config = getSessionStatusConfig('Trial Class');
    expect(config.bgClass).toBe('bg-blue-500');
    expect(config.textClass).toContain('blue');
  });

  it('returns correct config for Make-up Class', () => {
    const config = getSessionStatusConfig('Make-up Class');
    expect(config.bgClass).toBe('bg-yellow-500');
    expect(config.textClass).toContain('yellow');
  });

  it('returns strikethrough for Cancelled status', () => {
    const config = getSessionStatusConfig('Cancelled');
    expect(config.strikethrough).toBe(true);
  });

  it('returns strikethrough for No Show status', () => {
    const config = getSessionStatusConfig('No Show');
    expect(config.strikethrough).toBe(true);
  });

  it('handles Pending Make-up suffix pattern', () => {
    const config = getSessionStatusConfig('Rescheduled - Pending Make-up');
    expect(config.bgClass).toBe('bg-orange-500');
    expect(config.strikethrough).toBe(true);
  });

  it('handles Make-up Booked suffix pattern', () => {
    const config = getSessionStatusConfig('Sick Leave - Make-up Booked');
    expect(config.bgClass).toBe('bg-gray-400');
    expect(config.strikethrough).toBe(true);
  });

  it('returns default config for unknown status', () => {
    const config = getSessionStatusConfig('Unknown Status');
    expect(config.bgClass).toBe('bg-[#d4a574]');
  });

  it('handles undefined status', () => {
    const config = getSessionStatusConfig(undefined);
    expect(config.bgClass).toBe('bg-[#d4a574]');
  });

  it('handles empty string status', () => {
    const config = getSessionStatusConfig('');
    expect(config.bgClass).toBe('bg-[#d4a574]');
  });
});

describe('getStatusSortOrder', () => {
  it('Trial Class has highest priority (1)', () => {
    expect(getStatusSortOrder('Trial Class')).toBe(1);
  });

  it('Scheduled has priority 2', () => {
    expect(getStatusSortOrder('Scheduled')).toBe(2);
  });

  it('Make-up Class has priority 3', () => {
    expect(getStatusSortOrder('Make-up Class')).toBe(3);
  });

  it('Attended has priority 4', () => {
    expect(getStatusSortOrder('Attended')).toBe(4);
  });

  it('Cancelled has lowest defined priority', () => {
    expect(getStatusSortOrder('Cancelled')).toBe(13);
  });

  it('Unknown status returns 99', () => {
    expect(getStatusSortOrder('Unknown')).toBe(99);
  });

  it('undefined status returns 99', () => {
    expect(getStatusSortOrder(undefined)).toBe(99);
  });

  it('maintains correct ordering hierarchy', () => {
    const statuses = [
      'Cancelled',
      'Attended',
      'Trial Class',
      'Scheduled',
      'Make-up Class',
    ];
    const sorted = [...statuses].sort(
      (a, b) => getStatusSortOrder(a) - getStatusSortOrder(b)
    );
    expect(sorted).toEqual([
      'Trial Class',
      'Scheduled',
      'Make-up Class',
      'Attended',
      'Cancelled',
    ]);
  });
});

describe('getDisplayStatus', () => {
  it('returns Attended (Trial) when attended trial class', () => {
    const result = getDisplayStatus({
      session_status: 'Attended',
      previous_session_status: 'Trial Class',
    });
    expect(result).toBe('Attended (Trial)');
  });

  it('returns original status when not attended trial', () => {
    const result = getDisplayStatus({
      session_status: 'Attended',
      previous_session_status: 'Scheduled',
    });
    expect(result).toBe('Attended');
  });

  it('returns original status when no previous status', () => {
    const result = getDisplayStatus({
      session_status: 'Scheduled',
    });
    expect(result).toBe('Scheduled');
  });
});

describe('getProposalIndicatorConfig', () => {
  it('returns singular text for 1 slot', () => {
    const config = getProposalIndicatorConfig(1);
    expect(config.badgeText).toBe('1 slot proposed');
  });

  it('returns plural text for multiple slots', () => {
    const config = getProposalIndicatorConfig(3);
    expect(config.badgeText).toBe('3 slots proposed');
  });

  it('returns amber styling', () => {
    const config = getProposalIndicatorConfig(1);
    expect(config.className).toContain('amber');
    expect(config.iconClassName).toContain('amber');
  });
});

describe('isCountableSession', () => {
  it('returns true for Scheduled sessions', () => {
    expect(isCountableSession({ session_status: 'Scheduled' })).toBe(true);
  });

  it('returns true for Attended sessions', () => {
    expect(isCountableSession({ session_status: 'Attended' })).toBe(true);
  });

  it('returns true for No Show sessions', () => {
    expect(isCountableSession({ session_status: 'No Show' })).toBe(true);
  });

  it('returns false for Cancelled sessions', () => {
    expect(isCountableSession({ session_status: 'Cancelled' })).toBe(false);
  });

  it('returns false for Pending Make-up sessions', () => {
    expect(isCountableSession({ session_status: 'Rescheduled - Pending Make-up' })).toBe(false);
  });

  it('returns false for Make-up Booked sessions', () => {
    expect(isCountableSession({ session_status: 'Sick Leave - Make-up Booked' })).toBe(false);
  });
});
