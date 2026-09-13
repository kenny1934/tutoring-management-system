import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createRef } from "react";
import { PageThumbnails } from "./PageThumbnails";

const pages = [1, 2, 3].map((n) => ({ url: `blob:page-${n}`, width: 900, height: 1200 }));

function renderStrip(overrides: Partial<Parameters<typeof PageThumbnails>[0]> = {}) {
  const toggleRef = createRef<HTMLButtonElement>();
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(
    <>
      <button ref={toggleRef}>Show all pages</button>
      <p>The worksheet</p>
      <PageThumbnails pages={pages} current={2} darkMode={false} onPick={onPick} onClose={onClose} toggleRef={toggleRef} {...overrides} />
    </>,
  );
  return { onPick, onClose, toggleRef };
}

afterEach(cleanup);

describe("PageThumbnails", () => {
  it("shows every page and marks the one in view", () => {
    renderStrip();
    expect(screen.getAllByRole("button", { name: /^Page \d$/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Page 1" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveFocus();
  });

  it("uses the images it's given, so the viewer's sharper ones replace them", () => {
    const toggleRef = createRef<HTMLButtonElement>();
    const props = { current: 1, darkMode: false, onPick: vi.fn(), onClose: vi.fn(), toggleRef };
    const { container, rerender } = render(<PageThumbnails pages={pages} {...props} />);
    const sharper = pages.map((p, i) => ({ ...p, url: `blob:sharp-${i + 1}` }));
    rerender(<PageThumbnails pages={sharper} {...props} />);
    expect([...container.querySelectorAll("img")].map((img) => img.getAttribute("src")))
      .toEqual(["blob:sharp-1", "blob:sharp-2", "blob:sharp-3"]);
  });

  it("passes on the page that was picked", () => {
    const { onPick } = renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
    expect(onPick).toHaveBeenCalledWith(3);
  });

  it("closes on a tap outside, but not on a tap inside or on its own button", () => {
    const { onClose } = renderStrip();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Page 1" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Show all pages" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByText("The worksheet"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a tap that something on the page keeps to itself", () => {
    const { onClose } = renderStrip();
    const worksheet = screen.getByText("The worksheet");
    worksheet.addEventListener("pointerdown", (e) => e.stopPropagation());
    fireEvent.pointerDown(worksheet);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Escape from reaching the lesson, and gives the focus back to its button", () => {
    const lessonKeys = vi.fn();
    window.addEventListener("keydown", lessonKeys);
    const { onClose } = renderStrip();
    fireEvent.keyDown(screen.getByRole("button", { name: "Page 2" }), { key: "Escape" });
    window.removeEventListener("keydown", lessonKeys);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(lessonKeys).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Show all pages" })).toHaveFocus();
  });

  it("lets other keys through to the lesson", () => {
    const lessonKeys = vi.fn();
    window.addEventListener("keydown", lessonKeys);
    const { onClose } = renderStrip();
    fireEvent.keyDown(screen.getByRole("button", { name: "Page 2" }), { key: "j" });
    window.removeEventListener("keydown", lessonKeys);
    expect(onClose).not.toHaveBeenCalled();
    expect(lessonKeys).toHaveBeenCalledTimes(1);
  });

  it("closes from its close button", () => {
    const { onClose } = renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("darkens the small pages in dark PDF mode", () => {
    renderStrip({ darkMode: true });
    const img = screen.getByRole("button", { name: "Page 1" }).querySelector("img");
    expect(img?.style.filter).not.toBe("");
  });
});
