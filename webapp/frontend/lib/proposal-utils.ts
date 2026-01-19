import type { MakeupProposal, MakeupProposalSlot, Session } from '@/types';

/**
 * Represents a proposed session slot displayed as a "ghost" session
 * in session views. Contains all fields needed to render alongside real sessions.
 */
export interface ProposedSession {
  // Unique identifier for React keys: `proposal-${proposalId}-slot-${slotId}`
  id: string;

  // Flag to distinguish from real sessions
  isProposed: true;

  // Original proposal and slot data for detail modal
  proposal: MakeupProposal;
  slot: MakeupProposalSlot;

  // Session-like fields derived from slot
  session_date: string;
  time_slot: string;
  tutor_id: number;
  tutor_name: string;
  location: string;

  // From original session (the missed lesson)
  student_id: number;
  student_name: string;
  enrollment_id: number;
  school_student_id?: string;
  grade?: string;
  lang_stream?: string;
  school?: string;

  // Slot status
  slot_status: 'pending' | 'approved' | 'rejected';
}

/**
 * Converts an array of MakeupProposals into an array of ProposedSession objects.
 * Each pending slot becomes a separate ghost session entry.
 *
 * @param proposals - Array of proposals (should include original_session)
 * @returns Array of ProposedSession objects sorted by date and time
 */
export function proposalSlotsToSessions(proposals: MakeupProposal[]): ProposedSession[] {
  const proposedSessions: ProposedSession[] = [];

  for (const proposal of proposals) {
    // Skip if no original session data
    if (!proposal.original_session) continue;

    const session = proposal.original_session;

    // Only include pending slots (approved slots become real sessions)
    const pendingSlots = proposal.slots.filter(s => s.slot_status === 'pending');

    for (const slot of pendingSlots) {
      proposedSessions.push({
        id: `proposal-${proposal.id}-slot-${slot.id}`,
        isProposed: true,
        proposal,
        slot,

        // From slot
        session_date: slot.proposed_date,
        time_slot: slot.proposed_time_slot,
        tutor_id: slot.proposed_tutor_id,
        tutor_name: slot.proposed_tutor_name || 'Unknown',
        location: slot.proposed_location,
        slot_status: slot.slot_status,

        // From original session
        student_id: session.student_id,
        student_name: session.student_name || 'Unknown Student',
        enrollment_id: session.enrollment_id,
        school_student_id: session.school_student_id,
        grade: session.grade,
        lang_stream: session.lang_stream,
        school: session.school,
      });
    }
  }

  // Sort by date and time
  return proposedSessions.sort((a, b) => {
    const dateCompare = a.session_date.localeCompare(b.session_date);
    if (dateCompare !== 0) return dateCompare;
    return a.time_slot.localeCompare(b.time_slot);
  });
}

/**
 * Creates a map from original session ID to its active proposal.
 * Used to show proposal indicators on sessions that have pending proposals.
 *
 * @param proposals - Array of pending proposals
 * @returns Map of session_id -> MakeupProposal
 */
export function createSessionProposalMap(proposals: MakeupProposal[]): Map<number, MakeupProposal> {
  const map = new Map<number, MakeupProposal>();
  for (const proposal of proposals) {
    if (proposal.status === 'pending') {
      map.set(proposal.original_session_id, proposal);
    }
  }
  return map;
}

/**
 * Helper to merge proposed sessions into a regular session array for display.
 * Real sessions come first if on the same date/time.
 *
 * @param sessions - Array of real sessions
 * @param proposedSessions - Array of proposed sessions
 * @returns Combined array sorted by date and time
 */
export function mergeSessionsWithProposed(
  sessions: Session[],
  proposedSessions: ProposedSession[]
): (Session | ProposedSession)[] {
  const combined: (Session | ProposedSession)[] = [...sessions, ...proposedSessions];

  return combined.sort((a, b) => {
    const dateA = 'session_date' in a ? a.session_date : '';
    const dateB = 'session_date' in b ? b.session_date : '';
    const dateCompare = dateA.localeCompare(dateB);
    if (dateCompare !== 0) return dateCompare;

    const timeA = 'time_slot' in a ? a.time_slot : '';
    const timeB = 'time_slot' in b ? b.time_slot : '';
    const timeCompare = timeA.localeCompare(timeB);
    if (timeCompare !== 0) return timeCompare;

    // Real sessions before proposed on same date/time
    const aIsProposed = 'isProposed' in a && a.isProposed;
    const bIsProposed = 'isProposed' in b && b.isProposed;
    if (aIsProposed && !bIsProposed) return 1;
    if (!aIsProposed && bIsProposed) return -1;
    return 0;
  });
}

/**
 * Type guard to check if a session is a ProposedSession
 */
export function isProposedSession(
  session: Session | ProposedSession
): session is ProposedSession {
  return 'isProposed' in session && session.isProposed === true;
}

/**
 * Get the count of pending slots for a proposal
 */
export function getPendingSlotCount(proposal: MakeupProposal): number {
  return proposal.slots.filter(s => s.slot_status === 'pending').length;
}
