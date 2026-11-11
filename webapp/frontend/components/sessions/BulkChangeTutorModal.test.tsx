import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BulkChangeTutorModal } from "./BulkChangeTutorModal";
import { ApiError } from "@/lib/api";
import type { Session } from "@/types";

const mocks = vi.hoisted(() => ({ admin: true, save: vi.fn(), close: vi.fn(), saved: vi.fn(), toast: vi.fn(), refresh: vi.fn(), mutate: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAdmin: mocks.admin }) }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("@/lib/useHaptic", () => ({ useHaptic: () => ({ trigger: () => {} }) }));
vi.mock("@/lib/api", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/api")>(), sessionsAPI: { bulkChangeTutor: mocks.save },
}));
vi.mock("@/lib/session-cache", () => ({ revalidateSessionCaches: mocks.refresh }));
vi.mock("swr", () => ({ mutate: mocks.mutate }));
vi.mock("@/lib/hooks", () => ({ useActiveTutors: () => ({ isLoading: false, data: [
  { id: 1, tutor_name: "Original", default_location: "MSA" },
  { id: 2, tutor_name: "Replacement", default_location: "MSA" },
  { id: 3, tutor_name: "Other branch", default_location: "MSB" },
  { id: 4, tutor_name: "Leaving", default_location: "MSA", departure_effective_on: "2026-11-15" },
] }) }));
const sessions = [
  { id: 10, tutor_id: 1, tutor_name: "Original", student_name: "First student", session_date: "2026-11-12", time_slot: "16:00 - 17:30", location: "MSA" },
  { id: 11, tutor_id: 1, tutor_name: "Original", student_name: "Second student", session_date: "2026-11-19", time_slot: "16:00 - 17:30", location: "MSA" },
] as Session[];
const show = () => render(<BulkChangeTutorModal sessions={sessions} isOpen onClose={mocks.close} onSaved={mocks.saved} />);
const pick = () => fireEvent.change(screen.getByLabelText("New tutor"), { target: { value: "2" } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin = true;
  mocks.save.mockResolvedValue({ changed_session_ids: [10, 11], unchanged_session_ids: [] });
});

describe("bulk tutor change", () => {
  it("requires a selection and sends only session IDs and the chosen tutor", async () => {
    show();
    expect(screen.getByRole("button", { name: "Change tutor for 0 sessions" })).toBeDisabled();
    pick();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Change tutor for 2 sessions" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledOnce());
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith([10, 11], 2);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith(["session", 10]);
    expect(mocks.mutate).toHaveBeenCalledWith(["session", 11]);
  });

  it("offers tutors eligible for all selected dates and branches", () => {
    show();
    expect(screen.getByRole("option", { name: "Replacement" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Other branch" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Leaving" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New tutor"), { target: { value: "1" } });
    expect(screen.getByRole("button", { name: "Change tutor for 0 sessions" })).toBeDisabled();
  });

  it("keeps the selection open and explains blocked sessions on failure", async () => {
    mocks.save.mockRejectedValue(new ApiError("No sessions were changed.", 409, {
      issues: [{ session_id: 11, message: "Billing review required." }],
    }));
    show();
    pick();
    fireEvent.click(screen.getByRole("button", { name: "Change tutor for 2 sessions" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Second student (2026-11-19): Billing review required."));
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("holds the modal and prevents duplicate submissions while saving", async () => {
    mocks.save.mockReturnValue(new Promise(() => {}));
    show();
    pick();
    fireEvent.click(screen.getByRole("button", { name: "Change tutor for 2 sessions" }));
    expect(screen.getByRole("button", { name: "Changing tutor..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByLabelText("New tutor")).toBeDisabled();
    expect(mocks.save).toHaveBeenCalledOnce();
  });

  it("does not offer the modal to other roles", () => {
    mocks.admin = false;
    show();
    expect(screen.queryByLabelText("New tutor")).not.toBeInTheDocument();
  });
});
