/** Keeps UI choices in this tab; API records and credentials never enter this store. */
export interface NativeScrollPlace {
  main: number;
  inner: Record<string, number>;
}
const LIMIT = 40;

export function nativePageKey(href: string) {
  const url = new URL(href, "https://csm.invalid");
  url.searchParams.delete("ui-preview");
  url.searchParams.delete("lesson_frame");
  if (url.pathname === "/sessions" && !url.searchParams.has("view")) {
    url.searchParams.set("view", url.searchParams.get("filter") === "after-last-day" ? "weekly" : "list");
  }
  for (const key of ["tutor", "status", "filter"]) if (url.searchParams.get(key) === "") url.searchParams.delete(key);
  url.searchParams.sort();
  return url.pathname + (url.searchParams.size ? `?${url.searchParams}` : "");
}

function boundedSet<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key); map.set(key, value);
  if (map.size > LIMIT) map.delete(map.keys().next().value!);
}

export class NativeNavigationMemory {
  private values = new Map<string, unknown>();
  private places = new Map<string, NativeScrollPlace>();
  private listeners = new Set<() => void>();
  private sessionsHref = "";
  pop = { key: "", generation: 0 };
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly getSessionsHref = () => this.sessionsHref;
  get<T>(key: string) { return this.values.get(key) as T | undefined; }
  set<T>(key: string, value: T) { boundedSet(this.values, key, value); }
  getPlace(key: string) { return this.places.get(nativePageKey(key)); }
  setPlace(key: string, value: NativeScrollPlace) { boundedSet(this.places, nativePageKey(key), value); }
  rememberSessions(href: string) {
    const next = nativePageKey(href);
    if (!next.startsWith("/sessions?") || next === this.sessionsHref) return;
    this.sessionsHref = next; this.listeners.forEach(listener => listener());
  }
  notePop(href: string) { this.pop = { key: nativePageKey(href), generation: this.pop.generation + 1 }; }
}

/** Explicit modes/special views keep their meaning; a dated list can retain the other list filters. */
export function nativeSessionsHref(href: string, remembered: string) {
  const target = new URL(href, "https://csm.invalid");
  if (target.pathname !== "/sessions" || target.origin !== "https://csm.invalid") return href;
  const explicit = new URLSearchParams(target.search);
  explicit.delete("ui-preview");
  if (remembered && !explicit.has("filter") && (!explicit.has("view") || explicit.get("view") === "list")) {
    const saved = new URL(remembered, "https://csm.invalid");
    if (!explicit.size || (!saved.searchParams.has("filter") && saved.searchParams.get("view") === "list")) {
      for (const [key, value] of saved.searchParams) if (!explicit.has(key)) target.searchParams.set(key, value);
    }
  }
  target.searchParams.delete("ui-preview");
  return target.pathname + target.search + target.hash;
}
