"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { PullToRefresh } from "./PullToRefresh";
import { BottomTabBar } from "./BottomTabBar";
import { MoreSheet } from "./MoreSheet";
import { useNavigation } from "./useNavigation";
import { Logo } from "@/components/brand/Logo";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { useBottomBarHidden } from "@/lib/app-chrome";
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
      {!isLoginPage && <Sidebar />}

      <div className="relative flex-1 flex flex-col overflow-hidden">
        {/* The phone's top bar: the logo, the bell and search. The pages
            themselves are in the bottom bar. Hidden on the sign-in page. */}
        {!isLoginPage && (
        <header className="flex md:hidden items-center justify-between h-14 pl-4 pr-1 border-b border-line bg-paper">
          {/* The header is too small for PRO to be read, so it shows the logo without it. */}
          <Logo variant="no-pro" className="h-8 w-auto" />
          <div className="flex items-center">
            <PhoneBell />
            <button
              onClick={openCommandPalette}
              className="flex h-11 w-11 items-center justify-center rounded-lg active:bg-foreground/10 transition-colors"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
        </header>
        )}

        {/* Main Content */}
        <PullToRefresh enabled={offersPullToRefresh(pathname)} />
        {/* overscroll-y-none stops the page bouncing past its top and bottom
            on a phone, which would fight the pull-to-refresh ring. */}
        <main id={MAIN_CONTENT_ID} className="flex-1 overflow-auto overscroll-y-none bg-background" tabIndex={-1}>
          {children}
        </main>
        {!isLoginPage && <PhoneNav />}
      </div>
    </div>
  );
}

// The bell, in the phone's top bar since the sidebar that holds it on a wider
// screen is hidden there. Like the sidebar's, it steps aside on the dashboard,
// which has a bell of its own.
function PhoneBell() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const { selectedLocation } = useLocation();
  const { currentTutorId, pendingPayments } = useNavigation();
  if (pathname === "/") return null;
  return (
    <NotificationBell
      pendingPayments={pendingPayments}
      location={selectedLocation}
      tutorId={currentTutorId}
      showOverduePayments={isAdmin}
    />
  );
}

// The bottom bar and the More sheet it opens. While the bar is up, toasts and
// floating buttons are told to sit above it, through --app-bottom-inset.
function PhoneNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const hidden = useBottomBarHidden();
  const pathname = usePathname();

  // Moving to another page closes the sheet, whichever way the move happened.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (hidden) return;
    document.documentElement.dataset.bottomBar = "";
    return () => {
      delete document.documentElement.dataset.bottomBar;
    };
  }, [hidden]);

  if (hidden) return null;
  return (
    <>
      <BottomTabBar moreOpen={moreOpen} onMore={() => setMoreOpen(true)} />
      <MoreSheet isOpen={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
