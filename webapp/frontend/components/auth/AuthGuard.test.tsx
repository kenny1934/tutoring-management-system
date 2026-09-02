import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthGuard } from "./AuthGuard";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => mockPathname,
}));

let mockPathname = "/";
let mockAuth = { isAuthenticated: false, isLoading: false };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockAuth }));

function renderAt(pathname: string, hostname: string) {
  mockPathname = pathname;
  Object.defineProperty(window, "location", {
    value: { hostname, href: `https://${hostname}${pathname}` },
    writable: true,
  });
  return render(
    <AuthGuard>
      <div>form</div>
    </AuthGuard>,
  );
}

describe("AuthGuard on parent-facing pages", () => {
  beforeEach(() => {
    push.mockClear();
    mockAuth = { isAuthenticated: false, isLoading: false };
  });
  afterEach(() => vi.clearAllMocks());

  // The regular subdomain served a spinner to every logged-out parent: the
  // guard did not know the hostname, bounced to /login, and the middleware
  // sent /login straight back to /apply.
  it.each([
    ["/apply", "regular.mathconceptsecondary.academy"],
    ["/status", "regular.mathconceptsecondary.academy"],
    ["/apply", "summer.mathconceptsecondary.academy"],
    ["/status", "summer.mathconceptsecondary.academy"],
  ])("renders %s on %s without a session", (pathname, hostname) => {
    renderAt(pathname, hostname);
    expect(screen.getByText("form")).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  // The internal paths are what the subdomains rewrite to, and what a direct
  // Cloud Run URL uses.
  it.each([["/regular/apply"], ["/regular/status"], ["/summer/apply"]])(
    "renders the internal path %s without a session",
    (pathname) => {
      renderAt(pathname, "csm.mathconceptsecondary.academy");
      expect(screen.getByText("form")).toBeDefined();
      expect(push).not.toHaveBeenCalled();
    },
  );

  it("still guards staff pages, including the regular admin views", () => {
    renderAt("/admin/regular/arrangement", "csm.mathconceptsecondary.academy");
    expect(screen.queryByText("form")).toBeNull();
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("lets a signed-in user through to a staff page", () => {
    mockAuth = { isAuthenticated: true, isLoading: false };
    renderAt("/admin/regular/arrangement", "csm.mathconceptsecondary.academy");
    expect(screen.getByText("form")).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });
});
