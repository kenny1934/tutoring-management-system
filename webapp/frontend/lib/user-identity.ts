/**
 * User Identity utilities.
 * Provides a persistent local user ID for browser-local settings storage.
 * This ID will be replaced with OAuth user ID when auth is implemented.
 */

const USER_ID_KEY = 'tms-local-user-id';

/**
 * Generate a UUID v4.
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get the local user ID.
 * Creates a new UUID if one doesn't exist.
 */
export function getLocalUserId(): string {
  if (typeof window === 'undefined') {
    // SSR - return empty, will be populated on client
    return '';
  }

  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = generateUUID();
    localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}

/**
 * Set the user ID (for OAuth transition).
 * Call this when user authenticates via OAuth to replace the local ID.
 */
export function setUserId(id: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(USER_ID_KEY, id);
  }
}

/**
 * Clear the user ID (for logout).
 */
export function clearUserId(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(USER_ID_KEY);
  }
}

/**
 * Check if user has a local ID set.
 */
export function hasLocalUserId(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return !!localStorage.getItem(USER_ID_KEY);
}
