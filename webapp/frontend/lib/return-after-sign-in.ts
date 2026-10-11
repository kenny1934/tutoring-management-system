/**
 * Brings someone back to the page they were on after they sign in again.
 *
 * Google's sign-in always returns to the start of the app, so before CSM sends
 * someone to the sign-in page it notes where they were, and once they're back
 * and signed in it takes them there. The note lives in localStorage, which
 * survives the trip out to Google and back. It's only honoured for 15 minutes,
 * so an old one can't surface days later, and only for a path inside CSM, so
 * it can never send anyone to another site.
 */

const KEY = "csm-return-after-sign-in";
const FRESH_MS = 15 * 60 * 1000;

export function isSafeReturnPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !path.startsWith("/login")
  );
}

export function rememberReturnPath(path: string): void {
  if (!isSafeReturnPath(path) || path === "/") return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // Without storage, sign-in just lands on the home page as it always did.
  }
}

function read(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { path, at } = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (!isSafeReturnPath(path) || typeof at !== "number" || Date.now() - at > FRESH_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

/** Whether there's a page waiting to be returned to, without using it up. */
export function hasReturnPath(): boolean {
  return read() !== null;
}

/** The page to return to, if there is one. Reading it clears it. */
export function takeReturnPath(): string | null {
  const path = read();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  return path;
}
