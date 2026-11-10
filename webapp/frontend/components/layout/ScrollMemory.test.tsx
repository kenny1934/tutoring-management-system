import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScrollMemory } from "./ScrollMemory";

const state = vi.hoisted(() => ({ pathname: "/students", memory: {} as object | null }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/components/design-preview/NativeNavigationMemory", () => ({ useNativeNavigationMemory: () => state.memory }));
vi.mock("@/lib/scroll", () => ({ getAppScroller: () => document.querySelector("main") }));
beforeEach(() => {
  vi.useFakeTimers(); sessionStorage.clear();
  state.memory = {}; state.pathname = "/students";
  window.history.replaceState({}, "", state.pathname);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function App() { return <><main><div style={{ overflowY: "auto" }} /></main><ScrollMemory /></>; }
function scene() {
  const view = render(<App />), main = view.container.querySelector("main")!, inner = main.firstElementChild as HTMLElement;
  Object.defineProperties(main, { clientHeight: { value: 500 }, scrollHeight: { value: 5000 } });
  Object.defineProperties(inner, { clientHeight: { value: 400 }, scrollHeight: { value: 3000 } });
  act(() => vi.advanceTimersByTime(450));
  return { ...view, main, inner };
}

it("preserves other pages' frame and inner scroll with native navigation enabled", () => {
  const view = scene();
  view.main.scrollTop = 600; fireEvent.scroll(view.main);
  view.inner.scrollTop = 350; fireEvent.scroll(view.inner);
  act(() => vi.advanceTimersByTime(300));
  expect(JSON.parse(sessionStorage.getItem("csm-scroll-memory")!)["/students"]).toEqual({ main: 600, inner: 350 });
  state.pathname = "/inbox"; window.history.replaceState({}, "", state.pathname); view.rerender(<App />);
  view.main.scrollTop = 0; view.inner.scrollTop = 0;
  // Pop arrives before Next commits the destination, as it does in the app.
  act(() => { window.history.replaceState({}, "", "/students"); window.dispatchEvent(new PopStateEvent("popstate")); });
  state.pathname = "/students"; view.rerender(<App />);
  act(() => vi.advanceTimersByTime(100));
  expect(view.main.scrollTop).toBe(600); expect(view.inner.scrollTop).toBe(350);
});

it.each(["/", "/sessions"])("leaves %s exclusively to native scroll restoration", pathname => {
  state.pathname = pathname; window.history.replaceState({}, "", pathname);
  sessionStorage.setItem("csm-scroll-memory", JSON.stringify({ [pathname]: { main: 900, inner: 0 } }));
  const view = scene(); view.main.scrollTop = 200; fireEvent.scroll(view.main);
  act(() => { window.dispatchEvent(new PopStateEvent("popstate")); vi.advanceTimersByTime(500); });
  expect(view.main.scrollTop).toBe(200);
  expect(JSON.parse(sessionStorage.getItem("csm-scroll-memory")!)[pathname].main).toBe(900);
});

it("keeps ordinary restoration available without an authenticated native store", () => {
  state.memory = null; state.pathname = "/"; window.history.replaceState({}, "", "/");
  const view = scene(); view.main.scrollTop = 250; fireEvent.scroll(view.main);
  act(() => vi.advanceTimersByTime(300));
  expect(JSON.parse(sessionStorage.getItem("csm-scroll-memory")!)["/"].main).toBe(250);
});
