const backgroundOwners = new WeakMap<HTMLElement, symbol>();

export const sessionMotionReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The phone sheet recedes its viewport. Desktop popovers leave the page available for reference. */
export function recessSessionBackground(main: HTMLElement, asSheet: boolean, className: string) {
  if (!asSheet) return () => {};
  const owner = Symbol("session detail");
  backgroundOwners.set(main, owner);
  const location = window.location.pathname;
  const scrollers = [main, ...main.querySelectorAll<HTMLElement>("*")]
    .filter(el => el === main || el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
    .map(el => ({ el, top: el.scrollTop, left: el.scrollLeft }));
  const overflow = main.style.overflow;
  const gutter = main.style.scrollbarGutter;
  const wasInert = main.inert;
  main.classList.add(className);
  main.dataset.nativeSessionOpen = "true";
  main.style.scrollbarGutter = "stable";
  main.style.overflow = "hidden";
  if (asSheet) main.inert = true;
  const preventScroll = (event: Event) => event.preventDefault();
  main.addEventListener("wheel", preventScroll, { passive: false, capture: true });
  main.addEventListener("touchmove", preventScroll, { passive: false, capture: true });
  return () => {
    main.removeEventListener("wheel", preventScroll, true);
    main.removeEventListener("touchmove", preventScroll, true);
    if (backgroundOwners.get(main) !== owner) return;
    delete main.dataset.nativeSessionOpen;
    main.style.overflow = overflow;
    main.style.scrollbarGutter = gutter;
    main.inert = wasInert;
    if (window.location.pathname === location) {
      for (const { el, top, left } of scrollers) {
        if (el.isConnected) { el.scrollTop = top; el.scrollLeft = left; }
      }
    }
    // A rapid reopen owns its own surface; an old close cannot clear it.
    setTimeout(() => {
      if (backgroundOwners.get(main) !== owner) return;
      main.classList.remove(className);
      backgroundOwners.delete(main);
    }, 280);
  };
}

/** Uses the real name/badges as a temporary, inaccessible bridge to the real detail header. */
export function animateSessionIdentity(origin: HTMLElement, target: HTMLElement, surface: HTMLElement, asSheet: boolean, zIndex: number) {
  if (sessionMotionReduced() || typeof origin.animate !== "function") return () => {};
  const start = origin.getBoundingClientRect();
  const end = target.getBoundingClientRect();
  const panel = surface.getBoundingClientRect();
  if (!start.width || !end.width) return () => {};
  const finalTop = asSheet ? window.innerHeight - surface.offsetHeight : panel.top;
  const targetTop = end.top - panel.top + finalTop;
  const ghost = origin.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.dataset.nativeIdentityFlight = "true";
  Object.assign(ghost.style, {
    position: "fixed", left: `${start.left}px`, top: `${start.top}px`,
    width: `${start.width}px`, height: `${start.height}px`, margin: "0", flex: "none",
    pointerEvents: "none", zIndex: String(zIndex), transformOrigin: "top left",
    fontFamily: getComputedStyle(origin).fontFamily,
  });
  document.body.append(ghost);
  const opacity = target.style.opacity;
  target.style.opacity = "0";
  const scale = Math.max(0.9, Math.min(1.25, end.width / start.width));
  const flight = ghost.animate([
    { transform: "none", opacity: 1 },
    { transform: `translate(${end.left - start.left}px, ${targetTop - start.top}px) scale(${scale})`, opacity: 0 },
  ], { duration: 280, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" });
  const reveal = target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: asSheet ? 180 : 100, fill: "forwards" });
  const entrance = !asSheet ? surface.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 }) : null;
  const remove = () => { ghost.remove(); target.style.opacity = opacity; };
  flight.finished.then(remove, remove);
  const cancel = () => { flight.cancel(); reveal.cancel(); entrance?.cancel(); remove(); };
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onReduce = () => { if (media.matches) cancel(); };
  media.addEventListener("change", onReduce);
  return () => { media.removeEventListener("change", onReduce); cancel(); };
}
