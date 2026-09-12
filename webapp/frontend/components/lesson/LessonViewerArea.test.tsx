import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Ref } from "react";
import type { AnnotationTools } from "@/hooks/useAnnotationTools";

// The real Draft needs a full set of pen tools, and DraftPane has tests of its own.
vi.mock("./DraftPane", () => ({
  DraftPane: ({ exerciseId, onClose }: { exerciseId: number; onClose: () => void }) => (
    <section aria-label="Draft">
      Draft sheets for exercise {exerciseId}
      <button onClick={onClose}>Close the draft</button>
    </section>
  ),
  DraftTrayLane: ({ ref }: { ref: Ref<HTMLDivElement> }) => <div ref={ref} data-testid="tray-lane" />,
}));

import { LessonViewerArea } from "./LessonViewerArea";

type AreaProps = Parameters<typeof LessonViewerArea>[0];

function Crash(): never {
  throw new Error("pdf.js gave up");
}

function renderArea(overrides: Partial<AreaProps> = {}) {
  const props: AreaProps = {
    isMobile: false,
    worksheet: <p>The worksheet</p>,
    onRetry: vi.fn(),
    answerKey: {
      shown: false, loaded: false, viewer: <p>The answers</p>, mobileTab: "exercise", onMobileTabChange: vi.fn(),
    },
    draft: {
      open: false, exerciseId: 1001, annotations: {}, onPageStrokesChange: vi.fn(), onClearPages: vi.fn(),
      onUndo: vi.fn(), tools: {} as AnnotationTools, onClose: vi.fn(), onTrayArea: vi.fn(),
    },
    ...overrides,
  };
  render(<LessonViewerArea {...props} />);
  return props;
}

describe("LessonViewerArea", () => {
  it("shows the worksheet, with whatever the view puts above it", () => {
    renderArea({ top: <p>Chan Tai Man</p> });
    expect(screen.getByText("Chan Tai Man")).toBeInTheDocument();
    expect(screen.getByText("The worksheet")).toBeInTheDocument();
  });

  it("shows a link in the worksheet's place", () => {
    renderArea({ link: <p>The video</p> });
    expect(screen.getByText("The video")).toBeInTheDocument();
    expect(screen.queryByText("The worksheet")).toBeNull();
  });

  it("offers Try again when the worksheet's viewer crashes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const props = renderArea({ worksheet: <Crash /> });
    expect(screen.getByText("Something went wrong rendering the PDF")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onRetry).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("puts the answer key beside the worksheet on a big screen", () => {
    renderArea({ answerKey: { shown: true, loaded: true, viewer: <p>The answers</p>, mobileTab: "exercise", onMobileTabChange: vi.fn() } });
    expect(screen.getByText("The worksheet")).toBeInTheDocument();
    expect(screen.getByText("The answers")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Answer Key" })).toBeNull();
  });

  it("puts the worksheet and the answer key on tabs on a phone", () => {
    const onMobileTabChange = vi.fn();
    renderArea({
      isMobile: true,
      answerKey: { shown: true, loaded: true, viewer: <p>The answers</p>, mobileTab: "answer", onMobileTabChange },
    });
    expect(screen.getByText("The answers")).toBeInTheDocument();
    expect(screen.queryByText("The worksheet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Exercise" }));
    expect(onMobileTabChange).toHaveBeenCalledWith("exercise");
  });

  it("leaves out a phone's tabs until the answer key's file has loaded", () => {
    renderArea({
      isMobile: true,
      answerKey: { shown: true, loaded: false, viewer: <p>The answers</p>, mobileTab: "exercise", onMobileTabChange: vi.fn() },
    });
    expect(screen.queryByRole("button", { name: "Answer Key" })).toBeNull();
    expect(screen.getByText("The worksheet")).toBeInTheDocument();
  });

  it("opens the Draft beside the worksheet with the Pen Tray's lane, and closes it", () => {
    const onClose = vi.fn();
    const onTrayArea = vi.fn();
    renderArea({
      draft: {
        open: true, exerciseId: 1001, annotations: {}, onPageStrokesChange: vi.fn(), onClearPages: vi.fn(),
        onUndo: vi.fn(), tools: {} as AnnotationTools, onClose, onTrayArea,
      },
      answerKey: { shown: true, loaded: true, viewer: <p>The answers</p>, mobileTab: "exercise", onMobileTabChange: vi.fn() },
    });
    expect(screen.getByRole("region", { name: "Draft" })).toHaveTextContent("Draft sheets for exercise 1001");
    expect(onTrayArea).toHaveBeenCalledWith(screen.getByTestId("tray-lane"));
    expect(screen.getByText("The worksheet")).toBeInTheDocument();
    expect(screen.getByText("The answers")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close the draft" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows no Draft while it's shut", () => {
    renderArea();
    expect(screen.queryByRole("region", { name: "Draft" })).toBeNull();
    expect(screen.queryByTestId("tray-lane")).toBeNull();
  });
});
