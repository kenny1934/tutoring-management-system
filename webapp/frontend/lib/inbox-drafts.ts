// Draft auto-save helpers for Inbox compose and reply

export interface DraftData {
  toTutorId?: number | "all"; // Legacy compat
  recipientMode: "all" | "select";
  selectedTutorIds: number[];
  subject: string;
  message: string;
  priority: "Normal" | "High" | "Urgent";
  category: string;
  uploadedImages: string[];
  savedAt: number;
}

export interface ReplyDraftData {
  message: string;
  images: string[];
  savedAt: number;
}

const DRAFT_COMPOSE_KEY = "inbox-draft-compose";
export const DRAFT_REPLY_PREFIX = "inbox-draft-reply-";
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getDraftKey(replyToId?: number): string {
  return replyToId ? `${DRAFT_REPLY_PREFIX}${replyToId}` : DRAFT_COMPOSE_KEY;
}

export function saveDraft(key: string, draft: DraftData): void {
  try { localStorage.setItem(key, JSON.stringify(draft)); } catch {}
}

export function loadDraft(key: string): DraftData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as DraftData;
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch { return null; }
}

export function clearDraft(key: string): void {
  try { localStorage.removeItem(key); } catch {}
}

export function saveReplyDraft(threadId: number, data: ReplyDraftData): void {
  try { localStorage.setItem(`${DRAFT_REPLY_PREFIX}${threadId}`, JSON.stringify(data)); } catch {}
}

export function loadReplyDraft(threadId: number): ReplyDraftData | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_REPLY_PREFIX}${threadId}`);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ReplyDraftData;
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(`${DRAFT_REPLY_PREFIX}${threadId}`);
      return null;
    }
    return draft;
  } catch { return null; }
}

export function clearReplyDraft(threadId: number): void {
  try { localStorage.removeItem(`${DRAFT_REPLY_PREFIX}${threadId}`); } catch {}
}

export function isReplyDraftEmpty(html: string): boolean {
  return !html || html === "<p></p>" || html.replace(/<[^>]*>/g, "").trim().length === 0;
}
