"use client";

import { useState } from "react";
import { Settings, FolderSync, Shield, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageSurface } from "@/components/layout/PageSurface";
import { PageTransition } from "@/lib/design-system";
import { PathMappingSettings } from "@/components/settings/PathMappingSettings";
import { PathAliasAdmin } from "@/components/admin/PathAliasAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { PageHeader } from "@/components/controls";

type SettingsSection = "path-mappings" | "path-aliases-admin" | null;

export default function SettingsPage() {
  usePageTitle("Settings");
  const { isAdmin } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSection>(null);

  const settingsItems = [
    {
      id: "path-mappings" as const,
      icon: FolderSync,
      title: "Path mappings",
      description: "Configure drive letter mappings for shared network folders",
      available: true,
    },
    {
      id: "path-aliases-admin" as const,
      icon: Shield,
      title: "Path aliases (admin)",
      description: "Manage available path aliases for your organization",
      available: isAdmin,
    },
  ];

  const availableItems = settingsItems.filter(item => item.available);

  return (
    <PageSurface>
      <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-8">
        <PageHeader
          icon={Settings}
          title="Settings"
          subtitle="Configure your preferences and system settings"
        />

        {/* Settings Grid */}
        <div className="w-full">
          {/* grid-cols-1 and min-w-0 let the long descriptions truncate on a
              phone instead of pushing the cards past the edge of the screen. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Settings menu */}
            <div className="min-w-0 md:col-span-1">
              <div className="space-y-2">
                {availableItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(isActive ? null : item.id)}
                      aria-expanded={isActive}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all",
                        isActive
                          ? "bg-field-fill border-line-strong ring-1 ring-line-strong"
                          : "bg-paper border-line hover:border-line-strong"
                      )}
                    >
                      <Icon className={cn(
                        "h-5 w-5 shrink-0",
                        isActive
                          ? "text-accent-ink"
                          : "text-foreground/40"
                      )} />
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          "block font-medium truncate",
                          isActive
                            ? "text-gray-900 dark:text-gray-100"
                            : "text-foreground"
                        )}>
                          {item.title}
                        </span>
                        <span className="block text-xs text-foreground/60 truncate">
                          {item.description}
                        </span>
                      </div>
                      <ChevronRight className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        isActive ? "rotate-90" : "",
                        isActive
                          ? "text-foreground/70"
                          : "text-foreground/40"
                      )} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Settings content */}
            <div className="min-w-0 md:col-span-2">
              {activeSection === null ? (
                // On a phone the list sits above this, so the prompt only fills space.
                <div className="hidden md:flex items-center justify-center h-64 text-foreground/50">
                  <div className="text-center">
                    <Settings className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Select a setting to configure</p>
                  </div>
                </div>
              ) : (
                <div className="bg-paper rounded-xl border border-line p-4 sm:p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">
                    {settingsItems.find(i => i.id === activeSection)?.title}
                  </h2>
                  {activeSection === "path-mappings" && (
                    <PathMappingSettings />
                  )}
                  {activeSection === "path-aliases-admin" && (
                    <PathAliasAdmin />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </PageTransition>
    </PageSurface>
  );
}
