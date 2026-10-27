import type { Session, SessionFilters } from '@/types';

/** Pending roots use a bounded page size, including when staff inspect earlier years. */
export async function loadPendingMakeups(filters: SessionFilters, fetchPage: (filters: SessionFilters) => Promise<Session[]>) {
  const sessions = new Map<number, Session>();
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const page = await fetchPage({ ...filters, pending_makeups: true, limit, offset });
    const before = sessions.size;
    page.forEach(session => sessions.set(session.id, session));
    if (page.length < limit) return [...sessions.values()];
    if (sessions.size === before) throw new Error('Could not load the next page of pending makeups. Retry the list.');
  }
}
