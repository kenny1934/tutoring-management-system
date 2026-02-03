/**
 * Custom hooks for state management and business logic.
 *
 * All hooks should be exported from this index file for consistent imports:
 *   import { useBulkSelection, useWeather } from '@/lib/hooks';
 */

// Session management hooks
export { useBulkSelection } from './useBulkSelection';
export { useBulkSessionActions, type BulkActionType } from './useBulkSessionActions';
export { useGroupedSessions, type TimeSlotGroup, type SessionStats } from './useGroupedSessions';

// Calendar and sync hooks
export { useCalendarSync } from './useCalendarSync';

// UI interaction hooks
export { useSwipeGesture } from './useSwipeGesture';
export { useMapSelection, type DocSelection } from './useMapSelection';
export { useKonamiCode } from './useKonamiCode';

// Feature hooks
export { useWeather, getWeatherIcon, getWeatherDescription } from './useWeather';
export { useDailyPuzzle } from './useDailyPuzzle';
