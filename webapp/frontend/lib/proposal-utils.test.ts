import { describe, it, expect } from 'vitest';
import {
  proposalSlotsToSessions,
  createSessionProposalMap,
  mergeSessionsWithProposed,
  isProposedSession,
  getPendingSlotCount,
} from './proposal-utils';
import type { MakeupProposal, MakeupProposalSlot, Session } from '@/types';

// Minimal factories
const makeSlot = (overrides: Partial<MakeupProposalSlot> = {}): MakeupProposalSlot => ({
  id: 1,
  proposal_id: 1,
  slot_order: 1,
  proposed_date: '2026-03-16',
  proposed_time_slot: '15:00 - 16:30',
  proposed_tutor_id: 1,
  proposed_tutor_name: 'Mr. Wong',
  proposed_location: 'MSA',
  slot_status: 'pending',
  ...overrides,
} as MakeupProposalSlot);

const makeProposal = (overrides: Partial<MakeupProposal> = {}): MakeupProposal => ({
  id: 1,
  original_session_id: 100,
  proposed_by_tutor_id: 1,
  proposal_type: 'tutor_proposed',
  status: 'pending',
  created_at: '2026-03-10T10:00:00Z',
  slots: [makeSlot()],
  original_session: {
    student_id: 10,
    student_name: 'Alice',
    enrollment_id: 50,
  } as Session,
  ...overrides,
} as MakeupProposal);

// ============================================================================
// proposalSlotsToSessions
// ============================================================================

describe('proposalSlotsToSessions', () => {
  it('converts pending slots to proposed sessions', () => {
    const result = proposalSlotsToSessions([makeProposal()]);
    expect(result).toHaveLength(1);
    expect(result[0].isProposed).toBe(true);
    expect(result[0].student_name).toBe('Alice');
    expect(result[0].session_date).toBe('2026-03-16');
  });

  it('filters out non-pending slots', () => {
    const proposal = makeProposal({
      slots: [
        makeSlot({ id: 1, slot_status: 'pending' }),
        makeSlot({ id: 2, slot_status: 'approved' }),
        makeSlot({ id: 3, slot_status: 'rejected' }),
      ],
    });
    const result = proposalSlotsToSessions([proposal]);
    expect(result).toHaveLength(1);
    expect(result[0].slot.id).toBe(1);
  });

  it('skips proposals without original_session', () => {
    const proposal = makeProposal({ original_session: undefined });
    const result = proposalSlotsToSessions([proposal]);
    expect(result).toHaveLength(0);
  });

  it('sorts by date then time', () => {
    const proposal = makeProposal({
      slots: [
        makeSlot({ id: 1, proposed_date: '2026-03-18', proposed_time_slot: '10:00 - 11:30' }),
        makeSlot({ id: 2, proposed_date: '2026-03-16', proposed_time_slot: '15:00 - 16:30' }),
        makeSlot({ id: 3, proposed_date: '2026-03-16', proposed_time_slot: '10:00 - 11:30' }),
      ],
    });
    const result = proposalSlotsToSessions([proposal]);
    expect(result[0].slot.id).toBe(3);
    expect(result[1].slot.id).toBe(2);
    expect(result[2].slot.id).toBe(1);
  });
});

// ============================================================================
// createSessionProposalMap
// ============================================================================

describe('createSessionProposalMap', () => {
  it('maps session_id to pending proposal', () => {
    const map = createSessionProposalMap([makeProposal()]);
    expect(map.get(100)).toBeDefined();
    expect(map.get(100)!.id).toBe(1);
  });

  it('ignores non-pending proposals', () => {
    const map = createSessionProposalMap([
      makeProposal({ status: 'resolved' } as Partial<MakeupProposal>),
    ]);
    expect(map.size).toBe(0);
  });
});

// ============================================================================
// mergeSessionsWithProposed
// ============================================================================

describe('mergeSessionsWithProposed', () => {
  it('combines and sorts by date', () => {
    const sessions = [{ session_date: '2026-03-20', time_slot: '10:00 - 11:30' } as Session];
    const proposed = proposalSlotsToSessions([makeProposal()]);
    const result = mergeSessionsWithProposed(sessions, proposed);
    expect(result).toHaveLength(2);
    // Proposed (Mar 16) before real (Mar 20)
    expect(result[0].session_date).toBe('2026-03-16');
    expect(result[1].session_date).toBe('2026-03-20');
  });

  it('real sessions come before proposed on same date/time', () => {
    const sessions = [{
      session_date: '2026-03-16',
      time_slot: '15:00 - 16:30',
    } as Session];
    const proposed = proposalSlotsToSessions([makeProposal()]);
    const result = mergeSessionsWithProposed(sessions, proposed);
    expect(result).toHaveLength(2);
    expect('isProposed' in result[0]).toBe(false); // real first
    expect('isProposed' in result[1] && result[1].isProposed).toBe(true);
  });
});

// ============================================================================
// isProposedSession
// ============================================================================

describe('isProposedSession', () => {
  it('returns true for proposed session', () => {
    const proposed = proposalSlotsToSessions([makeProposal()])[0];
    expect(isProposedSession(proposed)).toBe(true);
  });

  it('returns false for real session', () => {
    expect(isProposedSession({ session_date: '2026-03-16' } as Session)).toBe(false);
  });
});

// ============================================================================
// getPendingSlotCount
// ============================================================================

describe('getPendingSlotCount', () => {
  it('counts pending slots', () => {
    const proposal = makeProposal({
      slots: [
        makeSlot({ slot_status: 'pending' }),
        makeSlot({ slot_status: 'approved' }),
        makeSlot({ slot_status: 'pending' }),
      ],
    });
    expect(getPendingSlotCount(proposal)).toBe(2);
  });

  it('returns 0 when no pending slots', () => {
    const proposal = makeProposal({
      slots: [makeSlot({ slot_status: 'approved' })],
    });
    expect(getPendingSlotCount(proposal)).toBe(0);
  });
});
