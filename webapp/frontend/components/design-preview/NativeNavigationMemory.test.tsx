import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeNavigationProvider, useNativeNavigationMemory, useNativeSessionSelection, useNativeSessionsHref, useNativeViewState } from "./NativeNavigationMemory";
import type { NativeNavigationMemory } from "./nativeNavigationMemory";

const state = vi.hoisted(() => ({
  pathname: "/", query: "",
  user: { id: 1 } as { id: number } | null, role: "Admin", location: "Centre A", view: "center-view",
  impersonating: false, tutor: 7,
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, effectiveRole: state.role, isImpersonating: state.impersonating, impersonatedTutor: { id: state.tutor } }) }));
vi.mock("@/contexts/LocationContext", () => ({ useLocation: () => ({ selectedLocation: state.location }) }));
vi.mock("@/contexts/RoleContext", () => ({ useRole: () => ({ viewMode: state.view }) }));
vi.mock("@/lib/scroll", () => ({ getAppScroller: () => document.querySelector("main") }));

let memory: NativeNavigationMemory | null;
function Probe() {
  memory = useNativeNavigationMemory();
  return <a href={useNativeSessionsHref("/sessions")}>Sessions</a>;
}
function Choice({ pageKey = "chart" }: { pageKey?: string }) {
  const [value, setValue] = useNativeViewState(pageKey, () => "grade");
  return <button onClick={() => setValue(old => old === "grade" ? "school" : "grade")}>{value}</button>;
}
function Selection({ pageKey }: { pageKey: string }) {
  const [ids, setIds] = useNativeSessionSelection(pageKey, state.location);
  return <button onClick={() => setIds(new Set([7]))}>Selected {ids.size}</button>;
}
function App({ show = true, pageKey = "chart", scroll = false, selection = false }: { show?: boolean; pageKey?: string; scroll?: boolean; selection?: boolean }) {
  return <NativeNavigationProvider><Probe />{show && (selection ? <Selection pageKey={pageKey} /> : <Choice pageKey={pageKey} />)}{scroll && <main><div data-native-scroll="sessions-list" /></main>}</NativeNavigationProvider>;
}
beforeEach(() => {
  Object.assign(state, { pathname: "/", query: "", user: { id: 1 }, role: "Admin", location: "Centre A", view: "center-view", impersonating: false, tutor: 7 });
  memory = null;
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
});

describe("Sessions selection on actual filter changes", () => {
  const first = "/sessions?date=2026-11-09&view=list", second = "/sessions?date=2026-11-10&view=list";
  it("restores a route remount, clears ordinary date changes and restores an older Back entry", () => {
    const app = render(<App selection pageKey={first} />);
    fireEvent.click(screen.getByRole("button", { name: "Selected 0" }));
    app.rerender(<App selection pageKey={first} show={false} />);
    app.rerender(<App selection pageKey={first} />);
    expect(screen.getByRole("button", { name: "Selected 1" })).toBeInTheDocument();
    app.rerender(<App selection pageKey={second} />);
    expect(screen.getByRole("button", { name: "Selected 0" })).toBeInTheDocument();
    memory!.notePop(first);
    app.rerender(<App selection pageKey={first} />);
    expect(screen.getByRole("button", { name: "Selected 1" })).toBeInTheDocument();
    app.rerender(<App selection pageKey={second} />);
    app.rerender(<App selection pageKey={first} />);
    expect(screen.getByRole("button", { name: "Selected 0" })).toBeInTheDocument();
  });
  it("keeps ordinary selection clearing without a preview choice", () => {
    const app = render(<App selection pageKey={first} />);
    fireEvent.click(screen.getByRole("button", { name: "Selected 0" }));
    app.rerender(<App selection pageKey={second} />);
    expect(screen.getByRole("button", { name: "Selected 0" })).toBeInTheDocument();
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("scoped real-page state", () => {
  it("restores a remounted screen and keeps its choices within the authenticated scope", () => {
    const app = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "grade" }));
    app.rerender(<App show={false} />);
    app.rerender(<App />);
    expect(screen.getByRole("button", { name: "school" })).toBeInTheDocument();
    const store = memory;
    act(() => { memory!.rememberSessions("/sessions?date=2026-11-09&tutor=7"); });
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringContaining("tutor=7"));
    expect(memory).toBe(store);
  });
  it.each(["user", "role", "location", "view", "impersonating", "tutor"] as const)("discards prior choices when %s changes", field => {
    if (field === "tutor") state.impersonating = true;
    const app = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "grade" }));
    const old = memory;
    if (field === "user") state.user = { id: 2 };
    else if (field === "impersonating") state.impersonating = true;
    else if (field === "tutor") state.tutor = 8;
    else state[field] = "different";
    app.rerender(<App />);
    expect(memory).not.toBe(old);
    expect(screen.getByRole("button", { name: "grade" })).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/sessions");
  });
  it("remembers separate filter keys and removes memory on sign-out and creates a fresh store on sign-in", () => {
    const app = render(<App pageKey="date:A" />);
    fireEvent.click(screen.getByRole("button", { name: "grade" }));
    app.rerender(<App pageKey="date:B" />);
    expect(screen.getByRole("button", { name: "grade" })).toBeInTheDocument();
    app.rerender(<App pageKey="date:A" />);
    expect(screen.getByRole("button", { name: "school" })).toBeInTheDocument();
    state.user = null;
    app.rerender(<App />);
    expect(memory).toBeNull();
    state.user = { id: 1 };
    app.rerender(<App />);
    expect(memory).not.toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/sessions");
  });
});

function heights(main: HTMLElement, nested: HTMLElement) {
  let mainHeight = 100, innerHeight = 100;
  Object.defineProperties(main, { clientHeight: { configurable: true, value: 100 }, scrollHeight: { configurable: true, get: () => mainHeight } });
  Object.defineProperties(nested, { clientHeight: { configurable: true, value: 100 }, scrollHeight: { configurable: true, get: () => innerHeight } });
  return () => { mainHeight = 1000; innerHeight = 1000; };
}
describe("API-aware scroll restoration", () => {
  it("waits for real content before restoring the page and its named list", () => {
    const app = render(<App scroll />);
    const main = document.querySelector("main")!, nested = main.firstElementChild as HTMLElement;
    const loaded = heights(main, nested);
    memory!.setPlace("/sessions?date=2026-11-09", { main: 220, inner: { "sessions-list": 340 } });
    state.pathname = "/sessions"; state.query = "date=2026-11-09";
    app.rerender(<App scroll />);
    act(() => vi.advanceTimersByTime(200));
    expect(main.scrollTop).toBe(0);
    loaded();
    act(() => vi.advanceTimersByTime(200));
    expect(main.scrollTop).toBe(220);
    expect(nested.scrollTop).toBe(340);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["wheel", "touchstart", "keydown"])("lets %s cancel a pending restoration", event => {
    const app = render(<App scroll />);
    const main = document.querySelector("main")!, nested = main.firstElementChild as HTMLElement;
    const loaded = heights(main, nested);
    memory!.setPlace("/sessions", { main: 220, inner: { "sessions-list": 340 } });
    state.pathname = "/sessions";
    app.rerender(<App scroll />);
    fireEvent(main, event === "keydown" ? new KeyboardEvent(event, { key: "PageDown" }) : new Event(event)); loaded();
    act(() => vi.advanceTimersByTime(1000));
    expect(main.scrollTop).toBe(0);
    expect(nested.scrollTop).toBe(0);
  });
  it("ignores layout scroll events while a delayed result is still restoring", () => {
    const app = render(<App scroll />);
    const main = document.querySelector("main")!, nested = main.firstElementChild as HTMLElement;
    const loaded = heights(main, nested);
    memory!.setPlace("/sessions", { main: 220, inner: { "sessions-list": 340 } });
    state.pathname = "/sessions"; app.rerender(<App scroll />);
    act(() => vi.advanceTimersByTime(600));
    main.scrollTop = 10; fireEvent.scroll(main);
    nested.scrollTop = 5; fireEvent.scroll(nested);
    loaded(); act(() => vi.advanceTimersByTime(200));
    expect(main.scrollTop).toBe(220);
    expect(nested.scrollTop).toBe(340);
  });
  it("reattaches after returning from a page without the app shell", () => {
    const app = render(<App scroll />);
    state.pathname = "/zen"; app.rerender(<App />);
    state.pathname = "/"; app.rerender(<App scroll />);
    const main = document.querySelector("main")!;
    fireEvent.wheel(main); main.scrollTop = 170; fireEvent.scroll(main);
    expect(memory!.getPlace("/")?.main).toBe(170);
  });
  it("stops waiting after six seconds if an error or empty result cannot reach the old position", () => {
    const app = render(<App scroll />);
    memory!.setPlace("/sessions", { main: 220, inner: { "sessions-list": 340 } });
    state.pathname = "/sessions"; app.rerender(<App scroll />);
    act(() => vi.advanceTimersByTime(6500));
    expect(vi.getTimerCount()).toBe(0);
    const main = document.querySelector("main")!;
    main.scrollTop = 15; fireEvent.scroll(main);
    expect(memory!.getPlace("/sessions")?.main).toBe(15);
  });
  it("records nested scrolling without replacing browser history state", () => {
    const app = render(<App scroll />);
    const main = document.querySelector("main")!, nested = main.firstElementChild as HTMLElement;
    window.history.replaceState({ __NA: true, token: "test" }, "", "/");
    fireEvent.wheel(main);
    main.scrollTop = 130; fireEvent.scroll(main);
    nested.scrollTop = 275; fireEvent.scroll(nested);
    expect(memory!.getPlace("/")).toEqual({ main: 130, inner: { "sessions-list": 275 } });
    state.pathname = "/sessions"; app.rerender(<App scroll />);
    expect(window.history.state).toEqual({ __NA: true, token: "test" });
  });
});
