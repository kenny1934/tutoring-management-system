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

// Config with a group-gated early-bird tier (EB3P) and a date-free group tier
// (3P), mirroring the live summer pricing config.
const GROUP_CONFIG: SummerPricingConfig = {
  base_fee: 1600,
  discounts: [
    { code: "EB", name_zh: "早鳥", name_en: "Early Bird", amount: 200, conditions: { before_date: "2026-06-15" } },
    { code: "EB3P", name_zh: "三人同行早鳥", name_en: "Early Bird Group of 3+", amount: 500, conditions: { before_date: "2026-06-15", min_group_size: 3 } },
    { code: "3P", name_zh: "三人同行", name_en: "Group of 3+", amount: 300, conditions: { min_group_size: 3 } },
  ],
};

describe("TierStatusCallout — group-size gate", () => {
  it("does NOT flag EB3P as forfeited for a solo on-time applicant (group never reached 3)", () => {
    const { container } = render(
      <TierStatusCallout
        config={GROUP_CONFIG}
        currentCode="EB"
        currentAmount={200}
        submittedAt="2026-06-10T09:00:00"
        groupSize={1}
        today={TODAY}
      />,
    );
    // EB3P needs a 3-person group this applicant never had → nothing forfeited.
    expect(container.firstChild).toBeNull();
  });

  it("flags EB3P as forfeited for a group of 3 that completed on time but past the deadline", () => {
    render(
      <TierStatusCallout
        config={GROUP_CONFIG}
        currentCode="3P"
        currentAmount={300}
        submittedAt="2026-06-10T09:00:00"
        groupSize={3}
        today={TODAY}
      />,
    );
    expect(screen.getByText(/forfeited/i)).toBeInTheDocument();
  });

  it("uses the current tier's min_group_size as a proven lower bound when the count under-reports", () => {
    // Enrollment page passes groupSize=1 (only the single app is loaded), but the
    // locked tier is 3P — proof the real group is ≥3, so EB3P stays flagged.
    render(
      <TierStatusCallout
        config={GROUP_CONFIG}
        currentCode="3P"
        currentAmount={300}
        submittedAt="2026-06-10T09:00:00"
        groupSize={1}
        today={TODAY}
      />,
    );
    expect(screen.getByText(/forfeited/i)).toBeInTheDocument();
  });

  it("falls back to deadline-only detection when groupSize is omitted", () => {
    render(
      <TierStatusCallout
        config={GROUP_CONFIG}
        currentCode="EB"
        currentAmount={200}
        submittedAt="2026-06-10T09:00:00"
        today={TODAY}
      />,
    );
    expect(screen.getByText(/forfeited/i)).toBeInTheDocument();
  });
});
