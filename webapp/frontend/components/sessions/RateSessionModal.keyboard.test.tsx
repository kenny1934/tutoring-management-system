import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { RateSessionModal } from "./RateSessionModal";
import type { Session } from "@/types";
const mocks = vi.hoisted(() => ({ rate: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/hooks", () => ({ useHomeworkToCheck: () => ({ bySession: new Map() }) }));
vi.mock("@/components/homework/useHomeworkMarked", () => ({ useHomeworkMarked: () => vi.fn() }));
vi.mock("@/components/homework/HomeworkPanel", () => ({ HomeworkPanel: () => null }));
vi.mock("@/lib/hooks/useSummerPreGradeWindow", () => ({ useSummerPreGradeWindow: () => false }));
vi.mock("@/lib/api", () => ({ sessionsAPI: { rateSession: mocks.rate } }));
vi.mock("@/lib/session-cache", () => ({ updateSessionInCache: mocks.cache }));
const session = { id: 71, student_name: "Learner", student_id: 1, tutor_id: 5, enrollment_id: 1, session_date: "2026-11-23", time_slot: "16:45 - 18:15", session_status: "Attended" } satisfies Session;
beforeEach(() => vi.clearAllMocks());
describe("Rating dialog keyboard ownership", () => {
  it("takes Escape for itself without dismissing the search behind it", () => {
    const parentClose = vi.fn();
    function Workspace() { const [open, setOpen] = useState(true); return <><Modal isOpen onClose={parentClose} title="Search"><button>Search result</button></Modal>{open && <RateSessionModal isOpen session={session} onClose={() => setOpen(false)} />}</>; }
    render(<Workspace />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Rate & Comment" })).toBeNull();
    expect(parentClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument();
  });
  it("lets an overlay above it own Escape", () => {
    const closeRating = vi.fn(), closeChild = vi.fn();
    render(<><RateSessionModal isOpen session={session} onClose={closeRating} /><Modal isOpen onClose={closeChild} title="Homework check">Check</Modal></>);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(closeRating).not.toHaveBeenCalled(); expect(closeChild).toHaveBeenCalledOnce();
  });
  it("does not let Ctrl+Enter save a read-only rating", () => {
    const close = vi.fn(); render(<RateSessionModal isOpen session={session} onClose={close} readOnly />);
    fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true });
    expect(mocks.rate).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  });
});
