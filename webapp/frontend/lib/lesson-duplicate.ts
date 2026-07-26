/**
 * Shared helpers for the DUPLICATE_LESSON_NUMBER 409 confirm-retry flow.
 * Backend surfaces this when an edit would create two active sessions at the
 * same effective lesson_number for one student. The admin sees the message and
 * either confirms the intentional double-up or cancels out.
 */

import { ApiError } from "@/lib/api";
import type { ConfirmOptions } from "@/contexts/ConfirmContext";

export function extractDuplicatePrompt(err: unknown): string | null {
  // The dialog's buttons ask the question, so drop the backend's trailing one.
  const strip = (msg: string) => msg.replace(/\s*Save anyway\?\s*$/, "");
  // fetchAPI puts detail.message on err.message, so the error code only
  // survives on the structured detail — never string-match err.message alone.
  if (err instanceof ApiError) {
    const detail = err.detail as { error?: unknown; message?: unknown } | null;
    if (detail?.error !== "DUPLICATE_LESSON_NUMBER") return null;
    return strip(
      typeof detail.message === "string" && detail.message
        ? detail.message
        : err.message,
    );
  }
  // Fallback for errors that carry the stringified detail in the message.
  if (!(err instanceof Error)) return null;
  const msg = err.message;
  if (!msg.includes("DUPLICATE_LESSON_NUMBER")) return null;
  const match = msg.match(/Student already has another[^"]*/);
  return strip(
    match ? match[0].replace(/\\?"/g, "").replace(/}$/, "").trim() : msg,
  );
}

export function duplicateConfirmOptions(message: string): ConfirmOptions {
  return {
    title: "Duplicate lesson number",
    message,
    confirmText: "Save anyway",
    variant: "warning",
  };
}

export const DUPLICATE_CANCELLED = Symbol("DUPLICATE_CANCELLED");

export async function confirmDuplicateOrRetry<T>(
  trySave: (force: boolean) => Promise<T>,
  confirm: (options: ConfirmOptions) => Promise<boolean>,
): Promise<T | typeof DUPLICATE_CANCELLED> {
  try {
    return await trySave(false);
  } catch (err) {
    const prompt = extractDuplicatePrompt(err);
    if (!prompt) throw err;
    if (await confirm(duplicateConfirmOptions(prompt))) {
      return trySave(true);
    }
    return DUPLICATE_CANCELLED;
  }
}
