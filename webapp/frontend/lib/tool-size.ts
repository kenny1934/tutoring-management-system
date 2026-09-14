/**
 * What the lesson tools with a resize handle share: the size a drag of the
 * handle asks for, and the size each board remembers. The protractor's size
 * and the compasses' legs and width all work this way, in centimetres.
 */

/**
 * The size a drag of a resize handle asks for. It grows or shrinks with the
 * finger's distance from the point the tool resizes about, `fit` keeps it
 * within what the tool allows, and it's rounded to a millimetre.
 */
export function draggedLength(
  startCm: number, fromDistance: number, toDistance: number, fit: (cm: number) => number,
): number {
  if (fromDistance <= 0) return startCm;
  return Math.round(fit((startCm * toDistance) / fromDistance) * 10) / 10;
}

/** The size this board last left a tool at, kept within what the tool allows by `fit`, or its usual size. */
export function readToolSize(key: string, usual: number, fit: (cm: number) => number): number {
  try {
    const stored = Number(localStorage.getItem(key));
    return stored > 0 ? fit(stored) : usual;
  } catch {
    return usual;
  }
}

/** Remember a tool's size on this board. */
export function saveToolSize(key: string, cm: number) {
  try { localStorage.setItem(key, String(cm)); } catch { /* private window */ }
}
