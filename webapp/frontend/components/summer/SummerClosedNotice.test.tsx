import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SummerClosedNotice } from "./SummerClosedNotice";
import type { SummerCourseFormConfig } from "@/types";

// Only reached on the no-config path, where the component asks regular
// directly whether the September intake is running.
const getRegularConfig = vi.fn();
vi.mock("@/lib/api", () => ({
  regularAPI: { getFormConfig: () => getRegularConfig() },
}));

beforeEach(() => {
  getRegularConfig.mockReset();
  getRegularConfig.mockRejectedValue(new Error("no regular config"));
});

/** A config shaped like the public endpoint's response, closed by default. */
function makeConfig(
  overrides: Partial<SummerCourseFormConfig> = {},
): SummerCourseFormConfig {
  return {
    year: 2026,
    title: "Summer 2026",
    application_open_date: "2026-04-08T09:30:00",
    application_close_date: "2026-08-29T23:59:00",
    application_window: "closed",
    course_start_date: "2026-07-05",
    course_end_date: "2026-08-29",
    total_lessons: 8,
    pricing_config: { base_fee: 3200 },
    locations: [
      { name: "華士古分校", name_en: "Jardim de Vasco Center", address: "", open_days: [] },
      { name: "二龍喉分校", name_en: "Flora Garden Center", address: "", open_days: [] },
    ],
    available_grades: [],
    time_slots: [],
    ...overrides,
  } as SummerCourseFormConfig;
}

describe("SummerClosedNotice", () => {
  it("says the period has ended once the window has closed", () => {
    render(<SummerClosedNotice config={makeConfig()} lang="zh" />);
    expect(screen.getByText("暑期課程報名期已結束")).toBeInTheDocument();
  });

  it("says when applications open if the window has not started yet", () => {
    render(
      <SummerClosedNotice
        config={makeConfig({ application_window: "before" })}
        lang="zh"
      />,
    );
    expect(screen.getByText("暑期課程報名尚未開放")).toBeInTheDocument();
    expect(screen.getByText(/2026年4月8日/)).toBeInTheDocument();
  });

  it("points a parent at the September intake when it is open", () => {
    render(
      <SummerClosedNotice
        config={makeConfig({
          regular_intake: { year: 2026, application_close_date: "2026-09-30T23:59:00" },
        })}
        lang="zh"
      />,
    );
    const link = screen.getByRole("link", { name: /常規課程報名/ });
    expect(link).toHaveAttribute(
      "href",
      "https://regular.mathconceptsecondary.academy/apply",
    );
    expect(screen.getByText(/2026年9月30日/)).toBeInTheDocument();
  });

  it("falls back to branch contacts when there is no open intake", () => {
    render(<SummerClosedNotice config={makeConfig()} lang="zh" />);
    expect(screen.queryByRole("link", { name: /常規課程報名/ })).toBeNull();
    expect(screen.getByText("華士古分校")).toBeInTheDocument();
    expect(screen.getByText("二龍喉分校")).toBeInTheDocument();
  });

  it("never offers the status page, which is shut for the same reason", () => {
    const { container } = render(
      <SummerClosedNotice config={makeConfig()} lang="zh" />,
    );
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.some((h) => h?.includes("status"))).toBe(false);
  });

  it("renders in English when the page is in English", () => {
    render(<SummerClosedNotice config={makeConfig()} lang="en" />);
    expect(
      screen.getByText("The summer application period has ended"),
    ).toBeInTheDocument();
  });

  describe("with no active intake at all (the config 404s)", () => {
    it("still says the period has ended rather than showing an error", async () => {
      render(<SummerClosedNotice lang="zh" />);
      expect(screen.getByText("暑期課程報名期已結束")).toBeInTheDocument();
    });

    it("falls back to the hardcoded branch contacts", async () => {
      render(<SummerClosedNotice lang="zh" />);
      expect(screen.getByText("華士古分校")).toBeInTheDocument();
      expect(screen.getByText("二龍喉分校")).toBeInTheDocument();
    });

    it("asks regular directly and offers it when that intake is open", async () => {
      getRegularConfig.mockResolvedValue({
        year: 2026,
        application_window: "open",
        application_close_date: "2026-09-30T23:59:00",
      });
      render(<SummerClosedNotice lang="zh" />);
      const link = await screen.findByRole("link", { name: /常規課程報名/ });
      expect(link).toHaveAttribute(
        "href",
        "https://regular.mathconceptsecondary.academy/apply",
      );
    });

    it("keeps the contacts when regular is shut too", async () => {
      getRegularConfig.mockResolvedValue({
        year: 2026,
        application_window: "closed",
        application_close_date: "2026-09-30T23:59:00",
      });
      render(<SummerClosedNotice lang="zh" />);
      await waitFor(() => expect(getRegularConfig).toHaveBeenCalled());
      expect(screen.queryByRole("link", { name: /常規課程報名/ })).toBeNull();
      expect(screen.getByText("華士古分校")).toBeInTheDocument();
    });

    it("does not ask regular when a config was supplied", async () => {
      render(<SummerClosedNotice config={makeConfig()} lang="zh" />);
      expect(getRegularConfig).not.toHaveBeenCalled();
    });
  });
});
