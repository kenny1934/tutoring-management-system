/**
 * Shelv (Paperless-ngx) localStorage utilities
 * Stores recent document selections for quick access
 */

const RECENT_KEY = 'shelv-recent-documents';
const MAX_RECENT = 20;

export interface RecentDocument {
  id: number;
  title: string;
  path: string;
  tags: string[];
  usedAt: string; // ISO timestamp
}

/**
 * Get recent documents from localStorage
 */
export function getRecentDocuments(): RecentDocument[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(RECENT_KEY);
    if (!stored) return [];

    const docs = JSON.parse(stored) as RecentDocument[];
    // Filter out any malformed entries
    return docs.filter(d => d.id && d.title && d.path);
  } catch {
    return [];
  }
}

/**
 * Add a document to recent history
 * If already exists, moves it to the top
 */
export function addRecentDocument(doc: Omit<RecentDocument, 'usedAt'>): void {
  if (typeof window === 'undefined') return;

  try {
    const existing = getRecentDocuments();

    // Remove if already exists (will re-add at top)
    const filtered = existing.filter(d => d.id !== doc.id);

    // Add to front with timestamp
    const updated: RecentDocument[] = [
      { ...doc, usedAt: new Date().toISOString() },
      ...filtered
    ].slice(0, MAX_RECENT);

    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear all recent documents
 */
export function clearRecentDocuments(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // Ignore storage errors
  }
}
