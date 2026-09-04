import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { SummerClosedNotice } from "./SummerClosedNotice";
import type { SummerCourseFormConfig } from "@/types";

// Whether the September intake is open is regular's question to answer, so the
// notice always asks it, config or no config.
const getRegularConfig = vi.fn();
vi.mock("@/lib/api", () => ({
  regularAPI: { getFormConfig: () => getRegularConfig() },
}));

beforeEach(() => {
  getRegularConfig.mockReset();
  getRegularConfig.mockRejectedValue(new Error("no regular config"));
});

/** Render with a fresh SWR cache so one test's regular config cannot leak into
 *  the next, and with retries off so a rejection settles immediately. */
function renderNotice(ui: React.ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      {ui}
    </SWRConfig>,
  );
}

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

/** The September intake, as regular's own public config reports it. */
function regularConfig(window: string) {
  return {
    year: 2026,
    application_window: window,
    application_close_date: "2026-09-30T23:59:00",
  };
}

describe("SummerClosedNotice", () => {
  it("says the period has ended once the window has closed", () => {
    renderNotice(<SummerClosedNotice config={makeConfig()} lang="zh" />);
    expect(screen.getByText("暑期課程報名期已結束")).toBeInTheDocument();
  });

  it("says when applications open if the window has not started yet", () => {
    renderNotice(
      <SummerClosedNotice
        config={makeConfig({ application_window: "before" })}
        lang="zh"
      />,
    );
    expect(screen.getByText("暑期課程報名尚未開放")).toBeInTheDocument();
    // Read straight off the datetime the API returns, with no slicing.
    expect(screen.getByText(/2026年4月8日/)).toBeInTheDocument();
  });

  it("points a parent at the September intake when it is open", async () => {
    getRegularConfig.mockResolvedValue(regularConfig("open"));
    renderNotice(<SummerClosedNotice config={makeConfig()} lang="zh" />);
    const link = await screen.findByRole("link", { name: /常規課程報名/ });
    expect(link).toHaveAttribute(
      "href",
      "https://regular.mathconceptsecondary.academy/apply",
    );
    expect(screen.getByText(/2026年9月30日/)).toBeInTheDocument();
  });

  it("falls back to branch contacts when the September intake is shut", async () => {
    getRegularConfig.mockResolvedValue(regularConfig("closed"));
    renderNotice(<SummerClosedNotice config={makeConfig()} lang="zh" />);
    expect(await screen.findByText("華士古分校")).toBeInTheDocument();
    expect(screen.getByText("二龍喉分校")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /常規課程報名/ })).toBeNull();
  });

  it("never offers the status page, which is shut for the same reason", () => {
    const { container } = renderNotice(
      <SummerClosedNotice config={makeConfig()} lang="zh" />,
    );
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.some((h) => h?.includes("status"))).toBe(false);
  });

  it("renders in English when the page is in English", () => {
    renderNotice(<SummerClosedNotice config={makeConfig()} lang="en" />);
    expect(
      screen.getByText("The summer application period has ended"),
    ).toBeInTheDocument();
  });

  describe("with no active intake at all (the summer config 404s)", () => {
    it("still says the period has ended rather than showing an error", () => {
      renderNotice(<SummerClosedNotice lang="zh" />);
      expect(screen.getByText("暑期課程報名期已結束")).toBeInTheDocument();
    });

    it("falls back to the hardcoded branch names", async () => {
      getRegularConfig.mockResolvedValue(regularConfig("closed"));
      renderNotice(<SummerClosedNotice lang="zh" />);
      expect(await screen.findByText("華士古分校")).toBeInTheDocument();
      expect(screen.getByText("二龍喉分校")).toBeInTheDocument();
    });

    it("still offers the September intake, since that answer is regular's own", async () => {
      getRegularConfig.mockResolvedValue(regularConfig("open"));
      renderNotice(<SummerClosedNotice lang="zh" />);
      expect(
        await screen.findByRole("link", { name: /常規課程報名/ }),
      ).toBeInTheDocument();
    });
  });
});
