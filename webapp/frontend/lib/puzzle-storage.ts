/**
 * LocalStorage utilities for tracking seen daily puzzles
 * Prevents repetition by maintaining a list of puzzle IDs the user has already seen
 */

const SEEN_KEY = 'daily-puzzle-seen';
const STORAGE_VERSION = 1;

interface SeenPuzzlesStorage {
  version: number;
  seenIds: string[];
  cycleCount: number;
}

/**
 * Get the set of puzzle IDs the user has already seen
 */
export function getSeenPuzzles(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const stored = localStorage.getItem(SEEN_KEY);
    if (!stored) return new Set();

    const parsed: SeenPuzzlesStorage = JSON.parse(stored);
    if (parsed.version !== STORAGE_VERSION) {
      // Version mismatch - reset storage
      return new Set();
    }

    return new Set(parsed.seenIds);
  } catch {
    return new Set();
  }
}

/**
 * Get the full storage object including cycle count
 */
export function getSeenPuzzlesStorage(): SeenPuzzlesStorage {
  if (typeof window === 'undefined') {
    return { version: STORAGE_VERSION, seenIds: [], cycleCount: 0 };
  }

  try {
    const stored = localStorage.getItem(SEEN_KEY);
    if (!stored) {
      return { version: STORAGE_VERSION, seenIds: [], cycleCount: 0 };
    }

    const parsed: SeenPuzzlesStorage = JSON.parse(stored);
    if (parsed.version !== STORAGE_VERSION) {
      return { version: STORAGE_VERSION, seenIds: [], cycleCount: 0 };
    }

    return parsed;
  } catch {
    return { version: STORAGE_VERSION, seenIds: [], cycleCount: 0 };
  }
}

/**
 * Mark a puzzle as seen
 */
export function markPuzzleSeen(puzzleId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const current = getSeenPuzzlesStorage();
    if (!current.seenIds.includes(puzzleId)) {
      current.seenIds.push(puzzleId);
      localStorage.setItem(SEEN_KEY, JSON.stringify(current));
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Reset seen puzzles (when all have been seen)
 * Optionally increment cycle count to vary selection order in subsequent cycles
 */
export function resetSeenPuzzles(incrementCycle = true): void {
  if (typeof window === 'undefined') return;

  try {
    const current = getSeenPuzzlesStorage();
    const newStorage: SeenPuzzlesStorage = {
      version: STORAGE_VERSION,
      seenIds: [],
      cycleCount: incrementCycle ? current.cycleCount + 1 : 0,
    };
    localStorage.setItem(SEEN_KEY, JSON.stringify(newStorage));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get the current cycle count (how many times user has seen all puzzles)
 */
export function getCycleCount(): number {
  return getSeenPuzzlesStorage().cycleCount;
}

/**
 * Get the count of seen puzzles
 */
export function getSeenCount(): number {
  return getSeenPuzzlesStorage().seenIds.length;
}
