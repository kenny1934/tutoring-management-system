"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Home, Users, Calendar, BookOpen, X, Settings, ChevronDown, Inbox, Shield, Clock, LogOut, RefreshCcw, Database, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useToast } from "@/contexts/ToastContext";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { RoleSwitcher } from "@/components/auth";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { WeeklyMiniCalendar } from "@/components/layout/WeeklyMiniCalendar";
import { useUnreadMessageCount, useRenewalCounts, usePendingExtensionCount } from "@/lib/hooks";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home, color: "bg-blue-500" },
  { name: "Students", href: "/students", icon: Users, color: "bg-green-500" },
  { name: "Sessions", href: "/sessions", icon: Calendar, color: "bg-red-500" },
  { name: "Courseware", href: "/courseware", icon: BookOpen, color: "bg-orange-500" },
  { name: "Inbox", href: "/inbox", icon: Inbox, color: "bg-purple-500" },
];

// Admin navigation items - only visible to Admin and Super Admin
const adminNavigation = [
  { name: "Renewals", href: "/admin/renewals", icon: RefreshCcw },
  { name: "Overdue Payments", href: "/overdue-payments", icon: CreditCard },
  { name: "Extensions", href: "/admin/extensions", icon: Clock },
  // Future admin items:
  // { name: "Audit Log", href: "/admin/audit", icon: FileText },
  // { name: "User Management", href: "/admin/users", icon: UserCog },
];

interface SidebarProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, isAdmin, isSuperAdmin, isSupervisor, canViewAdminPages, isReadOnly, effectiveRole, isImpersonating, impersonatedTutor, logout } = useAuth();
  const { selectedLocation, setSelectedLocation, locations, setLocations, mounted } = useLocation();
  const { viewMode, setViewMode } = useRole();
  const [isCollapsed, setIsCollapsed] = useState(false);
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

  // Fetch unread message count for Inbox badge
  const { data: unreadCount } = useUnreadMessageCount(currentTutorId);

  // Fetch admin badge counts (renewal, extension)
  const { data: renewalCounts } = useRenewalCounts(isAdminOrAbove, selectedLocation);
  const { data: extensionCount } = usePendingExtensionCount(isAdminOrAbove, selectedLocation);

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
          { label: "View Inbox", onClick: () => router.push('/inbox') },
          { persistent: true }
        );
      }
      prevUnreadRef.current = unreadCount.count;
    }
  }, [unreadCount?.count, currentTutorId, showToast, router, pathname]);

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

  // Save collapsed state to localStorage + set CSS variable for modal positioning
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('sidebar-collapsed', String(isCollapsed));
    document.documentElement.style.setProperty('--sidebar-width', isCollapsed ? '72px' : '256px');
  }, [isCollapsed, mounted]);

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
  // - Admin/Tutor: defaults to their assigned location
  // Skip this when impersonating - location is set by RoleSwitcher
  useEffect(() => {
    if (!isImpersonating && mounted) {
      if (isSuperAdmin || isSupervisor) {
        // Super Admin and Supervisor default to All Locations
        setSelectedLocation("All Locations");
      } else if (user?.default_location) {
        // Admin and Tutor default to their assigned location
        setSelectedLocation(user.default_location);
      }
    }
  }, [isSuperAdmin, isSupervisor, isImpersonating, user?.default_location, mounted, setSelectedLocation]);

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
  }, [mounted, isCollapsed, adminExpanded]);

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
      <div className="flex-shrink-0 flex h-16 items-center justify-between px-3 border-b border-white/10 dark:border-white/5">
        {isMobile ? (
          // Mobile: Logo + Close button
          <>
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="CSM Pro" width={36} height={36} className="h-9 w-auto" priority />
              <div>
                <span className="font-bold text-xl block">CSM Pro</span>
                <span className="text-[9px] text-foreground/60 leading-tight block">Class Session Manager for<br />Productive Resources Orchestration</span>
              </div>
            </div>
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
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center justify-center w-full hover:bg-foreground/5 active:bg-foreground/10 transition-colors cursor-pointer group"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <div className="flex items-center gap-3 transition-all duration-350">
              <Image
                src="/logo.png"
                alt="CSM Pro"
                width={36}
                height={36}
                priority
                className={cn(
                  "transition-all duration-350 group-hover:scale-105",
                  isCollapsed ? "h-8 w-auto" : "h-9 w-auto"
                )}
              />
              {!isCollapsed && (
                <div className="text-left">
                  <span className="font-bold text-xl group-hover:text-primary transition-colors block">CSM Pro</span>
                  <span className="text-[9px] text-foreground/60 leading-tight block">Class Session Manager for<br />Productive Resource Orchestration</span>
                </div>
              )}
            </div>
          </button>
        )}
      </div>

      {/* Navigation */}
      <div
        ref={desktopNavRef as React.RefObject<HTMLDivElement> | undefined}
        className="flex-1 relative min-h-0 overflow-y-auto scrollbar-hide"
      >
        {/* Top scroll indicator */}
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-6 z-10 pointer-events-none transition-opacity duration-200",
            "bg-gradient-to-b from-white/80 to-transparent dark:from-black/60 dark:to-transparent",
            canScrollUp ? "opacity-100" : "opacity-0"
          )}
        />
        <nav className="space-y-2 px-3 py-4">
        {navigation
          // Filter out Inbox for Supervisor (read-only role)
          .filter((item) => !(item.name === "Inbox" && isSupervisor))
          .map((item) => {
          const isActive = pathname === item.href;
          const showExpanded = isMobile || !isCollapsed;
          return (
            <div
              key={item.name}
              className={cn("relative", !showExpanded && "tooltip-wrapper")}
              data-tooltip={item.name}
              onMouseEnter={(e) => {
                if (!showExpanded) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const sidebarRect = e.currentTarget.closest('.backdrop-blur-md')?.getBoundingClientRect();
                  if (sidebarRect) {
                    const top = rect.top - sidebarRect.top + rect.height / 2;
                    e.currentTarget.style.setProperty('--tooltip-top', `${top}px`);
                  }
                }
              }}
            >
              <Link
                href={item.href}
                prefetch={true}
                onClick={handleNavClick}
                style={{
                  transition: `all ${isActive ? '350ms' : '200ms'} cubic-bezier(0.38, 1.21, 0.22, 1.00)`
                }}
                className={cn(
                  "group relative flex items-center rounded-2xl text-sm font-medium",
                  showExpanded ? "gap-3 px-4 py-3" : "justify-center p-3",
                  isActive
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-foreground/70 hover:bg-foreground/8 hover:scale-[1.02] active:scale-[0.98]"
                )}
              >
                {/* Color indicator with glow */}
                {showExpanded && (
                  <div className={cn(
                    "w-2 h-2 rounded-full transition-all duration-300",
                    item.color,
                    isActive
                      ? "scale-100 opacity-100 shadow-[0_0_8px_currentColor]"
                      : "scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-60"
                  )} />
                )}

                {/* Icon */}
                <item.icon
                  className={cn(
                    "transition-transform duration-300",
                    showExpanded ? "h-5 w-5" : "h-6 w-6",
                    isActive ? "scale-110" : "group-hover:scale-110"
                  )}
                  style={{
                    transition: 'transform 200ms cubic-bezier(0.30, 1.25, 0.40, 1.00)'
                  }}
                />

                {/* Badge for collapsed Inbox */}
                {!showExpanded && item.name === "Inbox" && unreadCount && unreadCount.count > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
                    {unreadCount.count > 99 ? "99+" : unreadCount.count}
                  </span>
                )}

                {/* Label */}
                {showExpanded && (
                  <>
                    <span className="flex-1">{item.name}</span>
                    {/* Unread badge for Inbox */}
                    {item.name === "Inbox" && unreadCount && unreadCount.count > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {unreadCount.count > 99 ? "99+" : unreadCount.count}
                      </span>
                    )}
                    {isActive && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-sm" />
                    )}
                  </>
                )}
              </Link>
            </div>
          );
        })}

        {/* Admin Section - Only visible to Admin/Super Admin */}
        {isAdminOrAbove && (() => {
          const showExpanded = isMobile || !isCollapsed;
          return (
            <div className="mt-2 pt-2 border-t border-white/10 dark:border-white/5">
              {/* Admin Header - Clickable to expand/collapse */}
              <button
                onClick={() => setAdminExpanded(!adminExpanded)}
                className={cn(
                  "w-full flex items-center rounded-2xl text-sm font-medium transition-colors",
                  showExpanded ? "gap-3 px-4 py-3" : "justify-center p-3",
                  "text-foreground/70 hover:bg-foreground/8"
                )}
              >
                <Shield className="h-5 w-5 text-amber-600 dark:text-amber-500" />
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
              {adminExpanded && showExpanded && (
                <div className="mt-1 ml-3 space-y-1">
                  {adminNavigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    // Get badge count for each admin item
                    const badgeCount = item.name === "Renewals"
                      ? renewalCounts?.total
                      : item.name === "Overdue Payments"
                        ? pendingPayments
                        : item.name === "Extensions"
                          ? extensionCount?.count
                          : 0;
                    // Color: red for danger (Overdue Payments, or Renewals with expired), orange for warning
                    const badgeColor = item.name === "Overdue Payments"
                      ? "bg-red-500"
                      : item.name === "Renewals" && (renewalCounts?.expired ?? 0) > 0
                        ? "bg-red-500"
                        : "bg-orange-500";
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={handleNavClick}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.name}</span>
                        {badgeCount > 0 && (
                          <span className={cn("text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1", badgeColor)}>
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
              )}

              {/* Collapsed state flyout */}
              {!showExpanded && adminExpanded && (
                <div className="mt-1 space-y-1">
                  {adminNavigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    // Get badge count for each admin item
                    const badgeCount = item.name === "Renewals"
                      ? renewalCounts?.total
                      : item.name === "Overdue Payments"
                        ? pendingPayments
                        : item.name === "Extensions"
                          ? extensionCount?.count
                          : 0;
                    // Color: red for danger (Overdue Payments, or Renewals with expired), orange for warning
                    const badgeColor = item.name === "Overdue Payments"
                      ? "bg-red-500"
                      : item.name === "Renewals" && (renewalCounts?.expired ?? 0) > 0
                        ? "bg-red-500"
                        : "bg-orange-500";
                    return (
                      <div
                        key={item.name}
                        className="tooltip-wrapper relative"
                        data-tooltip={item.name}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const sidebarRect = e.currentTarget.closest('.backdrop-blur-md')?.getBoundingClientRect();
                          if (sidebarRect) {
                            const top = rect.top - sidebarRect.top + rect.height / 2;
                            e.currentTarget.style.setProperty('--tooltip-top', `${top}px`);
                          }
                        }}
                      >
                        <Link
                          href={item.href}
                          onClick={handleNavClick}
                          className={cn(
                            "flex items-center justify-center p-2.5 rounded-xl transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-foreground/60 hover:bg-foreground/5"
                          )}
                        >
                          <item.icon className="h-5 w-5" />
                        </Link>
                        {badgeCount > 0 && (
                          <span className={cn("absolute -top-1 -right-1 text-white text-[8px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5", badgeColor)}>
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {/* Debug link - Super Admin only, hidden when impersonating */}
                  {isSuperAdmin && !isImpersonating && (
                    <div
                      className="tooltip-wrapper"
                      data-tooltip="Debug"
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const sidebarRect = e.currentTarget.closest('.backdrop-blur-md')?.getBoundingClientRect();
                        if (sidebarRect) {
                          const top = rect.top - sidebarRect.top + rect.height / 2;
                          e.currentTarget.style.setProperty('--tooltip-top', `${top}px`);
                        }
                      }}
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
              )}
            </div>
          );
        })()}

        {/* Notification Bell - only when NOT on dashboard */}
        {!isOnDashboard && (
          <div className={cn(
            "pt-2 mt-2 border-t border-white/10 dark:border-white/5",
            (isMobile || !isCollapsed) ? "px-4" : "flex justify-center px-3"
          )}>
            <div className={cn(
              "flex items-center rounded-2xl transition-colors",
              (isMobile || !isCollapsed)
                ? "gap-3 py-2 text-sm font-medium text-foreground/70"
                : "justify-center p-1"
            )}>
              <NotificationBell pendingPayments={pendingPayments} location={selectedLocation} tutorId={currentTutorId} showOverduePayments={isAdmin} />
              {(isMobile || !isCollapsed) && (
                <span>Notifications</span>
              )}
            </div>
          </div>
        )}
        </nav>
        {/* Bottom scroll indicator */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 h-6 z-10 pointer-events-none transition-opacity duration-200",
            "bg-gradient-to-t from-white/80 to-transparent dark:from-black/60 dark:to-transparent",
            canScrollDown ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

      {/* Mini-Calendar - show when expanded or mobile */}
      {(isMobile || !isCollapsed) && (
        <div className="flex-shrink-0 border-t border-white/10 dark:border-white/5 p-3">
          <WeeklyMiniCalendar />
        </div>
      )}

      {/* View Mode Toggle - show when expanded or mobile */}
      {(isMobile || !isCollapsed) && (
        <div className="flex-shrink-0 border-t border-white/10 dark:border-white/5 px-3 py-2">
          <div className="flex gap-1 bg-foreground/5 rounded-lg p-1">
            <button
              onClick={() => setViewMode("center-view")}
              className={cn(
                "flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all",
                viewMode === "center-view"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/70 hover:bg-foreground/10"
              )}
              suppressHydrationWarning
            >
              Center
            </button>
            <button
              onClick={() => setViewMode("my-view")}
              className={cn(
                "flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all",
                viewMode === "my-view"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/70 hover:bg-foreground/10"
              )}
              suppressHydrationWarning
            >
              My View
            </button>
          </div>
        </div>
      )}

      {/* User info with settings button */}
      <div className="flex-shrink-0 border-t border-white/10 dark:border-white/5 p-4">
        {/* Get user initials */}
        {(() => {
          // When impersonating a specific tutor, show their name
          const displayName = impersonatedTutor?.name || user?.name || "Guest";
          const initials = displayName
            .split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
          const displayRole = effectiveRole || "Guest";

          return !isMobile && isCollapsed ? (
            /* Collapsed state: Avatar only */
            <button
              onClick={() => setIsUserMenuOpen(true)}
              className={cn(
                "w-full flex items-center justify-center backdrop-blur-sm rounded-3xl shadow-md border hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] p-3",
                "bg-[rgba(245,240,232,0.5)] dark:bg-[rgba(42,42,42,0.3)]",
                isImpersonating
                  ? "border-amber-400 dark:border-amber-600"
                  : "border-white/10 dark:border-white/5"
              )}
              style={{
                transition: 'all 250ms cubic-bezier(0.38, 1.21, 0.22, 1.00)',
              }}
              title="User settings"
            >
              {user?.picture ? (
                <Image
                  src={user.picture}
                  alt={displayName}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover shadow-sm"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-sm">
                  <span className="text-sm font-bold text-primary-foreground">{initials}</span>
                </div>
              )}
            </button>
          ) : (
            /* Expanded state: Avatar with name */
            <button
              onClick={() => setIsUserMenuOpen(true)}
              className={cn(
                "w-full flex items-center gap-3 p-4 backdrop-blur-sm rounded-3xl shadow-md border hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]",
                "bg-[rgba(245,240,232,0.5)] dark:bg-[rgba(42,42,42,0.3)]",
                isImpersonating
                  ? "border-amber-400 dark:border-amber-600"
                  : "border-white/10 dark:border-white/5"
              )}
              style={{
                transition: 'all 250ms cubic-bezier(0.38, 1.21, 0.22, 1.00)',
              }}
            >
              {user?.picture ? (
                <Image
                  src={user.picture}
                  alt={displayName}
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full object-cover shadow-sm flex-shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center shadow-sm flex-shrink-0">
                  <span className="text-base font-bold text-primary-foreground">{initials}</span>
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <p className="text-xs font-medium text-foreground/60">{displayRole}</p>
              </div>
              <Settings className="h-4 w-4 text-foreground/50" />
            </button>
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
            <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/10 dark:border-white/5 pr-8">
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

            {/* Location Selector - Admin only */}
            {isAdminOrAbove && (
              <div className="py-3">
                <label className="text-sm font-medium text-foreground/80 mb-2 block">Location</label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-foreground/10 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  suppressHydrationWarning
                >
                  {locations.map((location) => (
                    <option key={location} value={location} className="bg-background text-foreground">{location}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Divider */}
            <div className="my-3 border-t border-white/10 dark:border-white/5" />

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
          </div>
        </>,
        document.body
      )}
    </>
  );

  return (
    <>
      {/* Desktop Sidebar - hidden on mobile */}
      <div
        className={cn(
          "hidden md:flex h-screen flex-col backdrop-blur-md border-r border-white/10 dark:border-white/5 z-50",
          "bg-[rgba(255,255,255,0.6)] dark:bg-[rgba(17,17,17,0.6)]",
          isCollapsed ? "w-[72px]" : "w-64"
        )}
        style={{
          transition: 'width 350ms cubic-bezier(0.38, 1.21, 0.22, 1.00)',
        }}
      >
        {sidebarContent(false, navRef)}
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
        className={cn(
          "fixed inset-y-0 left-0 w-72 flex flex-col backdrop-blur-md border-r border-white/10 dark:border-white/5 z-50 md:hidden",
          "bg-[rgba(254,249,243,0.98)] dark:bg-[rgba(45,38,24,0.98)]",
          "transition-transform duration-300 ease-out",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent(true)}
      </div>
    </>
  );
}
