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

describe("exercise modal backdrop", () => {
  it("keeps unsaved changes open without sending the backdrop click to the session row", async () => {
    const openSession = vi.fn();
    render(<div onClick={openSession}>
      <ConfirmProvider>
        <ExerciseModal session={session} exerciseType="CW" isOpen onClose={mocks.close} />
      </ConfirmProvider>
    </div>);
    fireEvent.click(screen.getAllByRole("button", { name: /Add classwork/i })[0]);
    fireEvent.click(screen.getByRole("dialog").previousElementSibling!);
    expect(await screen.findByText("You have unsaved changes. Discard them?")).toBeVisible();
    expect(openSession).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each(["CW", "HW"] as const)("closes %s without opening its parent session row", async (exerciseType) => {
    const openSession = vi.fn();
    render(<div onClick={openSession}>
      <ConfirmProvider>
        <ExerciseModal session={session} exerciseType={exerciseType} isOpen onClose={mocks.close} />
      </ConfirmProvider>
    </div>);
    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.previousElementSibling;
    expect(backdrop).toBeInstanceOf(HTMLElement);
    fireEvent.click(backdrop!);
    await waitFor(() => expect(mocks.close).toHaveBeenCalledTimes(1));
    expect(openSession).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

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

it('adds a material draft once without replacing existing classwork or saving before review', async () => {
  mocks.auth.mockReturnValue({ user: { id: 2 }, effectiveRole: 'Tutor', isReadOnly: false, impersonatedTutor: null });
  const current = { ...session, exercises: [{ id: 9, session_id: 100, exercise_type: 'CW', pdf_name: '[Center]\\existing.pdf' }] } as Session;
  const draft = { pdf_name: '[MSA Staff]\\scan\\new.pdf', pages: '1-2,4' };
  const view = render(<ConfirmProvider><ExerciseModal session={current} exerciseType="CW" isOpen onClose={mocks.close} initialExercise={draft} /></ConfirmProvider>);
  expect(screen.getByDisplayValue('[Center]\\existing.pdf')).toBeInTheDocument();
  expect(screen.getByDisplayValue(draft.pdf_name)).toBeInTheDocument();
  expect(screen.getByDisplayValue('1-2,4')).toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
  view.rerender(<ConfirmProvider><ExerciseModal session={{ ...current }} exerciseType="CW" isOpen onClose={mocks.close} initialExercise={{ ...draft }} /></ConfirmProvider>);
  expect(screen.getAllByDisplayValue(draft.pdf_name)).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  const sent = mocks.save.mock.calls[0][2];
  expect(sent).toHaveLength(2);
  expect(sent[0].pdf_name).toBe('[Center]\\existing.pdf');
  expect(sent[1]).toMatchObject({ pdf_name: draft.pdf_name, remarks: 'Pages: 1-2,4' });
});
