import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { TextPart } from "@/lib/text-ink";
import type { InkSize } from "@/hooks/useAnnotationTools";
import { ReasonsPanel } from "./ReasonsPanel";

beforeEach(() => localStorage.clear());

// The whole list has a couple of hundred buttons, and finding one by its role
// checks every element's name and whether it can be seen, which is slow in the
// test browser. So each test searches first to keep the list short, and skips
// the visibility check the way the tray's tests do.
const byRole = (role: string, name: string) => screen.getByRole(role, { name, hidden: true });
const noRole = (role: string, name: string) => screen.queryByRole(role, { name, hidden: true });
const search = (query: string) => fireEvent.change(byRole("searchbox", "Find a reason"), { target: { value: query } });

interface PanelProps {
  onPick?: (parts: TextPart[]) => void;
  onTextSize?: (size: InkSize) => void;
  onTextColour?: (id: string) => void;
  scrollRef?: { current: number };
}

// The tray keeps the search, the scroll and the letters while the list is closed, and this stands in for it.
function Panel({ onPick = vi.fn(), onTextSize = vi.fn(), onTextColour = vi.fn(), scrollRef = { current: 0 } }: PanelProps) {
  const [query, setQuery] = useState("");
  const [letters, setLetters] = useState<Record<string, string[]>>({});
  return (
    <ReasonsPanel
      onPick={onPick}
      textSize="M"
      textColour="black"
      onTextSize={onTextSize}
      onTextColour={onTextColour}
      query={query}
      onQueryChange={setQuery}
      scrollRef={scrollRef}
      letters={letters}
      onLetters={(line, typed) => setLetters((prev) => ({ ...prev, [line]: typed }))}
    />
  );
}

describe("ReasonsPanel", () => {
  it("places a tapped line on its own: Chinese as it's written, and English in italic", () => {
    const onPick = vi.fn();
    render(<Panel onPick={onPick} />);
    search("對頂");
    fireEvent.click(byRole("button", "對頂角相等"));
    expect(onPick).toHaveBeenLastCalledWith([{ text: "對頂角相等", italic: false }]);
    fireEvent.click(byRole("button", "vert. opp. ∠s"));
    expect(onPick).toHaveBeenLastCalledWith([{ text: "vert. opp. ∠s", italic: true }]);
  });

  it("offers every line of a reason, and a reason written in one language only", () => {
    const onPick = vi.fn();
    render(<Panel onPick={onPick} />);
    search("平角");
    for (const line of ["adj. ∠s on st. line", "補角定義", "平角定義"]) expect(byRole("button", line)).toBeInTheDocument();
    search("HL");
    fireEvent.click(byRole("button", "HL"));
    expect(onPick).toHaveBeenLastCalledWith([{ text: "HL", italic: false }]);
  });

  it("sets the size and colour of new text from its header", () => {
    const onTextSize = vi.fn();
    const onTextColour = vi.fn();
    render(<Panel onTextSize={onTextSize} onTextColour={onTextColour} />);
    expect(byRole("button", "Medium text")).toHaveAttribute("aria-pressed", "true");
    expect(byRole("button", "Black text")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(byRole("button", "Large text"));
    fireEvent.click(byRole("button", "Blue text"));
    expect(onTextSize).toHaveBeenCalledWith("L");
    expect(onTextColour).toHaveBeenCalledWith("blue");
    // Highlighter colours are too pale to write in.
    expect(noRole("button", "Yellow text")).toBeNull();
  });

  it("asks for the lines' letters, starting with AB and CD, and starts with the ones typed last after that", () => {
    const onPick = vi.fn();
    render(<Panel onPick={onPick} />);
    search("alt");
    fireEvent.click(byRole("button", "alt. ∠s, AB // CD"));
    expect(onPick).not.toHaveBeenCalled();

    expect(byRole("textbox", "First line")).toHaveValue("AB");
    fireEvent.change(byRole("textbox", "First line"), { target: { value: "PQ" } });
    fireEvent.change(byRole("textbox", "Second line"), { target: { value: "RS" } });
    fireEvent.click(byRole("button", "Place"));
    expect(onPick).toHaveBeenCalledWith([{ text: "alt. ∠s, PQ // RS", italic: true }]);

    fireEvent.click(byRole("button", "alt. ∠s, PQ // RS"));
    expect(byRole("textbox", "First line")).toHaveValue("PQ");
    expect(byRole("textbox", "Second line")).toHaveValue("RS");
  });

  it("finds reasons as they're searched for, and says so when nothing matches", () => {
    render(<Panel />);
    search("內錯");
    expect(byRole("button", "兩直線平行，內錯角相等")).toBeInTheDocument();
    expect(noRole("button", "對頂角相等")).toBeNull();

    search("xylophone");
    expect(screen.getByText("No reasons match “xylophone”.")).toBeInTheDocument();
  });

  it("gives each topic a tab, only for the topics a search finds, and a tab jumps to its topic", () => {
    render(<Panel />);
    const tabs = () => within(byRole("navigation", "Topics")).getAllByRole("button", { hidden: true });
    expect(tabs()).toHaveLength(14);

    const circles = byRole("region", "Angles in a circle");
    const list = circles.parentElement!;
    Object.defineProperty(circles, "offsetTop", { value: 900 });
    Object.defineProperty(list, "scrollTop", { value: 0, writable: true });
    fireEvent.click(within(byRole("navigation", "Topics")).getByRole("button", { name: "Circle angles", hidden: true }));
    expect(list.scrollTop).toBe(900);
    expect(tabs().find((tab) => tab.getAttribute("aria-current") === "true")).toHaveTextContent("Circle angles");

    search("內錯");
    expect(tabs().map((tab) => tab.textContent)).toEqual(["Angles"]);
  });

  it("shows the lines picked last at the top, and leaves them out while searching", () => {
    const { unmount } = render(<Panel />);
    expect(noRole("region", "Recent")).toBeNull();
    search("對頂");
    fireEvent.click(byRole("button", "對頂角相等"));
    unmount();

    render(<Panel />);
    expect(within(byRole("region", "Recent")).getByRole("button", { name: "對頂角相等", hidden: true })).toBeInTheDocument();
    search("SAS");
    expect(noRole("region", "Recent")).toBeNull();
  });

  it("shows the sheet's explanations, and tags the reasons the textbooks don't have", () => {
    render(<Panel />);
    expect(screen.getByText("解釋：三角形中，至少兩條邊相等")).toBeInTheDocument();
    expect(screen.getAllByText("Not in MiA or MathSmart").length).toBeGreaterThan(0);
  });

  it("keeps how far down the list was scrolled, for the next time it opens", () => {
    const scrollRef = { current: 0 };
    render(<Panel scrollRef={scrollRef} />);
    const list = byRole("region", "Angles and parallel lines").parentElement!;
    Object.defineProperty(list, "scrollTop", { value: 240, writable: true });
    fireEvent.scroll(list);
    expect(scrollRef.current).toBe(240);
  });
});
