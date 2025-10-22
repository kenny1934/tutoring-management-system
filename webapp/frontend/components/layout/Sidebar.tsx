"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Calendar, BarChart3, MapPin, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home, color: "bg-blue-500" },
  { name: "Students", href: "/students", icon: Users, color: "bg-green-500" },
  { name: "Sessions", href: "/sessions", icon: Calendar, color: "bg-red-500" },
  { name: "Reports", href: "/reports", icon: BarChart3, color: "bg-orange-500" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { selectedLocation, setSelectedLocation, locations, setLocations, mounted } = useLocation();
  const { viewMode, setViewMode } = useRole();

  // Fetch locations on mount (only on client-side)
  useEffect(() => {
    if (!mounted) return;

    async function fetchLocations() {
      try {
        const data = await api.stats.getLocations();
        const allLocations = ["All Locations", ...data];
        setLocations(allLocations);
      } catch (error) {
        console.error("Failed to fetch locations:", error);
      }
    }
    fetchLocations();
  }, [mounted, setLocations]);

  return (
    <div className="flex h-screen w-64 flex-col bg-surface dark:bg-surface-dark border-r border-border/50">
      {/* Logo - M3 Expressive */}
      <div className="flex h-16 items-center px-6 border-b border-border/50">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="CSM Pro" className="h-9 w-auto" />
          <span className="font-bold text-xl">CSM Pro</span>
        </div>
      </div>

      {/* Navigation - M3 Expressive Pills */}
      <nav className="flex-1 space-y-2 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              style={{
                transition: `all ${isActive ? '350ms' : '200ms'} var(--spring-expressive-default)`
              }}
              className={cn(
                "group relative flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium",
                isActive
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-foreground/70 hover:bg-foreground/8 hover:scale-[1.02] active:scale-[0.98]"
              )}
            >
              {/* Color indicator with glow */}
              <div className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                item.color,
                isActive
                  ? "scale-100 opacity-100 shadow-[0_0_8px_currentColor]"
                  : "scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-60"
              )} />

              {/* Icon */}
              <item.icon
                className={cn(
                  "h-5 w-5 transition-transform duration-300",
                  isActive ? "scale-110" : "group-hover:scale-110"
                )}
                style={{
                  transition: 'transform 200ms var(--spring-expressive-fast)'
                }}
              />

              {/* Label */}
              <span className="flex-1">{item.name}</span>

              {/* Active indicator */}
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-sm" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Filters - M3 Expressive */}
      <div className="border-t border-border/50 p-4 space-y-4">
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
            className="w-full px-4 py-2.5 bg-surface dark:bg-surface-dark border border-border/50 rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-border transition-all"
            style={{ transition: 'all 200ms var(--spring-expressive-default)' }}
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
              style={{ transition: 'all 200ms var(--spring-expressive-default)' }}
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
              style={{ transition: 'all 200ms var(--spring-expressive-default)' }}
              suppressHydrationWarning
            >
              My View
            </button>
          </div>
        </div>
      </div>

      {/* User info - M3 Expressive */}
      <div className="border-t border-border/50 p-4">
        <div
          className="flex items-center gap-3 p-4 bg-surface-variant dark:bg-surface-variant/50 rounded-3xl shadow-md border border-border/30 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
          style={{ transition: 'all 250ms var(--spring-expressive-default)' }}
        >
          <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center shadow-sm">
            <span className="text-base font-bold text-primary-foreground">KC</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">Kenny Chiu</p>
            <p className="text-xs font-medium text-foreground/60">Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}
