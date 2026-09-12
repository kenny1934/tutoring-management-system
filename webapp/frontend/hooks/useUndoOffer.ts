import { useCallback, useEffect, useRef, useState } from "react";

// How long the message stays when nothing else happens.
const UNDO_OFFER_MS = 8000;
// Marks a message that hasn't yet seen the ink its clear left behind.
const NOT_SEEN = Symbol("not seen");

/**
 * The message that offers to undo a clear, as the Pen Tray and the Draft
 * show it. It goes after a few seconds, or as soon as the ink changes in any
 * other way, which includes an undo.
 *
 * `inkRevision` is anything that changes whenever the ink does, such as the
 * exercise's annotations. The clear and the message land in the same render,
 * so the first revision the message sees is the one the clear left behind,
 * and only a change after that takes the message away.
 */
export function useUndoOffer(inkRevision: unknown) {
  const [message, setMessage] = useState<string | null>(null);
  const seenRef = useRef<unknown>(NOT_SEEN);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const offer = useCallback((next: string) => {
    seenRef.current = NOT_SEEN;
    setMessage(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), UNDO_OFFER_MS);
  }, []);

  const drop = useCallback(() => {
    clearTimeout(timer.current);
    setMessage(null);
  }, []);

  useEffect(() => {
    if (message === null) return;
    if (seenRef.current === NOT_SEEN) seenRef.current = inkRevision;
    else if (seenRef.current !== inkRevision) drop();
  }, [inkRevision, message, drop]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return { message, offer, drop };
}
