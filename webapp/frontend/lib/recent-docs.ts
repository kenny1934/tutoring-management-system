const KEY = "doc-recent-views";
const MAX = 30;

interface RecentEntry {
  id: number;
  viewedAt: number;
}

function load(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function save(entries: RecentEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

/** Return recently viewed doc IDs, most recent first. */
export function getRecentDocIds(): number[] {
  return load()
    .sort((a, b) => b.viewedAt - a.viewedAt)
    .map((e) => e.id);
}

/** Record that a document was viewed now. */
export function trackDocView(id: number): void {
  const entries = load().filter((e) => e.id !== id);
  entries.unshift({ id, viewedAt: Date.now() });
  save(entries.slice(0, MAX));
}
