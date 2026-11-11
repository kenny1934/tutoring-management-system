/** Changes surface light while the real content keeps its geometry and scroll position. */
export function attachDashboardDepth(root: HTMLElement, main: HTMLElement) {
  let frame: number | null = null;
  let disposed = false;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const saved = new Map<HTMLElement, Map<string, string>>();
  const set = (node: HTMLElement, name: string, value: number) => {
    if (!saved.has(node)) saved.set(node, new Map());
    const props = saved.get(node)!;
    if (!props.has(name)) props.set(name, node.style.getPropertyValue(name));
    node.style.setProperty(name, value.toFixed(3));
  };
  const update = () => {
    frame = null;
    if (disposed) return;
    const viewport = main.getBoundingClientRect();
    const height = Math.max(viewport.height, 1);
    const welcome = root.querySelector<HTMLElement>('[data-native-layer="welcome"]');
    const header = welcome?.getBoundingClientRect();
    const light = reduced.matches || !header ? 1 : Math.max(0, Math.min(1, (header.bottom - viewport.top) / Math.max(header.height, 1)));
    const surfaces = [...root.querySelectorAll<HTMLElement>('[data-native-depth-surface]')].map(node => ({ node, rect: node.getBoundingClientRect() }));
    const sections = [...root.querySelectorAll<HTMLElement>('[data-native-depth-section]')].map(node => ({ node, rect: node.getBoundingClientRect() }));
    set(root, "--native-header-light", light);
    for (const { node, rect } of surfaces) {
      const elevation = reduced.matches ? 0.35 : Math.max(0, Math.min(1, (height * 0.7 - (rect.top - viewport.top)) / (height * 0.55)));
      set(node, "--native-elevation", elevation);
    }
    for (const { node, rect } of sections) {
      const focus = reduced.matches ? 0.35 : Math.max(0, 1 - Math.abs(rect.top - viewport.top - height * 0.25) / height);
      set(node, "--native-section-light", focus);
    }
  };
  const schedule = () => { if (!disposed && frame === null) frame = requestAnimationFrame(update); };
  const resize = new ResizeObserver(schedule);
  resize.observe(root);
  resize.observe(main);
  const mutations = new MutationObserver(schedule);
  mutations.observe(root, { childList: true, subtree: true });
  main.addEventListener("scroll", schedule, { passive: true });
  reduced.addEventListener("change", schedule);
  update();
  return () => {
    disposed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    resize.disconnect();
    mutations.disconnect();
    main.removeEventListener("scroll", schedule);
    reduced.removeEventListener("change", schedule);
    for (const [node, props] of saved) for (const [name, value] of props) {
      if (value) node.style.setProperty(name, value);
      else node.style.removeProperty(name);
    }
  };
}
