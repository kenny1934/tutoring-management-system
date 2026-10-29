import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "@/contexts/ConfirmContext";
import { ExerciseModal } from "./ExerciseModal";
import { BulkExerciseModal } from "./BulkExerciseModal";
import type { Session } from "@/types";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn(), cache: vi.fn(), close: vi.fn(), toast: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: mocks.auth }));
vi.mock("@/contexts/LocationContext", () => ({ useLocation: () => ({ selectedLocation: "Main Center" }) }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("@/lib/useHaptic", () => ({ useHaptic: () => ({ trigger: () => {} }) }));
vi.mock("@/lib/hooks", () => ({ useSession: () => ({ data: undefined, isLoading: false }) }));
vi.mock("@/lib/api", () => ({ sessionsAPI: { saveExercises: mocks.save, getExerciseHistory: async () => ({ sessions: [], has_more: false }) } }));
vi.mock("@/lib/session-cache", () => ({ updateSessionInCache: mocks.cache }));
vi.mock("@/lib/file-system", () => ({ isFileSystemAccessSupported: () => false }));
vi.mock("@/lib/paperless-utils", () => ({ searchPaperlessByPath: vi.fn() }));
vi.mock("@/components/ui/folder-tree-modal", () => ({ FolderTreeModal: () => null }));
vi.mock("@/components/ui/paperless-search-modal", () => ({ PaperlessSearchModal: () => null }));
vi.mock("@/components/ui/file-search-modal", () => ({ FileSearchModal: () => null }));
vi.mock("./ExerciseHistoryPanel", () => ({ ExerciseHistoryPanel: () => null }));
vi.mock("./TrendingCoursewareSection", () => ({ TrendingCoursewareSection: () => null }));
vi.mock("./CurriculumSuggestionSection", () => ({ CurriculumSuggestionSection: () => null }));
vi.mock("./SummerMaterialsSection", () => ({ SummerMaterialsSection: () => null, SummerBulkAssignSection: () => null }));
vi.mock("@/components/homework/useHomeworkMarked", () => ({ useHomeworkMarked: () => vi.fn() }));
vi.mock("@/components/homework/HomeworkCheckList", () => ({ HomeworkCheckList: () => null }));
vi.mock("./RecapExerciseItem", () => ({ RecapExerciseItem: () => null }));

const session = {
  id: 100, tutor_id: 2, tutor_name: "Assigned Tutor", student_id: 1,
  student_name: "Test Student", school_student_id: "001", session_date: "2026-10-29",
  time_slot: "15:00 - 16:30", location: "Main Center", exercises: [],
} as Session;
const show = () => render(<ConfirmProvider><ExerciseModal session={session} exerciseType="CW" isOpen onClose={mocks.close} /></ConfirmProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ user: { id: 3 }, effectiveRole: "Tutor", isReadOnly: false, impersonatedTutor: null });
  mocks.save.mockResolvedValue(session);
});

const confirmation = () => screen.getByText("Save exercises for another tutor?");
const assertNotSaved = () => {
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.cache).not.toHaveBeenCalled();
  expect(mocks.close).not.toHaveBeenCalled();
};

describe("saving exercises with a tutor mismatch", () => {
  it("waits for explicit confirmation before changing the cache, closing or saving", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(confirmation()).toBeVisible());
    assertNotSaved();
    fireEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(100, "CW", []));
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it.each(["button", "Escape"])("cancels without saving using %s", async (action) => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const confirmButton = screen.getByRole("button", { name: "Save anyway" });
    if (action === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else fireEvent.click(within(confirmButton.parentElement!).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Save exercises for another tutor?")).not.toBeInTheDocument());
    assertNotSaved();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it.each(["s", "Enter"])("uses the same confirmation for Ctrl+%s and does not bypass it with repeated shortcuts", async (key) => {
    show();
    fireEvent.keyDown(document, { key, ctrlKey: true });
    await waitFor(() => expect(confirmation()).toBeVisible());
    fireEvent.keyDown(document, { key, ctrlKey: true });
    assertNotSaved();
  });

  it("saves an own lesson without an extra confirmation", async () => {
    mocks.auth.mockReturnValue({ user: { id: 2 }, effectiveRole: "Tutor", isReadOnly: false, impersonatedTutor: null });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Save exercises for another tutor?")).not.toBeInTheDocument();
  });
});


describe("bulk assignment confirmation", () => {
  it("shows the tutor warning before any session is saved", async () => {
    render(<ConfirmProvider><BulkExerciseModal sessions={[session, { ...session, id: 101, tutor_id: 3 }]} exerciseType="CW" isOpen onClose={mocks.close} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Add classwork" }));
    fireEvent.change(screen.getByPlaceholderText("PDF path or URL (drag & drop supported)"), { target: { value: "Prepared.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign to 2 sessions" }));
    const heading = screen.getByText("Confirm bulk assignment");
    expect(within(heading.parentElement!).getByRole("alert")).toHaveTextContent("1 of the selected sessions is assigned to another tutor.");
    assertNotSaved();
    fireEvent.click(within(heading.parentElement!).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  });
});
