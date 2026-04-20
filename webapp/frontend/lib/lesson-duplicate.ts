/**
 * Shared helpers for the DUPLICATE_LESSON_NUMBER 409 confirm-retry flow.
 * Backend surfaces this when an edit would create two active sessions at the
 * same effective lesson_number for one student. The admin sees the message and
 * either confirms the intentional double-up or cancels out.
 */

export function extractDuplicatePrompt(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const msg = err.message;
  if (!msg.includes("DUPLICATE_LESSON_NUMBER")) return null;
  const match = msg.match(/Student already has another[^"]*/);
  return match ? match[0].replace(/\\?"/g, "").replace(/}$/, "").trim() : msg;
}

export const DUPLICATE_CANCELLED = Symbol("DUPLICATE_CANCELLED");

export async function confirmDuplicateOrRetry<T>(
  trySave: (force: boolean) => Promise<T>,
): Promise<T | typeof DUPLICATE_CANCELLED> {
  try {
    return await trySave(false);
  } catch (err) {
    const prompt = extractDuplicatePrompt(err);
    if (!prompt) throw err;
    if (typeof window !== "undefined" && window.confirm(prompt)) {
      return trySave(true);
    }
    return DUPLICATE_CANCELLED;
  }
}
