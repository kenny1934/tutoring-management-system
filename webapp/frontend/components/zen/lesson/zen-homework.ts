import type { HomeworkStatus } from "@/types";

/**
 * How homework marking reads and behaves in Zen.
 *
 * The overlay's legend, the help overlay's shortcut list and the keyboard
 * handler all read this, so a key cannot silently do something other than what
 * the screen says it does.
 */
export const MARK_KEYS: { key: string; label: string; status: HomeworkStatus }[] = [
  { key: "1", label: "done", status: "Completed" },
  { key: "2", label: "partly done", status: "Partially Completed" },
  { key: "3", label: "not done", status: "Not Completed" },
  { key: "0", label: "clear", status: "Not Checked" },
];

/** The status a key sets, or undefined if that key means something else. */
export function statusForKey(key: string): HomeworkStatus | undefined {
  return MARK_KEYS.find((k) => k.key === key)?.status;
}

/** Terminal-style marker for each state, so a glance reads the whole list. */
export function statusGlyph(status: HomeworkStatus | undefined): { mark: string; colour: string } {
  switch (status) {
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
