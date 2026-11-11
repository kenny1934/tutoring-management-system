import { animateWorksheetReady } from "./lessonReading";

const READY = "csm-worksheet-ready";
let snapshotId = 0;

/** Wait for the page images and the viewer's restored layout before revealing a worksheet. */
export function announceWorksheetReady(pages: HTMLElement, key: number | undefined) {
  let cancelled = false;
  let frame = 0;
  let stopAnimation: (() => void) | undefined;
  const images = [...pages.querySelectorAll("img")];
  void Promise.all(images.map(image => image.decode?.().catch(() => {}) ?? Promise.resolve())).then(() => {
    if (cancelled) return;
    frame = requestAnimationFrame(() => {
      if (cancelled || !pages.isConnected) return;
      const accepted = !pages.dispatchEvent(new CustomEvent(READY, { bubbles: true, cancelable: true, detail: { key } }));
      if (!accepted) stopAnimation = animateWorksheetReady(pages);
    });
  });
  return () => { cancelled = true; cancelAnimationFrame(frame); stopAnimation?.(); };
}

function renameSnapshotIds(snapshot: HTMLElement) {
  const prefix = `worksheet-hold-${++snapshotId}-`;
  const ids = new Map<string, string>();
  for (const node of [snapshot, ...snapshot.querySelectorAll("[id]")]) {
    if (node.id) { ids.set(node.id, prefix + node.id); node.id = prefix + node.id; }
  }
  for (const node of [snapshot, ...snapshot.querySelectorAll("*")]) {
    for (const attribute of [...node.attributes]) {
      let value = attribute.value;
      for (const [old, next] of ids) {
        value = value.replaceAll(`url(#${old})`, `url(#${next})`);
        if ((attribute.name === "href" || attribute.name === "xlink:href") && value === `#${old}`) value = `#${next}`;
      }
      if (value !== attribute.value) node.setAttribute(attribute.name, value);
    }
  }
}

/** Keep only a frozen reading surface while the next student's real viewer loads. */
export function attachWorksheetHandoff(root: HTMLElement, classes: { hold: string; status: string }) {
  let pane: HTMLElement | null = null;
  let snapshot: HTMLElement | null = null;
  let announcement: HTMLElement | null = null;
  let target: number | null = null;
  let inertBefore = false;
  let busyBefore: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let indicatorTimer: ReturnType<typeof setTimeout> | undefined;
  let animation: Animation | null = null;
  let disposed = false;
  let heldBounds: { width: number; height: number } | null = null;
  const size = new ResizeObserver(() => {
    if (!pane || !heldBounds) return;
    const rect = pane.getBoundingClientRect();
    if (Math.abs(rect.width - heldBounds.width) > 1 || Math.abs(rect.height - heldBounds.height) > 1) clear();
  });

  const clear = () => {
    target = null;
    clearTimeout(timer);
    clearTimeout(indicatorTimer);
    const moving = animation; animation = null; moving?.cancel();
    snapshot?.remove(); snapshot = null;
    announcement?.remove(); announcement = null;
    if (pane) {
      size.unobserve(pane);
      pane.inert = inertBefore;
      if (busyBefore === null) pane.removeAttribute("aria-busy"); else pane.setAttribute("aria-busy", busyBefore);
    }
    pane = null;
    heldBounds = null;
  };
  const reveal = () => {
    target = null; clearTimeout(timer); clearTimeout(indicatorTimer);
    if (!snapshot?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return clear();
    const moving = snapshot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: "ease-out" });
    animation = moving;
    void moving.finished.then(() => { if (animation === moving) clear(); }, () => {});
  };
  const inspect = () => {
    if (!pane || target === null) return;
    if (!pane.isConnected || pane.dataset.nativeWorksheetKind !== "pdf" ||
      pane.dataset.nativeWorksheetError === String(target) || pane.querySelector("[data-native-pdf-failed]")) clear();
  };
  const ready = (event: Event) => {
    if (target === null || !pane?.contains(event.target as Node) || (event as CustomEvent).detail?.key !== target) return;
    event.preventDefault(); reveal();
  };
  const mutations = new MutationObserver(inspect);
  mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-native-worksheet-kind", "data-native-worksheet-error"] });
  root.addEventListener(READY, ready);
  window.addEventListener("resize", clear);

  return {
    isPending: () => snapshot !== null,
    prepare(next: number | null) {
      if (disposed) return;
      if (next === null) return clear();
      if (snapshot && target !== null) {
        snapshot.dataset.nativeWorksheetSnapshot = String(next);
        target = next; clearTimeout(timer); timer = setTimeout(clear, 12000); return;
      }
      clear();
      const nextPane = root.querySelector<HTMLElement>("[data-native-worksheet-pane]");
      const viewport = nextPane?.querySelector<HTMLElement>("[data-native-pdf-scroll]:not([data-native-worksheet-hold])");
      if (!nextPane || !viewport?.querySelector("[data-native-pdf-pages]")) return;
      const bounds = viewport.getBoundingClientRect(), outer = nextPane.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      pane = nextPane; target = next;
      heldBounds = { width: outer.width, height: outer.height }; size.observe(pane);
      inertBefore = pane.inert; busyBefore = pane.getAttribute("aria-busy");
      const copy = viewport.cloneNode(true) as HTMLElement;
      renameSnapshotIds(copy);
      copy.dataset.nativeWorksheetHold = "";
      copy.classList.add(classes.hold);
      copy.inert = true; copy.setAttribute("aria-hidden", "true");
      let background = viewport.parentElement;
      while (background && getComputedStyle(background).backgroundColor === "rgba(0, 0, 0, 0)") background = background.parentElement;
      Object.assign(copy.style, {
        position: "absolute", zIndex: "5", pointerEvents: "none", overflow: "hidden", boxSizing: "border-box",
        left: `${bounds.left - outer.left}px`, top: `${bounds.top - outer.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`,
        backgroundColor: background ? getComputedStyle(background).backgroundColor : "var(--color-paper)",
      });
      const status = document.createElement("span");
      status.className = classes.status; status.textContent = "Loading worksheet...";
      // The label stays fixed while the frozen pages keep their exact reading position.
      const label = document.createElement("div");
      Object.assign(label.style, { position: "absolute", zIndex: "6", visibility: "hidden", right: `${outer.right - bounds.right + 12}px`, bottom: `${outer.bottom - bounds.bottom + 12}px` });
      label.append(status);
      const layer = document.createElement("div");
      Object.assign(layer.style, { position: "absolute", inset: "0", zIndex: "5", pointerEvents: "none", overflow: "hidden" });
      layer.dataset.nativeWorksheetSnapshot = String(next); layer.setAttribute("aria-hidden", "true"); layer.inert = true;
      layer.append(copy, label); pane.append(layer);
      copy.scrollTop = viewport.scrollTop; copy.scrollLeft = viewport.scrollLeft;
      snapshot = layer;
      pane.inert = true; pane.setAttribute("aria-busy", "true");
      // A cached worksheet should cross-fade without flashing a loading label.
      indicatorTimer = setTimeout(() => {
        if (target === null || snapshot !== layer) return;
        label.style.visibility = "visible";
        announcement = document.createElement("span"); announcement.className = "sr-only";
        announcement.setAttribute("role", "status"); announcement.textContent = "Loading worksheet..."; root.append(announcement);
      }, 180);
      // A very slow request falls back to the ordinary progress/error view.
      timer = setTimeout(clear, 12000);
    },
    dispose() { disposed = true; clear(); size.disconnect(); mutations.disconnect(); root.removeEventListener(READY, ready); window.removeEventListener("resize", clear); },
  };
}
