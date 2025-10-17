"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Calendar, BarChart3, MapPin, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { api } from "@/lib/api";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Students", href: "/students", icon: Users },
  { name: "Sessions", href: "/sessions", icon: Calendar },
  { name: "Reports", href: "/reports", icon: BarChart3 },
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
    <div className="flex h-screen w-64 flex-col bg-card border-r border-border">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">CSM</span>
          </div>
          <span className="font-semibold text-lg">CSM Pro</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Filters */}
      <div className="border-t border-border p-4 space-y-4">
        {/* Location Selector */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            Location
          </label>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
          <label className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Eye className="h-3 w-3" />
            View Mode
          </label>
          <div className="flex gap-1 bg-background border border-input rounded-md p-1">
            <button
              onClick={() => setViewMode("center-view")}
              className={cn(
                "flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors",
                viewMode === "center-view"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              suppressHydrationWarning
            >
              Center
            </button>
            <button
              onClick={() => setViewMode("my-view")}
              className={cn(
                "flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors",
                viewMode === "my-view"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              suppressHydrationWarning
            >
              My View
            </button>
          </div>
        </div>
      </div>

      {/* User info */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">KC</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Kenny Chiu</p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}
