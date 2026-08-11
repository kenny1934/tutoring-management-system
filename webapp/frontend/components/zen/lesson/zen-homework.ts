import type { HomeworkStatus } from "@/types";

/**
 * How homework marking reads and behaves in Zen.
 *
 * The overlay's legend, the help overlay's shortcut list and the keyboard
 * handler all read this, so a key cannot silently do something other than what
 * the screen says it does.
 */
// Keyed in ladder order, so the digits run the same way the states do.
export const MARK_KEYS: { key: string; label: string; status: HomeworkStatus }[] = [
  { key: "1", label: "handed in", status: "Submitted" },
  { key: "2", label: "done", status: "Completed" },
  { key: "3", label: "partly done", status: "Partially Completed" },
  { key: "4", label: "not done", status: "Not Completed" },
  { key: "0", label: "clear", status: "Not Checked" },
];

/** The status a key sets, or undefined if that key means something else. */
export function statusForKey(key: string): HomeworkStatus | undefined {
  return MARK_KEYS.find((k) => k.key === key)?.status;
}

/** Terminal-style marker for each state, so a glance reads the whole list. */
export function statusGlyph(status: HomeworkStatus | undefined): { mark: string; colour: string } {
  switch (status) {
    case "Submitted":
      // In hand, still owed a verdict, so it reads as open rather than done.
      return { mark: "[>]", colour: "var(--zen-accent)" };
    case "Completed":
      return { mark: "[x]", colour: "var(--zen-success)" };
    case "Partially Completed":
      return { mark: "[~]", colour: "var(--zen-warning)" };
    case "Not Completed":
      return { mark: "[!]", colour: "var(--zen-error)" };
    default:
      return { mark: "[ ]", colour: "var(--zen-dim)" };
  }
}
