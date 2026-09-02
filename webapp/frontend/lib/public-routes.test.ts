import { describe, it, expect } from "vitest";
import {
  PUBLIC_SUBDOMAIN_PREFIXES,
  isPublicPath,
  isPublicSubdomain,
} from "./public-routes";

describe("isPublicSubdomain", () => {
  it.each([...PUBLIC_SUBDOMAIN_PREFIXES])("accepts the %s subdomain", (prefix) => {
    expect(isPublicSubdomain(`${prefix}mathconceptsecondary.academy`)).toBe(true);
  });

  it("rejects the staff app and the direct Cloud Run host", () => {
    expect(isPublicSubdomain("csm.mathconceptsecondary.academy")).toBe(false);
    expect(isPublicSubdomain("tutoring-frontend-284725664511.asia-east2.run.app")).toBe(false);
  });

  it("rejects a lookalike that merely contains a public name", () => {
    expect(isPublicSubdomain("not-summer.mathconceptsecondary.academy")).toBe(false);
  });

  it("is false with no hostname, which is the server-rendering case", () => {
    // Nothing to read during SSR, so the path check has to carry it alone.
    expect(isPublicSubdomain("")).toBe(false);
  });
});

describe("isPublicPath", () => {
  it.each([
    "/summer",
    "/summer/apply",
    "/summer/status",
    "/regular",
    "/regular/apply",
    "/regular/status",
    "/apply",
    "/status",
  ])("accepts %s", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it("keeps the staff views behind the guard", () => {
    // The admin pages for both intakes live under /admin, which is what makes
    // the /summer and /regular prefixes safe to open up.
    expect(isPublicPath("/admin/regular/arrangement")).toBe(false);
    expect(isPublicPath("/admin/summer/arrangement")).toBe(false);
    expect(isPublicPath("/sessions")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
  });

  it("does not open zen mode, which renders bare but is staff-only", () => {
    expect(isPublicPath("/zen")).toBe(false);
    expect(isPublicPath("/zen/sessions")).toBe(false);
  });

  it("matches whole segments, not string prefixes", () => {
    // A bare startsWith would have made these public by accident.
    expect(isPublicPath("/regularise")).toBe(false);
    expect(isPublicPath("/summer-report")).toBe(false);
    expect(isPublicPath("/applyx")).toBe(false);
  });

  it("handles a null pathname", () => {
    expect(isPublicPath(null)).toBe(false);
    expect(isPublicPath(undefined)).toBe(false);
  });
});
