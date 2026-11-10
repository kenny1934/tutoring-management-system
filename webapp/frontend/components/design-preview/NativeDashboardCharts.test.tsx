import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { NativeDashboardCharts } from "./NativeDashboardCharts";

beforeEach(() => { window.sessionStorage.clear(); window.history.replaceState({}, "", "/?ui-preview=motion"); });
function GradePreferences() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Grade preference {count}</button>;
}
function charts(isMobile = true) {
  return render(<NativeDashboardCharts isMobile={isMobile} grade={<GradePreferences />} school={<p>School chart</p>} />);
}

describe("dashboard chart choice", () => {
  it("keeps the visible selection and its pressed state in step with the chart in both directions", () => {
    const { container } = charts();
    const grade = screen.getByRole("button", { name: "By grade" });
    const school = screen.getByRole("button", { name: "By school" });
    fireEvent.click(school);
    expect(school).toHaveAttribute("aria-pressed", "true");
    expect(school).toHaveClass("bg-field-fill");
    expect(grade).not.toHaveClass("bg-field-fill");
    expect(container.querySelector('[data-native-chart-panel="school"]')).not.toHaveAttribute("aria-hidden");
    expect(container.querySelector('[data-native-chart-panel="grade"]')).toHaveAttribute("inert");
    fireEvent.click(grade);
    expect(grade).toHaveAttribute("aria-pressed", "true");
    expect(grade).toHaveClass("bg-field-fill");
    expect(school).not.toHaveClass("bg-field-fill");
    expect(container.querySelector('[data-native-chart-panel="school"]')).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps chart preferences mounted and takes the last choice after rapid switching", () => {
    charts();
    fireEvent.click(screen.getByRole("button", { name: "Grade preference 0" }));
    fireEvent.click(screen.getByRole("button", { name: "By school" }));
    fireEvent.click(screen.getByRole("button", { name: "By grade" }));
    expect(screen.getByRole("button", { name: "Grade preference 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "By school" }));
    expect(screen.getByRole("button", { name: "By school" })).toHaveClass("bg-field-fill");
  });

  it("shows both charts on desktop without the phone choice", () => {
    const { container } = charts(false);
    expect(screen.queryByRole("group", { name: "Which chart to show" })).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-native-chart-panel]')).toHaveLength(2);
    expect(screen.getByText("School chart")).toBeInTheDocument();
  });

  it("keeps both charts mounted even when an old Original URL is opened", () => {
    window.history.replaceState({}, "", "/?ui-preview=original");
    const { container } = charts();
    fireEvent.click(screen.getByRole("button", { name: "By school" }));
    expect(container.querySelectorAll('[data-native-chart-panel]')).toHaveLength(2);
    expect(container.querySelector('[data-native-chart-panel="school"]')).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Student analytics" })).toHaveAttribute("data-native-chart-motion", "true");
  });
});
