"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Home, Users, Calendar, BookOpen, X, Settings, ChevronDown, Inbox, Shield, Clock, LogOut, RefreshCcw, Database, CreditCard, Megaphone, MessageSquarePlus, FileText, Sun, ClipboardList, GraduationCap, CalendarCheck, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { SidebarLogo } from "@/components/brand/SidebarLogo";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useToast } from "@/contexts/ToastContext";
import { api } from "@/lib/api";
import { getInitials } from "@/lib/avatar-utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SurfacePicker } from "@/components/ui/SurfacePicker";
import { TONES } from "@/lib/tones";
import { RoleSwitcher } from "@/components/auth";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { WeeklyMiniCalendar } from "@/components/layout/WeeklyMiniCalendar";
import { FeedbackPanel } from "@/components/layout/FeedbackPanel";
import { useUnreadMessageCount, useRenewalCounts, usePendingExtensionCount, useUnseenUpdates, useFaviconBadge, useSummerSidebarBadge, useRegularSidebarBadge, useRegularIntakeOpen } from "@/lib/hooks";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Students", href: "/students", icon: Users },
  { name: "Sessions", href: "/sessions", icon: Calendar },
  { name: "Courseware", href: "/courseware", icon: BookOpen },
  { name: "Curriculum", href: "/curriculum", icon: Map },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Inbox", href: "/inbox", icon: Inbox },
];

// Admin navigation items - only visible to Admin and Super Admin
const adminNavigation = [
  { name: "Renewals", href: "/admin/renewals", icon: RefreshCcw },
  { name: "Overdue payments", href: "/overdue-payments", icon: CreditCard },
  { name: "Extensions", href: "/admin/extensions", icon: Clock },
  { name: "Waitlist", href: "/admin/waitlist", icon: ClipboardList },
  { name: "Tutors", href: "/admin/tutors", icon: GraduationCap },
  { name: "Summer course", href: "/admin/summer", icon: Sun },
  { name: "Regular intake", href: "/admin/regular", icon: CalendarCheck },
];

interface SidebarProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

/** How long the sidebar takes to open or close, in milliseconds. */
const SLIDE_MS = 350;

/**
 * Puts a collapsed item's name beside it, just past the sidebar's edge. The
 * name is fixed to the window, so it's placed from where the item and the
 * sidebar are on screen. It used to be placed as a share of the sidebar's
 * width, which only worked while the sidebar's frosted background happened
 * to make the sidebar the box fixed things are measured from.
 */
function placeTooltip(item: HTMLElement) {
  const sidebar = item.closest("[data-sidebar-panel]")?.getBoundingClientRect();
  if (!sidebar) return;
  const rect = item.getBoundingClientRect();
  item.style.setProperty("--tooltip-top", `${rect.top + rect.height / 2}px`);
  item.style.setProperty("--tooltip-left", `${sidebar.right}px`);
}

export function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, isAdmin, isSuperAdmin, isSupervisor, isGuest, canViewAdminPages, isReadOnly, effectiveRole, isImpersonating, impersonatedTutor, logout } = useAuth();
  const { selectedLocation, setSelectedLocation, locations, setLocations, mounted } = useLocation();
  const { viewMode, setViewMode } = useRole();
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Which way the sidebar is moving, for the SLIDE_MS it takes. Only a move
  // the person asked for animates, so a sidebar restored as collapsed when a
  // page loads starts out that way.
  const [moving, setMoving] = useState<"opening" | "closing" | null>(null);
  useEffect(() => {
    if (!moving) return;
    const done = setTimeout(() => setMoving(null), SLIDE_MS);
    return () => clearTimeout(done);
  }, [moving]);
  // Whether the person has opened or closed the sidebar yet. The logo only animates after that.
  const [toggled, setToggled] = useState(false);
  const toggleCollapsed = () => {
    setMoving(isCollapsed ? "opening" : "closing");
    setIsCollapsed(!isCollapsed);
    setToggled(true);
  };
  // The menu is laid out for the narrow rail only once the sidebar has
  // finished closing. Until then the full menu stays, and the sidebar's edge
  // covers it as it moves.
  const rail = isCollapsed && moving !== "closing";
  const [pendingPayments, setPendingPayments] = useState(0);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(true);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Get effective tutor ID (respects impersonation)
  const currentTutorId = (isImpersonating && effectiveRole === 'Tutor' && impersonatedTutor?.id)
    ? impersonatedTutor.id
    : user?.id;

  // Check if user can view admin pages (Admin, Super Admin, or Supervisor)
  const isAdminOrAbove = canViewAdminPages;

  // Fetch unread message count for Inbox badge (skip for Guest/Supervisor who can't access Inbox)
  const { data: unreadCount } = useUnreadMessageCount(isGuest || isSupervisor ? undefined : currentTutorId);

  // App-wide favicon badge with unread count (pathname triggers re-apply after navigation)
  useFaviconBadge(unreadCount?.count || 0, pathname);

  // Check for unseen app updates
  const hasUnseenUpdates = useUnseenUpdates();

  // Fetch admin badge counts (renewal, extension)
  const { data: renewalCounts } = useRenewalCounts(isAdminOrAbove, selectedLocation);
  const { data: extensionCount } = usePendingExtensionCount(isAdminOrAbove, selectedLocation);
  const { isOpen: summerIsOpen, actionableCount: summerActionable } = useSummerSidebarBadge(
    isAdminOrAbove,
    selectedLocation,
  );
  const { isOpen: regularIsOpen, actionableCount: regularActionable } = useRegularSidebarBadge(
    isAdminOrAbove,
    selectedLocation,
  );

  // Course Renewal is a seasonal surface: it only means anything while the
  // September intake is taking applications, so it appears for the window and
  // then goes away rather than sitting empty for ten months. The dates come
  // from the intake config, so moving the window in the config editor moves
  // this too.
  const intakeOpen = useRegularIntakeOpen(!isGuest);
  // It goes in above Inbox rather than at the end. For the weeks it is here it
  // is a job somebody has to finish, and the end of the list is where an item
  // goes to be missed.
  const mainNavigation = useMemo(() => {
    if (!intakeOpen) return navigation;
    const renewal = { name: "Course renewal", href: "/course-renewal", icon: CalendarCheck };
    const inboxAt = navigation.findIndex((item) => item.name === "Inbox");
    if (inboxAt === -1) return [...navigation, renewal];
    return [...navigation.slice(0, inboxAt), renewal, ...navigation.slice(inboxAt)];
  }, [intakeOpen]);

  // Per-item badge state for the admin nav. Renewals turns red when any
  // enrollment has expired; Overdue Payments is always red. Summer Course and
  // Regular Intake show an "Open" pill (or a dot when collapsed) during their
  // application window when there's nothing to triage.
  const adminBadgeFor = (name: string) => {
    const count =
      name === "Renewals" ? renewalCounts?.total
      : name === "Overdue payments" ? pendingPayments
      : name === "Extensions" ? extensionCount?.count
      : name === "Summer course" ? summerActionable
      : name === "Regular intake" ? regularActionable
      : 0;
    const color =
      name === "Overdue payments" ? TONES.danger.solid
      : name === "Renewals" && (renewalCounts?.expired ?? 0) > 0 ? TONES.danger.solid
      : TONES.warning.solid;
    const isIntakeOpen =
      (name === "Summer course" && summerIsOpen) ||
      (name === "Regular intake" && regularIsOpen);
    const showOpen = isIntakeOpen && (count ?? 0) <= 0;
    return { count, color, showOpen };
  };

  // App-wide new message notification toast
  const router = useRouter();
  const { showToast } = useToast();
  const prevUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (unreadCount?.count !== undefined && currentTutorId) {
      if (prevUnreadRef.current !== null && unreadCount.count > prevUnreadRef.current && pathname !== '/inbox') {
        const newCount = unreadCount.count - prevUnreadRef.current;
        showToast(
          `You have ${newCount} new message${newCount > 1 ? 's' : ''}`,
          "info",
          { label: "View inbox", onClick: () => router.push('/inbox') },
          { persistent: true }
        );
      }
      prevUnreadRef.current = unreadCount.count;
    }
  }, [unreadCount?.count, currentTutorId, showToast, router, pathname]);

  // App update toast — show once per version on first visit
  useEffect(() => {
    if (!mounted) return;
    const version = process.env.NEXT_PUBLIC_APP_VERSION;
    if (!version || version === 'dev') return;
    const lastSeen = localStorage.getItem('last-seen-version');
    const toastKey = `update-toast-shown-${version}`;
    if (lastSeen !== version && !localStorage.getItem(toastKey)) {
      localStorage.setItem(toastKey, '1');
      showToast(
        `New in ${version} — see what's changed`,
        "info",
        { label: "What's new", onClick: () => router.push('/whats-new') },
        { persistent: true }
      );
    }
  }, [mounted, showToast, router]);

  // Check if on dashboard page
  const isOnDashboard = pathname === "/";

  // Load collapsed state from localStorage
  useEffect(() => {
    if (!mounted) return;
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, [mounted]);

  // Save collapsed state to localStorage + set CSS variable for modal positioning.
  // The variable waits until the sidebar has stopped moving: writing it on the
  // page's root restyles every element on the page, which on a long page cost
  // a frame of about 40ms at the start of every move.
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('sidebar-collapsed', String(isCollapsed));
    if (moving) return;
    document.documentElement.style.setProperty('--sidebar-width', isCollapsed ? '72px' : '256px');
  }, [isCollapsed, mounted, moving]);

  // Fetch locations on mount (only on client-side)
  useEffect(() => {
    if (!mounted) return;

    async function fetchLocations() {
      try {
        const data = await api.stats.getLocations();
        // Filter out "Various" placeholder
        const filteredData = data.filter((loc: string) => loc !== "Various");
        const allLocations = ["All Locations", ...filteredData];
        setLocations(allLocations);
      } catch (error) {
        // Failed to fetch locations silently
      }
    }
    fetchLocations();
  }, [mounted, setLocations]);

  // Fetch stats for notification bell (when not on dashboard)
  useEffect(() => {
    if (!mounted) return;

    async function fetchStats() {
      try {
        const stats = await api.stats.getDashboard(selectedLocation);
        setPendingPayments(stats.pending_payment_enrollments);
      } catch (error) {
        // Failed to fetch stats silently
      }
    }
    fetchStats();
  }, [mounted, isOnDashboard, selectedLocation]);

  // Set user's default location on mount
  // - Super Admin: defaults to "All Locations"
  // - Supervisor: defaults to "All Locations"
  // - Admin/Tutor/Guest: defaults to their assigned location
  // Skip this when impersonating - location is set by RoleSwitcher
  useEffect(() => {
    if (!isImpersonating && mounted) {
      if ((isSuperAdmin || isSupervisor) && !isGuest) {
        // Super Admin and Supervisor default to All Locations
        setSelectedLocation("All Locations");
      } else if (user?.default_location) {
        // Admin, Tutor, and Guest default to their assigned location
        setSelectedLocation(user.default_location);
      }
    }
  }, [isSuperAdmin, isSupervisor, isGuest, isImpersonating, user?.default_location, mounted, setSelectedLocation]);

  // Check scroll position for gradient indicators
  const checkScrollPosition = () => {
    const nav = navRef.current;
    if (!nav) return;

    const { scrollTop, scrollHeight, clientHeight } = nav;
    setCanScrollUp(scrollTop > 0);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 1);
  };

  // Initialize and update scroll indicators
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    // Delay initial check to ensure content is rendered
    const timer = setTimeout(checkScrollPosition, 100);

    nav.addEventListener('scroll', checkScrollPosition);

    // Re-check on resize (content might change)
    const resizeObserver = new ResizeObserver(checkScrollPosition);
    resizeObserver.observe(nav);

    return () => {
      clearTimeout(timer);
      nav.removeEventListener('scroll', checkScrollPosition);
      resizeObserver.disconnect();
    };
  }, [mounted, rail, adminExpanded]);

  // Close mobile menu on navigation
  const handleNavClick = () => {
    if (onMobileClose) {
      onMobileClose();
    }
  };

  // Sidebar content - shared between desktop and mobile
  const sidebarContent = (isMobile: boolean, desktopNavRef?: React.RefObject<HTMLElement | null>) => (
    <>
      {/* Logo Header */}
      <div className="flex-shrink-0 flex min-h-16 items-center justify-between px-3 py-2 border-b border-line">
        {isMobile ? (
          // Mobile: Logo + Close button
          <>
            <Logo className="h-10 w-auto" />
            <button
              onClick={onMobileClose}
              className="p-2 rounded-lg hover:bg-foreground/10 transition-colors"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </>
        ) : (
          // Desktop: Clickable toggle
          <button
            onClick={toggleCollapsed}
            className="flex w-full items-center rounded-md hover:bg-foreground/5 active:bg-foreground/10 transition-colors cursor-pointer"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {/* Collapsed, the sidebar is too narrow for the whole logo, so it
                shows the C and its arrow, and opening draws the rest of the
                logo out of the C. */}
            <span className="ml-2">
              <SidebarLogo open={!isCollapsed} animate={toggled} />
            </span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 relative min-h-0">
        <div
          ref={desktopNavRef as React.RefObject<HTMLDivElement> | undefined}
          className="h-full overflow-y-auto scrollbar-hide"
        >
        <nav className="space-y-1 px-3 py-3">
        {mainNavigation
          // Filter out Inbox for Guest (read-only role; Supervisors get broadcast-only view)
          .filter((item) => !(item.name === "Inbox" && isGuest))
          .map((item) => {
          const isActive = pathname === item.href;
          const showExpanded = isMobile || !rail;
          return (
            <div
              key={item.name}
              className={cn("relative", !showExpanded && "tooltip-wrapper")}
              data-tooltip={item.name}
              onMouseEnter={(e) => {
                if (!showExpanded) placeTooltip(e.currentTarget);
              }}
            >
              <Link
                href={item.href}
                prefetch={true}
                onClick={handleNavClick}
                style={{
                  transition: `background-color ${isActive ? '350ms' : '200ms'} var(--ease-out), color ${isActive ? '350ms' : '200ms'} var(--ease-out)`
                }}
                className={cn(
                  // The icon sits in the same place whether the sidebar is open
                  // or closed, so it holds still while the sidebar moves.
                  "group relative flex items-center gap-3 whitespace-nowrap rounded-2xl px-[14px] py-2 text-sm font-medium",
                  isActive
                    ? "bg-primary/10 text-accent-ink"
                    : "text-foreground/70 hover:bg-foreground/8"
                )}
              >
                {/* Icon */}
                <div className="relative">
                  <item.icon className="h-5 w-5" />

                  {/* Beta badge for collapsed Documents */}
                  {!showExpanded && item.name === "Documents" && (
                    <span className="absolute -top-2 -right-3 text-[11px] font-semibold px-1 py-px rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center justify-center whitespace-nowrap">
                      Beta
                    </span>
                  )}

                  {/* Course Renewal only appears at all while the intake is
                      taking applications, and the dot is there to catch the eye
                      on the way past. It sits on the icon rather than beside
                      the label because "Course renewal" needs 115px of the
                      148px a row gives a label, which is not enough left over
                      for the "Open" pill the admin nav uses: the label wrapped
                      onto a second line. */}
                  {item.name === "Course renewal" && (
                    <span
                      className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500"
                      title="The September intake is taking applications"
                    />
                  )}
                </div>

                {/* Badge for collapsed Inbox */}
                {!showExpanded && item.name === "Inbox" && unreadCount && unreadCount.count > 0 && (
                  <span className={cn("absolute -top-1 -right-1 text-[8px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5", TONES.danger.solid)}>
                    {unreadCount.count > 99 ? "99+" : unreadCount.count}
                  </span>
                )}

                {/* Label */}
                {showExpanded && (
                  <>
                    <span className="flex-1">{item.name}</span>
                    {/* Beta badge for Documents */}
                    {item.name === "Documents" && (
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Beta
                      </span>
                    )}
                    {/* Unread badge for Inbox */}
                    {item.name === "Inbox" && unreadCount && unreadCount.count > 0 && (
                      <span className={cn("text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1", TONES.danger.solid)}>
                        {unreadCount.count > 99 ? "99+" : unreadCount.count}
                      </span>
                    )}
                  </>
                )}
              </Link>
            </div>
          );
        })}

        {/* Admin Section - Only visible to Admin/Super Admin */}
        {isAdminOrAbove && (() => {
          const showExpanded = isMobile || !rail;
          return (
            <div className="mt-2 pt-2 border-t border-line">
              {/* Admin Header - Clickable to expand/collapse */}
              <button
                onClick={() => setAdminExpanded(!adminExpanded)}
                className={cn(
                  "w-full flex items-center gap-3 whitespace-nowrap rounded-2xl px-[14px] py-2 text-sm font-medium transition-colors",
                  "text-foreground/70 hover:bg-foreground/8"
                )}
              >
                <Shield className="h-5 w-5" />
                {showExpanded && (
                  <>
                    <span className="flex-1 text-left">Admin</span>
                    <ChevronDown className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      adminExpanded && "rotate-180"
                    )} />
                  </>
                )}
              </button>

              {/* Admin Submenu Items */}
              {showExpanded && (
              <div className={cn(
                "grid transition-[grid-template-rows] duration-200",
                adminExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}>
                <div className="overflow-hidden pl-3">
                <div className="mt-1 space-y-1">
                  {adminNavigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    const { count: badgeCount, color: badgeColor, showOpen } = adminBadgeFor(item.name);
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={handleNavClick}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 text-sm rounded-xl transition-colors",
                          isActive
                            ? "bg-primary/10 text-accent-ink font-medium"
                            : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.name}</span>
                        {showOpen && (
                          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            Open
                          </span>
                        )}
                        {(badgeCount ?? 0) > 0 && (
                          <span className={cn("text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1", badgeColor)}>
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                  {/* Debug link - Super Admin only, hidden when impersonating */}
                  {isSuperAdmin && !isImpersonating && (
                    <Link
                      href="/admin/debug"
                      onClick={handleNavClick}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors",
                        pathname.startsWith("/admin/debug")
                          ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium"
                          : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
                      )}
                    >
                      <Database className="h-4 w-4" />
                      <span>Debug</span>
                    </Link>
                  )}
                </div>
                </div>
              </div>
              )}

              {/* Collapsed state flyout */}
              {!showExpanded && (
              <div className={cn(
                "grid transition-[grid-template-rows] duration-200",
                adminExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}>
                <div className="overflow-hidden px-1">
                <div className="mt-1 pt-0.5 space-y-1">
                  {adminNavigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    const { count: badgeCount, color: badgeColor, showOpen } = adminBadgeFor(item.name);
                    return (
                      <div
                        key={item.name}
                        className="tooltip-wrapper relative"
                        data-tooltip={item.name}
                        onMouseEnter={(e) => placeTooltip(e.currentTarget)}
                      >
                        <Link
                          href={item.href}
                          onClick={handleNavClick}
                          className={cn(
                            "flex items-center justify-center p-2.5 rounded-xl transition-colors",
                            isActive
                              ? "bg-primary/10 text-accent-ink"
                              : "text-foreground/60 hover:bg-foreground/5"
                          )}
                        >
                          <item.icon className="h-5 w-5" />
                        </Link>
                        {(badgeCount ?? 0) > 0 && (
                          <span className={cn("absolute -top-1 -right-1 text-[8px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5", badgeColor)}>
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        )}
                        {showOpen && (
                          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" aria-label="Applications open" />
                        )}
                      </div>
                    );
                  })}
                  {/* Debug link - Super Admin only, hidden when impersonating */}
                  {isSuperAdmin && !isImpersonating && (
                    <div
                      className="tooltip-wrapper"
                      data-tooltip="Debug"
                      onMouseEnter={(e) => placeTooltip(e.currentTarget)}
                    >
                      <Link
                        href="/admin/debug"
                        onClick={handleNavClick}
                        className={cn(
                          "flex items-center justify-center p-2.5 rounded-xl transition-colors",
                          pathname.startsWith("/admin/debug")
                            ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                            : "text-foreground/60 hover:bg-foreground/5"
                        )}
                      >
                        <Database className="h-5 w-5" />
                      </Link>
                    </div>
                  )}
                </div>
                </div>
              </div>
              )}
            </div>
          );
        })()}

        {/* Notification Bell - only when NOT on dashboard */}
        {!isOnDashboard && (
          <div className={cn(
            "pt-2 mt-2 border-t border-line",
            (isMobile || !rail) ? "px-4" : "flex justify-center px-3"
          )}>
            <div className={cn(
              "flex items-center rounded-2xl transition-colors",
              (isMobile || !rail)
                ? "gap-3 py-2 text-sm font-medium text-foreground/70"
                : "justify-center p-1"
            )}>
              <NotificationBell pendingPayments={pendingPayments} location={selectedLocation} tutorId={currentTutorId} showOverduePayments={isAdmin} />
              {(isMobile || !rail) && (
                <span>Notifications</span>
              )}
            </div>
          </div>
        )}
        </nav>
        {/* The mini calendar and the Center / My view switch scroll with the
            nav. Pinned to the bottom they took about 270px, which pushed the
            last admin links out of sight on a 900px-tall screen. */}
        {(isMobile || !rail) && (
          <div className="border-t border-line p-3">
            <WeeklyMiniCalendar />
          </div>
        )}
        {(isMobile || !rail) && (
          <div className="border-t border-line px-3 py-2">
            <div role="group" aria-label="Whose sessions to show" className="flex gap-0.5 rounded-md border border-line bg-tint p-0.5">
              {([["center-view", "Center"], ["my-view", "My view"]] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  aria-pressed={viewMode === mode}
                  className={cn(
                    "flex-1 h-[26px] px-2 text-xs font-medium rounded transition-colors",
                    viewMode === mode
                      ? "bg-field-fill text-gray-900 ring-1 ring-line-strong dark:text-gray-100"
                      : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  )}
                  suppressHydrationWarning
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        </div>
        {/* Scroll indicators — outside the scroll area so they stay pinned */}
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-6 z-10 pointer-events-none transition-opacity duration-200",
            "bg-gradient-to-b from-paper to-transparent",
            canScrollUp ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 h-6 z-10 pointer-events-none transition-opacity duration-200",
            "bg-gradient-to-t from-paper to-transparent",
            canScrollDown ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

      {/* User info with settings button */}
      <div className="flex-shrink-0 border-t border-line p-2">
        {/* Get user initials */}
        {(() => {
          // When impersonating a specific tutor, show their name
          const displayName = impersonatedTutor?.name || user?.name || "Guest";
          const initials = getInitials(displayName);
          const displayRole = effectiveRole || "Guest";
          const rawPicture = isImpersonating && impersonatedTutor?.profile_picture
            ? impersonatedTutor.profile_picture
            : user?.picture;
          const displayPicture = rawPicture?.startsWith("http") ? rawPicture : undefined;

          return !isMobile && rail ? (
            /* Collapsed state: Avatar only */
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(true)}
                className={cn(
                  "w-full flex items-center justify-center rounded-md p-2 transition-colors hover:bg-tint",
                  // Impersonating keeps an amber ring, because it has to be
                  // obvious whose account is showing.
                  isImpersonating && "ring-1 ring-amber-400 dark:ring-amber-600"
                )}
                title="User settings"
              >
                {displayPicture ? (
                  <Image
                    src={displayPicture}
                    alt={displayName}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-sm font-bold text-primary-foreground">{initials}</span>
                  </div>
                )}
              </button>
              {hasUnseenUpdates && (
                <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-blue-500 border-2 border-paper" />
              )}
            </div>
          ) : (
            /* Expanded state: Avatar with name */
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(true)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-tint",
                  isImpersonating && "ring-1 ring-amber-400 dark:ring-amber-600"
                )}
              >
                <div className="relative flex-shrink-0">
                  {displayPicture ? (
                    <Image
                      src={displayPicture}
                      alt={displayName}
                      width={44}
                      height={44}
                      className="h-11 w-11 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center">
                      <span className="text-base font-bold text-primary-foreground">{initials}</span>
                    </div>
                  )}
                  {hasUnseenUpdates && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-blue-500 border-2 border-paper" />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                  <p className="text-xs font-medium text-foreground/60">{displayRole}</p>
                </div>
                <Settings className="h-4 w-4 text-foreground/50" />
              </button>
            </div>
          );
        })()}
      </div>

      {/* User Settings Modal */}
      {isUserMenuOpen && mounted && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[9998] animate-in fade-in duration-200"
            onClick={() => setIsUserMenuOpen(false)}
          />
          {/* Modal */}
          <div
            className={cn(
              "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
              "w-[calc(100vw-2rem)] max-w-[400px] p-5 rounded-2xl shadow-2xl z-[9999]",
              "bg-[rgba(254,249,243,0.98)] dark:bg-[rgba(45,38,24,0.98)]",
              "border border-white/20 dark:border-white/10",
              "animate-in zoom-in-95 fade-in duration-200",
              isImpersonating && "mt-3" // Shift down when impersonation banner is visible
            )}
          >
            {/* Close button */}
            <button
              onClick={() => setIsUserMenuOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-foreground/10 transition-colors"
              aria-label="Close settings"
            >
              <X className="h-4 w-4 text-foreground/50" />
            </button>

            {/* User info header */}
            <div className="flex items-center gap-3 pb-4 mb-4 border-b border-line pr-8">
              {user?.picture ? (
                <Image
                  src={user.picture}
                  alt={user.name || "User"}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover shadow-sm flex-shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shadow-sm flex-shrink-0">
                  <span className="text-lg font-bold text-primary-foreground">
                    {user?.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?"}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-foreground">{user?.name || "Guest"}</p>
                <p className="text-sm text-foreground/60">{effectiveRole || "Guest"}</p>
              </div>
              {/* Role Switcher for Super Admins */}
              <RoleSwitcher />
            </div>

            {/* Theme Toggle */}
            <div className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground/80">Theme</span>
                <ThemeToggle compact />
              </div>
            </div>

            {/* Page background */}
            <div className="py-3">
              <span className="text-sm font-medium text-foreground/80 mb-2 block">Background</span>
              <SurfacePicker />
            </div>

            {/* Location Selector - Admin only */}
            {isAdminOrAbove && (
              <div className="py-3">
                <label className="text-sm font-medium text-foreground/80 mb-2 block">Location</label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full px-3 pr-8 py-2 text-sm rounded-lg border border-field bg-wash text-foreground shadow-[inset_0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)] appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.75rem_center] focus:outline-none focus:ring-2 focus:ring-primary/30"
                  suppressHydrationWarning
                >
                  {locations.map((location) => (
                    <option key={location} value={location} className="bg-wash text-foreground">{location}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Divider */}
            <div className="my-3 border-t border-line" />

            {/* Settings Link */}
            <Link
              href="/settings"
              onClick={() => {
                setIsUserMenuOpen(false);
                if (onMobileClose) onMobileClose();
              }}
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-foreground/10 transition-colors rounded-lg -mx-1"
            >
              <Settings className="h-4 w-4 text-foreground/60" />
              Settings
            </Link>

            {/* What's New Link */}
            <Link
              href="/whats-new"
              onClick={() => {
                setIsUserMenuOpen(false);
                if (onMobileClose) onMobileClose();
              }}
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-foreground/10 transition-colors rounded-lg -mx-1"
            >
              <Megaphone className="h-4 w-4 text-foreground/60" />
              <span className="flex-1">What&apos;s New</span>
              {hasUnseenUpdates && (
                <span className="h-2 w-2 rounded-full bg-blue-500" />
              )}
            </Link>

            {/* Send Feedback Link */}
            <button
              onClick={() => {
                setIsUserMenuOpen(false);
                if (onMobileClose) onMobileClose();
                window.dispatchEvent(new CustomEvent("open-feedback"));
              }}
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-foreground/10 transition-colors rounded-lg -mx-1 w-full"
            >
              <MessageSquarePlus className="h-4 w-4 text-foreground/60" />
              Send Feedback
            </button>

            {/* Logout Button */}
            {user && (
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  logout();
                }}
                className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors rounded-lg -mx-1 w-full mt-1"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            )}

            {/* Version */}
            {process.env.NEXT_PUBLIC_APP_VERSION && process.env.NEXT_PUBLIC_APP_VERSION !== 'dev' && (
              <p className="text-[11px] text-foreground/30 text-center mt-3 pt-2 border-t border-white/5">
                {process.env.NEXT_PUBLIC_APP_VERSION}
              </p>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );

  return (
    <>
      {/* Desktop Sidebar - hidden on mobile. The page beside it widens and
          narrows with it. Inside, the menu is laid out once at its full or its
          rail width and the sidebar's edge uncovers it, so the menu itself
          isn't laid out again on every frame. */}
      <div
        data-sidebar-panel
        className={cn(
          "hidden md:flex h-screen shrink-0 overflow-hidden border-r border-line bg-paper z-50",
          isCollapsed ? "w-[72px]" : "w-64"
        )}
        style={{
          transition: moving ? `width ${SLIDE_MS}ms var(--ease-out)` : undefined,
        }}
      >
        <div className={cn("flex h-full shrink-0 flex-col", rail ? "w-[71px]" : "w-[255px]")}>
          {sidebarContent(false, navRef)}
        </div>
      </div>

      {/* Mobile Drawer - hidden on desktop */}
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300",
          isMobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onMobileClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        data-sidebar-panel
        className={cn(
          "fixed inset-y-0 left-0 w-72 flex flex-col border-r border-line bg-paper z-50 md:hidden",
          "transition-transform duration-300 ease-out",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent(true)}
      </div>

      {/* Feedback Panel (manages own open/close state) */}
      <FeedbackPanel />
    </>
  );
}
