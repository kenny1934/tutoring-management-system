import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CurriculumTopicFiles } from "./CurriculumTopicFiles";

const mocks = vi.hoisted(() => ({ search: vi.fn(), add: vi.fn() }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/hooks/usePopoverSheet", async original => ({ ...await original<object>(), useAsSheet: () => false }));
vi.mock("@/lib/lesson-pdf-loader", () => ({ loadExercisePdf: async () => ({ error: "unavailable" }) }));
vi.mock("@/lib/hooks", () => ({
  useCurriculumConcepts: () => ({ data: [
    { id: 1, name_en: "Topic one", leads_to_ids: [2] },
    { id: 2, name_en: "Topic two", builds_on_ids: [1] },
  ] }),
  useCurriculumSearch: (options: { concept_id: number; limit: number }) => {
    mocks.search(options);
    return { data: { concepts: [{ concept_id: options.concept_id, file_count: 40,
      files: Array.from({ length: Math.min(options.limit, 40) }, (_, n) => ({ file_path: `fixtures/topic-${options.concept_id}/Worksheet_${n}.pdf`, file_basename: `Worksheet_${n}.pdf`, role: "exercise", lang: "e", assignment_count: 0, unique_student_count: 0 })) }] }, isLoading: false };
  },
}));

describe("Curriculum worksheet journeys", () => {
  it("keeps an expanded topic and its reading position when stepping into a related topic and back", () => {
    render(<CurriculumTopicFiles conceptId={1} conceptName="Topic one" scope={null} onClose={vi.fn()} inspector />);
    let dialog = screen.getByRole("dialog", { name: "Worksheets for Topic one" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Show 10 more" }));
    expect(within(dialog).getByRole("button", { name: "Worksheet_39" })).toBeInTheDocument();
    const list = dialog.querySelector<HTMLElement>('[data-curriculum-list-scroll]')!; list.scrollTop = 210;
    fireEvent.click(within(dialog).getByRole("button", { name: "Topic two" }));
    dialog = screen.getByRole("dialog", { name: "Worksheets for Topic two" }); expect(list.scrollTop).toBe(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to the previous topic" }));
    dialog = screen.getByRole("dialog", { name: "Worksheets for Topic one" });
    expect(list.scrollTop).toBe(210); expect(within(dialog).getByRole("button", { name: "Worksheet_39" })).toBeInTheDocument();
  });
  it("returns from the reader to the same worksheet, list and keyboard focus", async () => {
    render(<CurriculumTopicFiles conceptId={1} conceptName="Topic one" scope={null} onClose={vi.fn()} inspector />);
    const dialog = screen.getByRole("dialog", { name: "Worksheets for Topic one" });
    const list = dialog.querySelector<HTMLElement>('[data-curriculum-list-scroll]')!; list.style.overflowY = "auto"; list.scrollTop = 180;
    const file = within(dialog).getByRole("button", { name: "Worksheet_0" }); file.focus(); fireEvent.click(file);
    const preview = await screen.findByRole("dialog", { name: "Preview of Worksheet_0" }); list.scrollTop = 0;
    fireEvent.click(within(preview).getByRole("button", { name: "Close preview" }));
    await waitFor(() => expect(file).toHaveFocus()); expect(list.scrollTop).toBe(180);
    expect(screen.getByRole("dialog", { name: "Worksheets for Topic one" })).toBe(dialog);
  });
  it("keeps preview and add actions separate, and Escape closes only the top layer", async () => {
    const close = vi.fn(), add = vi.fn();
    render(<CurriculumTopicFiles conceptId={1} conceptName="Topic one" scope={null} onClose={close} onAdd={add} />);
    const dialog = screen.getByRole("dialog", { name: "Worksheets for Topic one" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Worksheet_0" }));
    await screen.findByRole("dialog", { name: "Preview of Worksheet_0" }); expect(add).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Preview of Worksheet_0" })).not.toBeInTheDocument());
    expect(close).not.toHaveBeenCalled(); expect(dialog).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" }); expect(close).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getAllByTitle("Add to the session")[0]);
    expect(add).toHaveBeenCalledWith("fixtures/topic-1/Worksheet_0.pdf", 1);
  });
});
