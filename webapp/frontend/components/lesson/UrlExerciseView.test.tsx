import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UrlExerciseView } from "./UrlExerciseView";

const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const DOC = "https://docs.google.com/document/d/abc123/edit";
/** A YouTube channel has no single video to embed. */
const CHANNEL = "https://www.youtube.com/channel/UCabc";

describe("UrlExerciseView", () => {
  it("embeds a link it can show, titled with the exercise's name", () => {
    render(<UrlExerciseView url={VIDEO} title="Circle theorems video" isMobile={false} />);
    const frame = screen.getByTitle("Circle theorems video");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", "https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(screen.queryByText("Open in app")).toBeNull();
  });

  it("offers to open the link in its own app on a phone", () => {
    render(<UrlExerciseView url={VIDEO} title="Circle theorems video" isMobile />);
    expect(screen.getByRole("link", { name: "Open in app" })).toHaveAttribute("href", VIDEO);
  });

  it("says how to get access to a Google Doc", () => {
    render(<UrlExerciseView url={DOC} title="Notes" isMobile={false} />);
    expect(screen.getByText("Can't see the file? Ask the owner to share it with you.")).toBeInTheDocument();
  });

  it("offers a new tab for a link it can't embed", () => {
    render(<UrlExerciseView url={CHANNEL} title="Channel" isMobile={false} />);
    expect(screen.queryByTitle("Channel")).toBeNull();
    expect(screen.getByText("This resource cannot be embedded directly.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in new tab" })).toHaveAttribute("href", CHANNEL);
  });

  it("puts the buttons it's given in a bar above the link", () => {
    render(
      <UrlExerciseView url={VIDEO} title="Video" isMobile={false} toolbarStart={<button>Leave focus mode</button>} />,
    );
    expect(screen.getByRole("button", { name: "Leave focus mode" })).toBeInTheDocument();
  });
});
