import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TierStatusCallout } from "./TierStatusCallout";
import type { SummerPricingConfig } from "@/types";

const CONFIG: SummerPricingConfig = {
  base_fee: 1600,
  discounts: [
    {
      code: "EB",
      name_zh: "早鳥",
      name_en: "Early Bird",
      amount: 150,
      conditions: { before_date: "2026-06-15" },
    },
  ],
};

// Today is past the EB deadline in every case below.
const TODAY = "2026-06-20";

describe("TierStatusCallout — forfeited banner", () => {
  it("shows forfeited when the applicant applied in time but lost the tier", () => {
    render(
      <TierStatusCallout
        config={CONFIG}
        currentCode="NONE"
        currentAmount={0}
        submittedAt="2026-06-10T09:00:00"
        today={TODAY}
      />,
    );
    expect(screen.getByText(/forfeited/i)).toBeInTheDocument();
  });

  it("does NOT show forfeited when the applicant applied after the deadline", () => {
    const { container } = render(
      <TierStatusCallout
        config={CONFIG}
        currentCode="NONE"
        currentAmount={0}
        submittedAt="2026-06-18T09:00:00"
        today={TODAY}
      />,
    );
    // The tier was never attainable → callout renders nothing.
    expect(container.firstChild).toBeNull();
  });

  it("treats the deadline day as still in time (inclusive)", () => {
    render(
      <TierStatusCallout
        config={CONFIG}
        currentCode="NONE"
        currentAmount={0}
        submittedAt="2026-06-15T23:00:00"
        today={TODAY}
      />,
    );
    expect(screen.getByText(/forfeited/i)).toBeInTheDocument();
  });

  it("falls back to deadline-only detection when no submission date is given", () => {
    render(
      <TierStatusCallout
        config={CONFIG}
        currentCode="NONE"
        currentAmount={0}
        today={TODAY}
      />,
    );
    expect(screen.getByText(/forfeited/i)).toBeInTheDocument();
  });

  it("shows the override banner instead of forfeited when a tier is pinned", () => {
    render(
      <TierStatusCallout
        config={CONFIG}
        currentCode="NONE"
        currentAmount={0}
        overrideCode="EB"
        submittedAt="2026-06-18T09:00:00"
        today={TODAY}
      />,
    );
    expect(screen.getByText(/Override/i)).toBeInTheDocument();
    expect(screen.queryByText(/forfeited/i)).not.toBeInTheDocument();
  });
});
