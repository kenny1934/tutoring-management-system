/** Transient visual copies never own focus or delay the underlying navigation. */
export type ScrollPlace = { element: HTMLElement; top: number; left: number };
export function rememberScroll(source: HTMLElement): ScrollPlace[] {
  const places: ScrollPlace[] = [];
  for (let element = source.parentElement; element; element = element.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(element).overflowY + getComputedStyle(element).overflowX) || element === document.scrollingElement) {
      places.push({ element, top: element.scrollTop, left: element.scrollLeft });
    }
  }
  return places;
}
export function restoreScroll(places: ScrollPlace[]) {
  for (const { element, top, left } of places) if (element.isConnected) { element.scrollTop = top; element.scrollLeft = left; }
}
export function focusMaterialSource(source: HTMLElement | null) {
  if (!source?.isConnected) return;
  if (!source.hasAttribute("tabindex")) source.tabIndex = -1;
  source.focus({ preventScroll: true });
}
export function visibleMaterialElement(elements: Iterable<HTMLElement>) {
  return [...elements].find(element => { const rect = element.getBoundingClientRect(); return rect.width > 1 && rect.height > 1 && getComputedStyle(element).visibility !== "hidden"; }) ?? null;
}


function landingRect(element: HTMLElement) {
  // Layout motion can still be carrying the source from its old grid position.
  const { transform, translate, transition } = element.style;
  element.style.transition = "none"; element.style.transform = "none"; element.style.translate = "none";
  const rect = element.getBoundingClientRect();
  element.style.transform = transform; element.style.translate = translate; element.style.transition = transition;
  return rect;
}

export function createMaterialFlight(source: HTMLElement, options: {
  kind: "folder" | "document" | "label"; reverse?: boolean; from?: DOMRect; onFinish?: () => void;
}) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof source.animate !== "function") return null;
  const sourceRect = source.getBoundingClientRect(), from = options.from ?? sourceRect;
  if (sourceRect.width < 1 || sourceRect.height < 1 || from.width < 1 || from.height < 1) return null;
  const wrapper = document.createElement("div"), copy = source.cloneNode(true) as HTMLElement;
  wrapper.dataset.materialFlight = options.kind;
  wrapper.dataset.direction = options.reverse ? "return" : "open";
  wrapper.setAttribute("aria-hidden", "true"); wrapper.inert = true;
  const style = getComputedStyle(source), background = style.backgroundColor === "rgba(0, 0, 0, 0)" ? style.getPropertyValue("--color-raised") || "#fef9f3" : style.backgroundColor;
  Object.assign(wrapper.style, { position: "fixed", pointerEvents: "none", zIndex: "2147483000", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: "3px", overflow: "hidden", background: options.reverse && options.kind === "document" ? "#fffdfa" : background, boxShadow: "0 10px 30px -16px rgba(35,22,10,.45)", perspective: "600px" });
  for (const property of ["--material-edge", "--material-shadow"]) wrapper.style.setProperty(property, style.getPropertyValue(property));
  const identities = ["id", "autofocus", "data-material-doc-id", "data-doc-id", "data-material-file", "data-material-reader-content", "data-previewing", "data-curriculum-file", "data-curriculum-pdf-content", "data-curriculum-topic-heading"];
  for (const element of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) {
    for (const attribute of identities) element.removeAttribute(attribute);
  }
  copy.querySelectorAll("iframe, video, audio").forEach(element => element.remove());
  Object.assign(copy.style, { margin: "0", position: "absolute", left: "0", top: "0", width: `${sourceRect.width}px`, height: `${sourceRect.height}px`, transformOrigin: "top left", transform: `scale(${options.kind !== "document" ? 1 : from.width / sourceRect.width})`, translate: "none", rotate: "none", opacity: options.reverse ? "0" : "1" });
  wrapper.append(copy); document.body.append(wrapper);
  const animations: Animation[] = [];
  let done = false, landing: HTMLElement | null = null, previousOpacity = "", previousInert = false;
  let timer: ReturnType<typeof setTimeout>;
  const cancel = () => {
    if (done) return; done = true; clearTimeout(timer);
    animations.forEach(animation => animation.cancel()); wrapper.remove();
    if (landing) { landing.style.opacity = previousOpacity; landing.inert = previousInert; }
    window.removeEventListener("resize", cancel); window.removeEventListener("pointerdown", cancel, true);
    document.removeEventListener("visibilitychange", cancel);
    options.onFinish?.();
  };
  window.addEventListener("resize", cancel); window.addEventListener("pointerdown", cancel, true);
  document.addEventListener("visibilitychange", cancel);
  timer = setTimeout(cancel, 650);
  if (options.kind === "folder") {
    const face = copy.querySelector<HTMLElement>("[data-material-folder-face]");
    if (face) animations.push(face.animate(options.reverse ? [{ transform: "rotateX(-62deg)" }, { transform: "rotateX(0deg)" }] : [{ transform: "rotateX(-10deg)" }, { transform: "rotateX(-62deg)" }], { duration: 180, fill: "forwards", easing: "cubic-bezier(.2,.7,.2,1)" }));
  }
  return {
    cancel,
    land(target: HTMLElement) {
      if (done) return;
      const to = landingRect(target);
      if (to.width < 1 || to.height < 1) { cancel(); return; }
      clearTimeout(timer);
      if (!options.reverse && options.kind === "document") { landing = target; previousOpacity = target.style.opacity; previousInert = target.inert; target.style.opacity = "0"; target.inert = true; }
      const duration = 280, easing = "cubic-bezier(.2,.7,.2,1)";
      const geometry = wrapper.animate([
        { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, opacity: 1, backgroundColor: options.reverse && options.kind === "document" ? "#fffdfa" : background },
        { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, opacity: 0, backgroundColor: options.reverse || options.kind !== "document" ? background : "#fffdfa" },
      ], { duration, easing, fill: "forwards" });
      animations.push(geometry, copy.animate([
        { transform: `scale(${options.kind !== "document" ? 1 : from.width / sourceRect.width})`, opacity: options.reverse ? 0 : 1 },
        { transform: `scale(${options.kind !== "document" ? 1 : to.width / sourceRect.width})`, opacity: options.reverse ? 1 : 0 },
      ], { duration, easing, fill: "forwards" }));
      void geometry.finished.then(cancel, cancel);
      timer = setTimeout(cancel, duration + 100);
    },
  };
}
