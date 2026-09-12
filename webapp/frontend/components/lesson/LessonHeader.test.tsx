import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { Calendar, MapPin } from "lucide-react";
import { LessonHeader } from "./LessonHeader";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

type HeaderProps = Parameters<typeof LessonHeader>[0];

function renderHeader(overrides: Partial<HeaderProps> = {}) {
  const props: HeaderProps = {
    focus: { focusMode: false, exitFocusMode: vi.fn(), toggleFocusMode: vi.fn() },
    exitLabel: "Close lesson tab",
    exitTitle: "Close lesson tab",
    onExit: vi.fn(),
    info: <span>Ms Lee · 16:45 - 18:15</span>,
    details: [{ icon: Calendar, text: "11 Sep" }, { icon: MapPin, text: "MSA" }],
    syncStatus: "saved",
    wolframOpen: false,
    onWolframToggle: vi.fn(),
    canDownloadAll: true,
    savingAll: false,
    onDownloadAll: vi.fn(),
    print: {
      label: "Print all exercises",
      printing: { id: null, progress: null },
      open: false,
      onOpenChange: vi.fn(),
      onPrint: vi.fn(),
    },
    helpOpen: false,
    onHelpToggle: vi.fn(),
    ...overrides,
  };
  render(<LessonHeader {...props} />);
  return props;
}

describe("LessonHeader", () => {
  it("shows who the lesson is for, its details, and where its ink stands", () => {
    renderHeader();
    expect(screen.getByText("Ms Lee · 16:45 - 18:15")).toBeInTheDocument();
    expect(screen.getByText("11 Sep")).toBeInTheDocument();
    expect(screen.getByText("MSA")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("leaves the lesson from the exit button, under the name the view gives it", () => {
    const props = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Close lesson tab" }));
    expect(props.onExit).toHaveBeenCalledTimes(1);
  });

  it("leaves focus mode first when it's on", () => {
    const focus = { focusMode: true, exitFocusMode: vi.fn(), toggleFocusMode: vi.fn() };
    const props = renderHeader({ focus });
    fireEvent.click(screen.getByRole("button", { name: "Exit focus mode" }));
    expect(focus.exitFocusMode).toHaveBeenCalledTimes(1);
    expect(props.onExit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Focus mode" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps Download All disabled until there's ink to download", () => {
    renderHeader({ canDownloadAll: false });
    expect(screen.getByRole("button", { name: "Download all ink as PDFs" })).toBeDisabled();
  });

  it("hands the Wolfram, focus and help buttons to the view, and shows which are on", () => {
    const props = renderHeader({ wolframOpen: true });
    const wolfram = screen.getByRole("button", { name: "Wolfram Alpha" });
    expect(wolfram).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(wolfram);
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    fireEvent.click(screen.getByRole("button", { name: "Focus mode" }));
    expect(props.onWolframToggle).toHaveBeenCalledTimes(1);
    expect(props.onHelpToggle).toHaveBeenCalledTimes(1);
    expect(props.focus.toggleFocusMode).toHaveBeenCalledTimes(1);
  });

  it("puts the view's print menu in the header, under the view's name for it", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Print all exercises" })).toBeInTheDocument();
  });
});
