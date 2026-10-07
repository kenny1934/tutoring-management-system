/**
 * Working out what a failed lock request means for the document editor.
 *
 * The server answers 409 when someone else really holds the lock, and its
 * detail then reads "Document is locked by <name>". A heartbeat that finds the
 * lock gone also answers 409, without a name. Anything else, a dropped
 * connection, a server error, a blocked request, says nothing about who is
 * editing, so the editor should pause and try again rather than tell the
 * tutor that a colleague has the document.
 */

export type LockProblem =
  | { kind: "other"; name: string }
  | { kind: "offline" };

const LOCKED_BY_PREFIX = "Document is locked by ";

export function lockProblemFrom(err: unknown): LockProblem {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status: unknown }).status
      : undefined;
  if (status !== 409) return { kind: "offline" };

  const message = err instanceof Error ? err.message : "";
  const name = message.startsWith(LOCKED_BY_PREFIX)
    ? message.slice(LOCKED_BY_PREFIX.length).trim()
    : "";
  return { kind: "other", name: name || "another user" };
}
