import useSWR, { SWRConfiguration } from 'swr';
import { sessionsAPI, tutorsAPI } from './api';
import type { Session, SessionFilters, Tutor } from '@/types';

// SWR configuration for optimal caching behavior
// - revalidateOnFocus: Auto-refresh when tutor tabs back (important during lessons)
// - revalidateOnReconnect: Don't refetch on network reconnect (reduces unnecessary calls)
// - dedupingInterval: Prevent duplicate calls within 5 seconds
const swrConfig: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateOnReconnect: false,
  dedupingInterval: 5000,
};

/**
 * Hook for fetching sessions list with filters
 * Returns cached data immediately, then revalidates in background
 */
export function useSessions(filters?: SessionFilters) {
  // Create a stable cache key from filters
  const key = filters ? ['sessions', JSON.stringify(filters)] : ['sessions'];

  return useSWR<Session[]>(
    key,
    () => sessionsAPI.getAll(filters),
    swrConfig
  );
}

/**
 * Hook for fetching a single session by ID
 * Returns null key when id is falsy to skip fetching
 */
export function useSession(id: number | null | undefined) {
  return useSWR<Session>(
    id ? ['session', id] : null,
    () => sessionsAPI.getById(id!),
    swrConfig
  );
}

/**
 * Hook for fetching tutors list
 */
export function useTutors() {
  return useSWR<Tutor[]>(
    'tutors',
    () => tutorsAPI.getAll(),
    swrConfig
  );
}
