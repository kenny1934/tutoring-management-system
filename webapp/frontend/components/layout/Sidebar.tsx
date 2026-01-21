"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Home, Users, Calendar, BookOpen, MapPin, Eye, X, Settings, ChevronUp, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { useToast } from "@/contexts/ToastContext";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { WeeklyMiniCalendar } from "@/components/layout/WeeklyMiniCalendar";
import { useUnreadMessageCount, useTutors } from "@/lib/hooks";

// Current user constant (will be replaced with OAuth)
const CURRENT_USER_TUTOR = "Mr Kenny Chiu";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home, color: "bg-blue-500" },
  { name: "Students", href: "/students", icon: Users, color: "bg-green-500" },
  { name: "Sessions", href: "/sessions", icon: Calendar, color: "bg-red-500" },
  { name: "Courseware", href: "/courseware", icon: BookOpen, color: "bg-orange-500" },
  { name: "Inbox", href: "/inbox", icon: Inbox, color: "bg-purple-500" },
];

interface SidebarProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { selectedLocation, setSelectedLocation, locations, setLocations, mounted } = useLocation();
  const { viewMode, setViewMode } = useRole();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pendingPayments, setPendingPayments] = useState(0);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Get tutors list to find current tutor ID
  const { data: tutors = [] } = useTutors();

  // Derive current tutor ID from tutors list
  const currentTutorId = useMemo(() => {
    const currentTutor = tutors.find((t) => t.tutor_name === CURRENT_USER_TUTOR);
    return currentTutor?.id;
  }, [tutors]);

  // Fetch unread message count for Inbox badge
  const { data: unreadCount } = useUnreadMessageCount(currentTutorId);

  // App-wide new message notification toast
  const router = useRouter();
  const { showToast } = useToast();
  const prevUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (unreadCount?.count !== undefined && currentTutorId) {
      if (prevUnreadRef.current !== null && unreadCount.count > prevUnreadRef.current) {
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
  }, [unreadCount?.count, currentTutorId, showToast, router]);

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

  // Save collapsed state to localStorage
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('sidebar-collapsed', String(isCollapsed));
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
        console.error("Failed to fetch locations:", error);
      }
    }
    fetchLocations();
  }, [mounted, setLocations]);

  // Fetch stats for notification bell (when not on dashboard)
  useEffect(() => {
    if (!mounted || isOnDashboard) return;

    async function fetchStats() {
      try {
        const stats = await api.stats.getDashboard(selectedLocation);
        setPendingPayments(stats.pending_payment_enrollments);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      }
    }
    fetchStats();
  }, [mounted, isOnDashboard, selectedLocation]);

  // Close mobile menu on navigation
  const handleNavClick = () => {
    if (onMobileClose) {
      onMobileClose();
    }
  };

  // Sidebar content - shared between desktop and mobile
  const sidebarContent = (isMobile: boolean) => (
    <>
      {/* Logo Header */}
      <div className="flex h-16 items-center justify-between px-3 border-b border-white/10 dark:border-white/5">
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
      <nav className="flex-1 space-y-2 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const showExpanded = isMobile || !isCollapsed;
          return (
            <div
              key={item.name}
              className={cn("relative", !showExpanded && "tooltip-wrapper")}
              data-tooltip={item.name}
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
                {!showExpanded && item.name === "Inbox" && (unreadCount?.count ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
                    {unreadCount.count > 99 ? "99+" : unreadCount.count}
                  </span>
                )}

                {/* Label */}
                {showExpanded && (
                  <>
                    <span className="flex-1">{item.name}</span>
                    {/* Unread badge for Inbox */}
                    {item.name === "Inbox" && (unreadCount?.count ?? 0) > 0 && (
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
              <NotificationBell pendingPayments={pendingPayments} location={selectedLocation} tutorId={currentTutorId} />
              {(isMobile || !isCollapsed) && (
                <span>Notifications</span>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Filters - show when expanded or mobile */}
      {(isMobile || !isCollapsed) && (
        <div className="border-t border-white/10 dark:border-white/5 p-3 space-y-3">
          {/* Weekly Mini-Calendar */}
          <WeeklyMiniCalendar />

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Location Selector */}
          <div>
            <label className="text-xs text-foreground/70 mb-2 flex items-center gap-2 font-semibold uppercase tracking-wide">
              <MapPin className="h-4 w-4" />
              Location
            </label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full px-3 py-2 backdrop-blur-sm border border-white/10 dark:border-white/5 rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-border transition-all bg-[rgba(255,255,255,0.8)] dark:bg-[rgba(17,17,17,0.8)]"
              style={{
                transition: 'all 200ms cubic-bezier(0.38, 1.21, 0.22, 1.00)',
              }}
              suppressHydrationWarning
            >
              {locations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </div>

          {/* View Mode Toggle */}
          <div>
            <label className="text-xs text-foreground/70 mb-2 flex items-center gap-2 font-semibold uppercase tracking-wide">
              <Eye className="h-4 w-4" />
              View Mode
            </label>
            <div className="flex gap-1.5 bg-foreground/5 border border-border/30 rounded-xl p-1.5">
              <button
                onClick={() => setViewMode("center-view")}
                className={cn(
                  "flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg",
                  viewMode === "center-view"
                    ? "bg-primary text-primary-foreground shadow-sm scale-[1.02]"
                    : "text-foreground/70 hover:bg-foreground/8 hover:scale-[1.01] active:scale-[0.98]"
                )}
                style={{ transition: 'all 200ms cubic-bezier(0.38, 1.21, 0.22, 1.00)' }}
                suppressHydrationWarning
              >
                Center
              </button>
              <button
                onClick={() => setViewMode("my-view")}
                className={cn(
                  "flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg",
                  viewMode === "my-view"
                    ? "bg-primary text-primary-foreground shadow-sm scale-[1.02]"
                    : "text-foreground/70 hover:bg-foreground/8 hover:scale-[1.01] active:scale-[0.98]"
                )}
                style={{ transition: 'all 200ms cubic-bezier(0.38, 1.21, 0.22, 1.00)' }}
                suppressHydrationWarning
              >
                My View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User info with dropdown menu (expanded or collapsed) */}
      <div className="border-t border-white/10 dark:border-white/5 p-4 relative">
        {/* Collapsed state: Avatar with compact dropdown */}
        {!isMobile && isCollapsed ? (
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className={cn(
                "w-full flex items-center justify-center backdrop-blur-sm rounded-3xl shadow-md border border-white/10 dark:border-white/5 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] p-3",
                "bg-[rgba(245,240,232,0.5)] dark:bg-[rgba(42,42,42,0.3)]",
                isUserMenuOpen && "ring-2 ring-primary/30"
              )}
              style={{
                transition: 'all 250ms cubic-bezier(0.38, 1.21, 0.22, 1.00)',
              }}
              title="User menu"
            >
              <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-sm">
                <span className="text-sm font-bold text-primary-foreground">KC</span>
              </div>
            </button>

            {/* Compact popup to the right - icon only */}
            {isUserMenuOpen && (
              <div
                className={cn(
                  "absolute left-full top-1/2 ml-3 rounded-full shadow-lg border backdrop-blur-md",
                  "bg-[rgba(254,249,243,0.95)] dark:bg-[rgba(45,38,24,0.95)]",
                  "border-white/20 dark:border-white/10"
                )}
                style={{
                  animation: 'slideInRight 200ms cubic-bezier(0.38, 1.21, 0.22, 1.00) forwards',
                }}
              >
                <Link
                  href="/settings"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    handleNavClick();
                  }}
                  className="flex items-center justify-center w-10 h-10 text-foreground/70 hover:text-foreground hover:bg-foreground/10 transition-colors rounded-full"
                  title="Settings"
                >
                  <Settings className="h-5 w-5" />
                </Link>

                {/* Caret pointing left to avatar */}
                <div
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 rotate-45",
                    "bg-[rgba(254,249,243,0.95)] dark:bg-[rgba(45,38,24,0.95)]",
                    "border-l border-b border-white/20 dark:border-white/10"
                  )}
                />
              </div>
            )}
          </div>
        ) : (
          /* Expanded state: Avatar with dropdown to the right */
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className={cn(
                "w-full flex items-center gap-3 p-4 backdrop-blur-sm rounded-3xl shadow-md border border-white/10 dark:border-white/5 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]",
                "bg-[rgba(245,240,232,0.5)] dark:bg-[rgba(42,42,42,0.3)]",
                isUserMenuOpen && "ring-2 ring-primary/30"
              )}
              style={{
                transition: 'all 250ms cubic-bezier(0.38, 1.21, 0.22, 1.00)',
              }}
            >
              <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center shadow-sm flex-shrink-0">
                <span className="text-base font-bold text-primary-foreground">KC</span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-foreground truncate">Kenny Chiu</p>
                <p className="text-xs font-medium text-foreground/60">Admin</p>
              </div>
              <ChevronRight className={cn(
                "h-4 w-4 text-foreground/50 transition-transform",
                isUserMenuOpen && "rotate-180"
              )} />
            </button>

            {/* User dropdown menu - positioned to the RIGHT of sidebar */}
            {isUserMenuOpen && (
              <div
                className={cn(
                  "absolute left-full top-1/2 ml-3 py-2 px-1 rounded-xl shadow-lg border backdrop-blur-md min-w-[140px]",
                  "bg-[rgba(254,249,243,0.95)] dark:bg-[rgba(45,38,24,0.95)]",
                  "border-white/20 dark:border-white/10"
                )}
                style={{
                  animation: 'slideInRight 200ms cubic-bezier(0.38, 1.21, 0.22, 1.00) forwards',
                }}
              >
                <Link
                  href="/settings"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    if (onMobileClose) onMobileClose();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-foreground hover:bg-foreground/10 transition-colors rounded-lg"
                >
                  <Settings className="h-4 w-4 text-foreground/60" />
                  Settings
                </Link>

                {/* Caret pointing left to avatar */}
                <div
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 rotate-45",
                    "bg-[rgba(254,249,243,0.95)] dark:bg-[rgba(45,38,24,0.95)]",
                    "border-l border-b border-white/20 dark:border-white/10"
                  )}
                />
              </div>
            )}
          </div>
        )}
      </div>
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
        {sidebarContent(false)}
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
