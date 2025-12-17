"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Calendar, BookOpen, MapPin, Eye, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { WeeklyMiniCalendar } from "@/components/layout/WeeklyMiniCalendar";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home, color: "bg-blue-500" },
  { name: "Students", href: "/students", icon: Users, color: "bg-green-500" },
  { name: "Sessions", href: "/sessions", icon: Calendar, color: "bg-red-500" },
  { name: "Courseware", href: "/courseware", icon: BookOpen, color: "bg-orange-500" },
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
              <img src="/logo.png" alt="CSM Pro" className="h-9 w-auto" />
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
              <img
                src="/logo.png"
                alt="CSM Pro"
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
                  showExpanded ? "gap-3 px-4 py-3.5" : "justify-center p-3",
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

                {/* Label */}
                {showExpanded && (
                  <>
                    <span className="flex-1">{item.name}</span>
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
              <NotificationBell pendingPayments={pendingPayments} />
              {(isMobile || !isCollapsed) && (
                <span>Notifications</span>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Filters - show when expanded or mobile */}
      {(isMobile || !isCollapsed) && (
        <div className="border-t border-white/10 dark:border-white/5 p-4 space-y-4">
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
              className="w-full px-4 py-2.5 backdrop-blur-sm border border-white/10 dark:border-white/5 rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-border transition-all bg-[rgba(255,255,255,0.8)] dark:bg-[rgba(17,17,17,0.8)]"
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
                  "flex-1 px-3 py-2 text-xs font-semibold rounded-lg",
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
                  "flex-1 px-3 py-2 text-xs font-semibold rounded-lg",
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

      {/* User info */}
      <div className="border-t border-white/10 dark:border-white/5 p-4">
        <div
          className={cn(
            "flex items-center backdrop-blur-sm rounded-3xl shadow-md border border-white/10 dark:border-white/5 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]",
            "bg-[rgba(245,240,232,0.5)] dark:bg-[rgba(42,42,42,0.3)]",
            (isMobile || !isCollapsed) ? "gap-3 p-4" : "justify-center p-2"
          )}
          style={{
            transition: 'all 250ms cubic-bezier(0.38, 1.21, 0.22, 1.00)',
          }}
        >
          <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center shadow-sm flex-shrink-0">
            <span className="text-base font-bold text-primary-foreground">KC</span>
          </div>
          {(isMobile || !isCollapsed) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">Kenny Chiu</p>
              <p className="text-xs font-medium text-foreground/60">Admin</p>
            </div>
          )}
        </div>
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
          "bg-[rgba(255,255,255,0.95)] dark:bg-[rgba(17,17,17,0.95)]",
          "transition-transform duration-300 ease-out",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent(true)}
      </div>
    </>
  );
}
