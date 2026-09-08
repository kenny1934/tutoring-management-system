import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SchoolProgressAsk } from "./SchoolProgressAsk";
import type { CurriculumAsk, Session } from "@/types";

// The row talks to the toast context and the API client. Neither is what this
// component decides: it renders the state the server chose, records that the
// question was seen, and hands answers back.
const confirmTopic = vi.fn();
const undoConfirm = vi.fn();
const recordFeatureEvents = vi.fn();

vi.mock("@/lib/api", () => ({
  curriculumAPI: {
    confirmTopic: (...args: unknown[]) => confirmTopic(...args),
    undoConfirm: (...args: unknown[]) => undoConfirm(...args),
  },
  recordFeatureEvents: (...args: unknown[]) => recordFeatureEvents(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super("api");
      this.status = status;
    }
  },
}));

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

beforeEach(() => {
  confirmTopic.mockReset().mockResolvedValue({ id: 7, created: true });
  undoConfirm.mockReset().mockResolvedValue({ deleted: true });
  recordFeatureEvents.mockReset();
});

const SESSION = {
  id: 4321,
  student_id: 12,
  session_date: "2026-09-08",
  school: "DBYW-C",
  grade: "F1",
  lang_stream: "C",
} as Session;

const ask = (overrides: Partial<CurriculumAsk> = {}): CurriculumAsk => ({
  state: "ask",
  reason_class: "routine",
  combo_key: "DBYW-C|F1|C|2026-2027|1",
  concept_id: null,
  name_en: null,
  name_zh: null,
  answered_on: null,
  answered_by: null,
  split: false,
  ...overrides,
});

const TOP = { id: 42, name: "Rational Numbers" };

function renderAsk(a: CurriculumAsk, onCorrect = vi.fn()) {
  render(
    <SchoolProgressAsk
      ask={a}
      session={SESSION}
      topConcept={TOP}
      inTestWindow={false}
      onCorrect={onCorrect}
    />,
  );
  return onCorrect;
}

describe("SchoolProgressAsk", () => {
  it("asks about the school's top topic, with three ways to answer", () => {
    renderAsk(ask());
    expect(
      screen.getByText("DBYW-C F1 on Rational Numbers this week?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No, it's…")).toBeInTheDocument();
    expect(screen.getByText("Not sure")).toBeInTheDocument();
  });

  it("reports that the question was seen, tagged with why it was asked", () => {
    renderAsk(ask({ reason_class: "blind" }));
    expect(recordFeatureEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        event_key: "school_progress.asked.blind",
        dedupe_key: "sp-ask:DBYW-C|F1|C|2026-2027|1",
      }),
    ]);
  });

  it("records an answer against the topic it asked about", async () => {
    renderAsk(ask());
    fireEvent.click(screen.getByText("Yes"));
    await waitFor(() =>
      expect(confirmTopic).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: 12,
          concept_id: 42,
          session_id: 4321,
          origin: "strip",
          is_revision: false,
        }),
      ),
    );
    expect(await screen.findByText("Noted, thanks!")).toBeInTheDocument();
  });

  // "Mon 7 Sept" is formatWeekdayShort, the same formatter the session lists
  // use for a day heading, so a date reads the same wherever it appears.
  it("says who answered and when, with the weekday the app uses elsewhere", () => {
    renderAsk(
      ask({
        state: "answered",
        reason_class: null,
        concept_id: 42,
        name_en: "Rational Numbers",
        answered_on: "2026-09-07",
        answered_by: "Mr Tom Ieong",
      }),
    );
    expect(
      screen.getByText("Confirmed Mon 7 Sept by Mr Tom Ieong"),
    ).toBeInTheDocument();
    // Nobody is asked anything, but disagreeing stays one tap away.
    expect(screen.queryByText("Yes")).not.toBeInTheDocument();
    expect(screen.getByText("Not this class?")).toBeInTheDocument();
  });

  it("asks again once the answer is old, naming the day it came from", () => {
    renderAsk(
      ask({
        state: "stale",
        reason_class: "stale",
        concept_id: 42,
        name_en: "Rational Numbers",
        answered_on: "2026-09-03",
      }),
    );
    expect(
      screen.getByText("Still on Rational Numbers since Thu 3 Sept?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Yes, still")).toBeInTheDocument();
    expect(screen.getByText("Moved on…")).toBeInTheDocument();
    // A stale question is about a topic already on record, so "Not sure"
    // would only add noise.
    expect(screen.queryByText("Not sure")).not.toBeInTheDocument();
  });

  it("asks about the student's own class when the school is out of step", () => {
    renderAsk(ask({ reason_class: "split", split: true }));
    expect(
      screen.getByText("Is this student's class on Rational Numbers?"),
    ).toBeInTheDocument();
  });

  it("hands disagreement to the topic picker", () => {
    const onCorrect = renderAsk(ask());
    fireEvent.click(screen.getByText("No, it's…"));
    expect(onCorrect).toHaveBeenCalled();
    expect(confirmTopic).not.toHaveBeenCalled();
  });

  it("records not knowing, which is the only answer nothing else captures", () => {
    renderAsk(ask());
    fireEvent.click(screen.getByText("Not sure"));
    expect(recordFeatureEvents).toHaveBeenLastCalledWith([
      expect.objectContaining({ event_key: "school_progress.answered_unsure" }),
    ]);
    expect(confirmTopic).not.toHaveBeenCalled();
    expect(screen.getByText("Thanks, we will ask someone else.")).toBeInTheDocument();
  });

  it("stays out of the way when the tutor should be left alone", () => {
    const { container } = render(
      <SchoolProgressAsk
        ask={ask({ state: "none", reason_class: null })}
        session={SESSION}
        topConcept={TOP}
        inTestWindow={false}
        onCorrect={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(recordFeatureEvents).not.toHaveBeenCalled();
  });

  it("asks whether it is revision before recording during a test window", async () => {
    render(
      <SchoolProgressAsk
        ask={ask()}
        session={SESSION}
        topConcept={TOP}
        inTestWindow
        onCorrect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Yes"));
    expect(confirmTopic).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByText("Revision"));
    await waitFor(() =>
      expect(confirmTopic).toHaveBeenCalledWith(
        expect.objectContaining({ is_revision: true }),
      ),
    );
  });
});
