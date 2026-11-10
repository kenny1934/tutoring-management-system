import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, useState } from "react";
import { NativeDashboardPreview } from "./NativeDashboardPreview";
import { requestLessonOpening, type LessonOpening } from "./lessonFrame";

beforeEach(() => {
  window.history.replaceState({ dashboard: "retained" }, "", "/?ui-preview=motion");
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: query.includes("min-width") || query.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList));
  vi.spyOn(window.history, "back").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

function Probe() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Dashboard state {count}</button>;
}
function setup(phoneRow = false, strict = false, beforeNavigate?: () => void, detailSheet = false) {
  const main = document.createElement("main"); main.id = "main-content"; main.scrollTop = 130; document.body.append(main);
  vi.spyOn(main, "getBoundingClientRect").mockReturnValue({ left: 256, top: 0, right: 1440, bottom: 900, width: 1184, height: 900 } as DOMRect);
  const content = <NativeDashboardPreview><Probe /></NativeDashboardPreview>;
  const view = render(strict ? <StrictMode>{content}</StrictMode> : content, { container: main });
  fireEvent.click(screen.getByRole("button", { name: "Dashboard state 0" }));
  const source = screen.getByRole("button", { name: "Dashboard state 1" });
  if (phoneRow) source.setAttribute("data-native-session-row", "");
  const details = detailSheet ? document.createElement("div") : null;
  const lessonButton = detailSheet ? document.createElement("button") : null;
  if (details && lessonButton) {
    lessonButton.textContent = "Return to lesson";
    details.append(lessonButton); document.body.append(details);
    main.inert = true; main.setAttribute("inert", "");
  }
  const opening: LessonOpening = { returnFocus: lessonButton, href: "/sessions/lesson?date=2026-11-05&slot=16%3A45&tutor_id=4&ui-preview=motion", source, beforeNavigate, from: { left: 320, top: 100, right: 600, bottom: 600 }, tutor: "Ms Lee", slot: "16:45 - 18:15", date: "2026-11-05", location: "MSA", student: "Chan Tai Man", grade: "F2", school: "PCMS" };
  act(() => { expect(requestLessonOpening(opening)).toBe(true); });
  const frame = screen.getByTitle("Wide lesson workspace") as HTMLIFrameElement;
  const token = new URL(frame.src).searchParams.get("lesson_frame");
  const send = (type: string, overrides: Partial<MessageEventInit> = {}) => act(() => {
    window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin: window.location.origin, data: { type, token }, ...overrides }));
  });
  return { main, source, frame, token, send, lessonButton, close() { view.unmount(); main.remove(); details?.remove(); } };
}

describe("in-place wide lesson", () => {
  it("keeps the Dashboard mounted, restores its scroll/focus and accepts close only from its own lesson", async () => {
    const scene = setup();
    try {
      expect(scene.main.inert).toBe(true);
      expect(scene.source).toHaveTextContent("Dashboard state 1");
      scene.send("csm-wide-closed", { source: window });
      expect(screen.getByRole("dialog", { name: "Whole class lesson" })).toBeInTheDocument();
      scene.send("csm-wide-ready");
      expect(scene.frame).toHaveAttribute("data-ready", "true");
      scene.send("csm-wide-closed");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(scene.main.scrollTop).toBe(130);
      expect(scene.main.inert).not.toBe(true);
      expect(scene.source).toHaveFocus();
      expect(scene.source).toHaveTextContent("Dashboard state 1");
      expect(window.history.back).toHaveBeenCalledTimes(1);
    } finally { scene.close(); }
  });
  it("returns focus inside the preserved detail sheet without enabling its background", async () => {
    const scene = setup(false, false, undefined, true);
    try {
      scene.send("csm-wide-ready"); scene.send("csm-wide-closed");
      await waitFor(() => expect(screen.queryByTitle("Wide lesson workspace")).not.toBeInTheDocument());
      expect(scene.lessonButton).toHaveFocus();
      expect(scene.main.inert).toBe(true);
      expect(scene.main.scrollTop).toBe(130);
      expect(scene.source).toHaveTextContent("Dashboard state 1");
    } finally { scene.close(); }
  });
  it("asks the lesson to leave on Back and stays open while the lesson has not accepted", async () => {
    const scene = setup();
    try {
      scene.send("csm-wide-ready");
      const post = vi.spyOn(scene.frame.contentWindow!, "postMessage");
      act(() => {
        window.history.replaceState({ dashboard: "retained" }, "");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(post).toHaveBeenCalledWith({ type: "csm-wide-exit-request", token: scene.token }, window.location.origin);
      expect(screen.getByRole("dialog", { name: "Whole class lesson" })).toBeInTheDocument();
      expect(window.history.state.dashboard).toBe("retained");
      scene.send("csm-wide-closed");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    } finally { scene.close(); }
  });
});


it("accepts a phone Sessions row and restores it after the lesson closes", async () => {
  vi.mocked(window.matchMedia).mockImplementation(query => ({ matches: query.includes("max-width") || query.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList));
  const scene = setup(true);
  try {
    expect(scene.frame).toBeInTheDocument();
    scene.send("csm-wide-ready"); scene.send("csm-wide-closed");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(scene.source).toHaveFocus(); expect(scene.source).toHaveTextContent("Dashboard state 1");
    expect(scene.main.scrollTop).toBe(130);
  } finally { scene.close(); }
});

it("opens over plain HTTP when randomUUID is unavailable", () => {
  const getRandomValues = window.crypto.getRandomValues.bind(window.crypto);
  vi.stubGlobal("crypto", { getRandomValues });
  try {
    const scene = setup();
    try { expect(scene.frame).toBeInTheDocument(); }
    finally { scene.close(); }
  } finally { vi.unstubAllGlobals(); }
});

it("keeps the lesson open through Strict Mode effect reconnection", async () => {
  vi.mocked(window.history.back).mockImplementation(() => queueMicrotask(() => {
    window.history.replaceState({ dashboard: "retained" }, "");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }));
  const scene = setup(false, true);
  try {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(window.history.back).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Whole class lesson" })).toBeInTheDocument();
    scene.send("csm-wide-ready");
    expect(scene.frame).toHaveAttribute("data-ready", "true");
    scene.send("csm-wide-closed");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Whole class lesson" })).not.toBeInTheDocument());
    expect(window.history.back).toHaveBeenCalledOnce();
  } finally { scene.close(); }
});

function sidebar() {
  const panel = document.createElement("aside"); panel.dataset.sidebarPanel = "";
  const students = document.createElement("a"); students.href = "/students"; students.textContent = "Students";
  const home = document.createElement("a"); home.href = "/"; home.textContent = "Home";
  const visitStudents = vi.fn(), visitHome = vi.fn();
  students.addEventListener("click", event => { event.preventDefault(); visitStudents(); });
  home.addEventListener("click", event => { event.preventDefault(); visitHome(); });
  panel.append(students, home); document.body.append(panel);
  return { panel, students, home, visitStudents, visitHome };
}
function finishHistory() {
  act(() => {
    window.history.replaceState({ dashboard: "retained" }, "");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

it("keeps the desktop sidebar usable and follows its real link only after the lesson and its history close", async () => {
  const dismissDetails = vi.fn();
  const nav = sidebar(), scene = setup(false, false, dismissDetails);
  try {
    scene.send("csm-wide-ready");
    const post = vi.spyOn(scene.frame.contentWindow!, "postMessage");
    expect(nav.panel.inert).not.toBe(true);
    expect(scene.main.inert).toBe(true);
    expect(screen.getByRole("dialog", { name: "Whole class lesson" })).not.toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("dialog", { name: "Whole class lesson" })).toHaveStyle({ pointerEvents: "none" });
    fireEvent.click(nav.students);
    expect(post).toHaveBeenCalledWith({ type: "csm-wide-navigate-request", token: scene.token }, window.location.origin);
    expect(nav.visitStudents).not.toHaveBeenCalled();
    expect(dismissDetails).not.toHaveBeenCalled();
    expect(scene.frame).toBeInTheDocument();
    scene.send("csm-wide-closed");
    await waitFor(() => expect(screen.queryByTitle("Wide lesson workspace")).not.toBeInTheDocument());
    expect(nav.visitStudents).not.toHaveBeenCalled();
    finishHistory();
    await waitFor(() => expect(nav.visitStudents).toHaveBeenCalledOnce());
    expect(dismissDetails).toHaveBeenCalledOnce();
    expect(scene.main.inert).not.toBe(true);
  } finally { scene.close(); nav.panel.remove(); }
});

it("cancels deferred navigation on Stay and takes the latest sidebar choice on a later attempt", async () => {
  const nav = sidebar(), scene = setup();
  try {
    scene.send("csm-wide-ready");
    const post = vi.spyOn(scene.frame.contentWindow!, "postMessage");
    fireEvent.click(nav.students);
    scene.send("csm-wide-navigation-cancelled");
    scene.send("csm-wide-closed");
    await waitFor(() => expect(screen.queryByTitle("Wide lesson workspace")).not.toBeInTheDocument());
    finishHistory();
    await act(async () => {});
    expect(nav.visitStudents).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(1);
  } finally { scene.close(); nav.panel.remove(); }

  const lastNav = sidebar(), next = setup();
  try {
    next.send("csm-wide-ready");
    const post = vi.spyOn(next.frame.contentWindow!, "postMessage");
    fireEvent.click(lastNav.students); fireEvent.click(lastNav.home);
    expect(post).toHaveBeenCalledTimes(1);
    next.send("csm-wide-closed");
    await waitFor(() => expect(screen.queryByTitle("Wide lesson workspace")).not.toBeInTheDocument());
    finishHistory();
    await waitFor(() => expect(lastNav.visitHome).toHaveBeenCalledOnce());
    expect(lastNav.visitStudents).not.toHaveBeenCalled();
  } finally { next.close(); lastNav.panel.remove(); }
});

it("leaves modified and new-tab sidebar links alone", () => {
  const nav = sidebar(), scene = setup();
  try {
    scene.send("csm-wide-ready");
    const post = vi.spyOn(scene.frame.contentWindow!, "postMessage");
    fireEvent.click(nav.students, { ctrlKey: true });
    nav.home.target = "_blank"; fireEvent.click(nav.home);
    expect(nav.visitStudents).toHaveBeenCalledOnce(); expect(nav.visitHome).toHaveBeenCalledOnce();
    expect(post).not.toHaveBeenCalled(); expect(scene.frame).toBeInTheDocument();
  } finally { scene.close(); nav.panel.remove(); }
});

it("keeps the same workspace aligned when the parent sidebar collapses", () => {
  const nav = sidebar(), scene = setup();
  try {
    const child = document.implementation.createHTMLDocument();
    const main = child.createElement("main"); main.id = "main-content"; child.body.append(main);
    vi.spyOn(main, "getBoundingClientRect").mockReturnValue({ left: 256, top: 0, width: 1184, height: 900 } as DOMRect);
    vi.spyOn(scene.frame, "contentDocument", "get").mockReturnValue(child);
    scene.send("csm-wide-ready");
    vi.mocked(scene.main.getBoundingClientRect).mockReturnValue({ left: 72, top: 0, width: 1368, height: 900 } as DOMRect);
    fireEvent(window, new Event("resize"));
    expect(scene.frame.style.left).toBe("-256px");
    expect(scene.frame.style.width).toBe("1624px");
    expect(document.querySelector("[data-native-lesson-opening]")).toHaveStyle({ left: "72px", width: "1368px" });
    expect(screen.getByTitle("Wide lesson workspace")).toBe(scene.frame);
  } finally { scene.close(); nav.panel.remove(); }
});

it("keeps phones modal and releases the sidebar after rotating into desktop layout", () => {
  vi.mocked(window.matchMedia).mockImplementation(query => ({ matches: query.includes("max-width") || query.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList));
  const nav = sidebar(), scene = setup(true);
  try {
    expect(nav.panel.inert).toBe(true);
    expect(screen.getByRole("dialog", { name: "Whole class lesson" })).toHaveAttribute("aria-modal", "true");
    vi.mocked(window.matchMedia).mockImplementation(query => ({ matches: query.includes("min-width") || query.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList));
    fireEvent(window, new Event("resize"));
    expect(nav.panel.inert).not.toBe(true); expect(scene.main.inert).toBe(true);
    expect(screen.getByRole("dialog", { name: "Whole class lesson" })).not.toHaveAttribute("aria-modal", "true");
  } finally { scene.close(); nav.panel.remove(); }
});

it("uses the layout bounds while an underlying phone sheet finishes its recession", () => {
  const scene = setup();
  const parent = document.createElement("div"); document.body.append(parent); parent.append(scene.main);
  try {
    vi.spyOn(parent, "getBoundingClientRect").mockReturnValue({ left: 256, top: 0 } as DOMRect);
    Object.defineProperties(scene.main, {
      offsetParent: { configurable: true, value: parent },
      offsetWidth: { configurable: true, value: 1184 }, offsetHeight: { configurable: true, value: 900 },
    });
    scene.main.style.transform = "scale(.988)";
    vi.mocked(scene.main.getBoundingClientRect).mockReturnValue({ left: 263, top: 5, width: 1170, height: 889 } as DOMRect);
    fireEvent(window, new Event("resize"));
    expect(document.querySelector("[data-native-lesson-opening]")).toHaveStyle({ left: "256px", top: "0px", width: "1184px", height: "900px" });
  } finally { scene.close(); parent.remove(); }
});
