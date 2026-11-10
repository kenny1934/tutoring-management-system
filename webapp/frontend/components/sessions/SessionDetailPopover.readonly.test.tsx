import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SessionDetailPopover } from "./SessionDetailPopover";
import type { Session } from "@/types";

const { attended, noShow } = vi.hoisted(() => ({ attended: vi.fn(), noShow: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, effectiveRole: "Admin", isReadOnly: true }) }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/contexts/ConfirmContext", () => ({ useConfirmOpen: () => false }));
vi.mock("@/lib/hooks", () => ({ useSession: () => ({ data: undefined, isLoading: false }) }));
vi.mock("swr", async importOriginal => ({ ...await importOriginal<typeof import("swr")>(), default: () => ({ data: [], isLoading: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("./EditableLessonNumberBadge", () => ({ EditableLessonNumberBadge: () => null, useSaveLessonNumber: () => vi.fn() }));
vi.mock("@/components/homework/useHomeworkMarked", () => ({ useHomeworkMarked: () => vi.fn() }));
vi.mock("@/lib/api", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, sessionsAPI: { ...original.sessionsAPI, markAttended: attended, markNoShow: noShow } };
});
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); history.replaceState({}, "", "/sessions"); });
it("keeps attendance keyboard shortcuts read-only in a populated detail sheet", () => {
  const session: Session = { id: 1, enrollment_id: 1, student_id: 2, student_name: "Student", tutor_id: 1, tutor_name: "Tutor", school_student_id: "1234", session_status: "Scheduled", session_date: "2026-10-16", time_slot: "16:45 - 18:15", location: "MSA", exercises: [] };
  render(<SessionDetailPopover session={session} isOpen onClose={() => {}} clickPosition={{ x: 100, y: 100 }} />);
  expect(screen.getByRole("button", { name: "Lesson mode" })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "a" }); fireEvent.keyDown(document, { key: "n" });
  expect(attended).not.toHaveBeenCalled(); expect(noShow).not.toHaveBeenCalled();
});
