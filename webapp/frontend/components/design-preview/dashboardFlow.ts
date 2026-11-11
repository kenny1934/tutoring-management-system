/** Let a section settle into view once. Its content is readable before the observer or animation runs. */
export function attachDashboardFlow(root: HTMLElement, main: HTMLElement, readSections = new Set<string>()) {
  if (typeof IntersectionObserver === "undefined") return () => {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const observed = new Set<HTMLElement>();
  const seen = new Set<HTMLElement>();
  const animations = new Set<Animation>();
  const keyFor = (section: HTMLElement) => section.dataset.nativeFlowEnter || section.dataset.nativeLayer || section.dataset.nativeFlow || section.id;
  const markRead = (section: HTMLElement) => {
    seen.add(section);
    const key = keyFor(section);
    if (key) readSections.add(key);
  };
  let disposed = false;
  const observer = new IntersectionObserver(entries => {
    if (disposed) return;
    for (const entry of entries) {
      const section = entry.target as HTMLElement;
      if (!entry.isIntersecting || seen.has(section)) continue;
      markRead(section);
      observer.unobserve(section);
      if (reduced.matches || main.inert || main.dataset.nativeSessionOpen || section.contains(document.activeElement) || !section.animate) continue;
      const animation = section.animate(
        [{ opacity: .96, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 280, easing: "cubic-bezier(.2,.7,.2,1)" },
      );
      animations.add(animation);
      void animation.finished.catch(() => {}).finally(() => animations.delete(animation));
    }
  }, { root: main, rootMargin: "0px 0px -24px 0px", threshold: .06 });
  const register = () => {
    if (disposed) return;
    const viewport = main.getBoundingClientRect();
    for (const section of root.querySelectorAll<HTMLElement>("[data-native-flow-enter]")) {
      if (observed.has(section)) continue;
      observed.add(section);
      const key = keyFor(section);
      if (key && readSections.has(key)) { seen.add(section); continue; }
      // The first screen stays still. Returning to an already-read section does too.
      if (section.getBoundingClientRect().top < viewport.bottom - 24) { markRead(section); continue; }
      observer.observe(section);
    }
  };
  const cancel = () => { animations.forEach(animation => animation.cancel()); animations.clear(); };
  const onMotionChange = () => { if (reduced.matches) cancel(); };
  const mutations = new MutationObserver(register);
  mutations.observe(root, { childList: true, subtree: true });
  reduced.addEventListener("change", onMotionChange);
  register();
  return () => {
    disposed = true;
    cancel();
    observer.disconnect();
    mutations.disconnect();
    reduced.removeEventListener("change", onMotionChange);
  };
}
