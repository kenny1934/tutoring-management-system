import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageTransition } from "./PageTransition";

describe("PageTransition", () => {
  it("keeps the page's styling and accessibility hooks on the animated element", () => {
    render(<PageTransition data-native-stack id="dashboard-content" aria-label="Dashboard content" className="dashboard-spacing">
      <p>Page content</p>
    </PageTransition>);
    const page = screen.getByLabelText("Dashboard content");
    expect(page).toHaveAttribute("data-native-stack", "true");
    expect(page).toHaveAttribute("id", "dashboard-content");
    expect(page).toHaveClass("dashboard-spacing");
    expect(page).toContainElement(screen.getByText("Page content"));
  });
});
