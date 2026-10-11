"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { PullToRefresh } from "./PullToRefresh";
import { Logo } from "@/components/brand/Logo";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { MAIN_CONTENT_ID } from "@/lib/scroll";
import { isPublicPath, isPublicSubdomain } from "@/lib/public-routes";
import { applyShape } from "@/lib/shape";

interface LayoutShellProps {
  children: React.ReactNode;
}

// The pages that offer pull-to-refresh: the lists a tutor checks through the
// day, and a student's page. A lesson's page is left out, because lesson mode
// opens inside it, and a pull down on the board is someone drawing.
function offersPullToRefresh(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname === "/" ||
    pathname === "/sessions" ||
    pathname === "/students" ||
    /^\/students\/\d+$/.test(pathname)
  );
}

export function LayoutShell({ children }: LayoutShellProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { open: openCommandPalette } = useCommandPalette();
  const isPublic = isPublicSubdomain() || isPublicPath(pathname);

  // The public pages keep their old rounder shape. The boot script sets it
  // before the first paint, and this keeps it right when someone moves between
  // public and staff pages without a full load. See lib/shape.ts.
  useEffect(() => {
    applyShape(isPublic);
  }, [isPublic]);

  // Render without any shell: the parent-facing pages, plus zen mode. Zen is
  // staff-only, so it is asked about here rather than added to the public list.
  if (isPublic || pathname?.startsWith("/zen")) {
    return <>{children}</>;
  }

  // The sign-in board's preview stands in for the login page, so it goes without the app frame too.
  const isLoginPage = pathname === "/login" || pathname === "/dev/login-board";

  return (
    // h-dvh (not h-screen): static 100vh is taller than the visible area on
    // phones while the browser URL bar shows, hiding the app's bottom edge.
    // The side padding keeps the app clear of a notch when a phone is turned
    // sideways. It is 0 everywhere else.
    <div className="flex h-dvh overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {!isLoginPage && (
        <Sidebar
          isMobileOpen={isMobileMenuOpen}
          onMobileClose={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div className="relative flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header with Hamburger - only visible on mobile, hidden on login */}
        {!isLoginPage && (
        <header className="flex md:hidden items-center justify-between h-14 px-4 border-b border-line bg-paper">
          {/* Left: Hamburger + Logo */}
          <div className="flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-foreground/10 transition-colors"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            {/* The header is too small for PRO to be read, so it shows the logo without it. */}
            <Logo variant="no-pro" className="ml-2 h-8 w-auto" />
          </div>

          {/* Right: Search button */}
          <button
            onClick={openCommandPalette}
            className="p-2 -mr-2 rounded-lg hover:bg-foreground/10 transition-colors"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>
        </header>
        )}

        {/* Main Content */}
        <PullToRefresh enabled={offersPullToRefresh(pathname)} />
        {/* overscroll-y-none stops the page bouncing past its top and bottom
            on a phone, which would fight the pull-to-refresh ring. */}
        <main id={MAIN_CONTENT_ID} className="flex-1 overflow-auto overscroll-y-none bg-background" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
