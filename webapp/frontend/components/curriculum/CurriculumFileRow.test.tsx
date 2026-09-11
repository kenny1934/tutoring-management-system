import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CurriculumFileBadges } from "./CurriculumFileRow";
import type { CurriculumFile } from "@/types";

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function file(overrides: Partial<CurriculumFile>): CurriculumFile {
  return {
    file_path: "Center\\Courseware (Eng)\\704_EX2_e.pdf",
    file_basename: "704_EX2_e.pdf",
    role: "exercise",
    lang: "e",
    confidence: 1,
    map_source: "code",
    assignment_count: 0,
    unique_student_count: 0,
    latest_use: null,
    ...overrides,
  };
}

describe("the badge for a file this student has had before", () => {
  it("says Done when some assignment covered the whole file", () => {
    render(
      <CurriculumFileBadges
        file={file({
          student_assigned_count: 1,
          student_last_assigned: "2026-06-07",
          student_pages_done: null,
        })}
      />
    );
    const badge = screen.getByText("Done · 7 Jun");
    expect(badge.getAttribute("title")).toBe(
      "Already assigned to this student 1 time, last on 7 Jun 2026"
    );
  });

  it("shows the pages instead when only part of the file was set", () => {
    render(
      <CurriculumFileBadges
        file={file({
          student_assigned_count: 2,
          student_last_assigned: "2026-06-14",
          student_pages_done: "1-4,9-14",
        })}
      />
    );
    const badge = screen.getByText("p1-4,9-14 · 14 Jun");
    expect(badge.className).toContain("border-dashed");
    expect(badge.getAttribute("title")).toBe(
      "This student has done pages 1-4 and 9-14 of this file so far. " +
        "It has been assigned to them 2 times, last on 14 Jun 2026."
    );
  });

  it("keeps a long page list short in the badge and whole in the tooltip", () => {
    render(
      <CurriculumFileBadges
        file={file({
          student_assigned_count: 3,
          student_last_assigned: "2026-02-15",
          student_pages_done: "1-2,4-6,8",
        })}
      />
    );
    const badge = screen.getByText("p1-2,4-6… · 15 Feb");
    expect(badge.getAttribute("title")).toContain("pages 1-2, 4-6 and 8 of this file");
  });

  it("names a single page in the singular", () => {
    render(
      <CurriculumFileBadges
        file={file({ student_assigned_count: 1, student_pages_done: "3" })}
      />
    );
    expect(screen.getByText("p3").getAttribute("title")).toBe(
      "This student has done page 3 of this file so far. It has been assigned to them 1 time."
    );
  });
});
