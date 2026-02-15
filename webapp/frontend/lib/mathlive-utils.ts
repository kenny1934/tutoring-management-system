/**
 * Shared MathLive utilities.
 *
 * patchMathLiveMenu() works around a race condition where the MathLive menu
 * scrim appears during a pointerdown and immediately catches a spurious click
 * that closes the menu. The patch intercepts the first click on the scrim after
 * show() to prevent premature dismissal.
 */

export function patchMathLiveMenu(
  mathfieldRef: { current: HTMLElement | null }
): () => void {
  const timer = setTimeout(() => {
    const mf = mathfieldRef.current as any;
    const menu = mf?._mathfield?.menu; // use getter to force-create
    if (!menu || menu._showPatched) return;
    menu._showPatched = true;

    const origShow = menu.show.bind(menu);
    menu.show = function (options: any) {
      const result = origShow(options);
      const scrimEl = menu.scrim;
      if (scrimEl) {
        const guard = (e: Event) => {
          e.stopImmediatePropagation();
          scrimEl.removeEventListener("click", guard, true);
        };
        scrimEl.addEventListener("click", guard, true);
        setTimeout(
          () => scrimEl.removeEventListener("click", guard, true),
          400
        );
      }
      return result;
    };
  }, 500);

  return () => clearTimeout(timer);
}
