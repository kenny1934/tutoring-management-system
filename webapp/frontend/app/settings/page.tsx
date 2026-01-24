"use client";

import { useState } from "react";
import { Settings, FolderSync, Shield, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { PathMappingSettings } from "@/components/settings/PathMappingSettings";
import { PathAliasAdmin } from "@/components/admin/PathAliasAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";

type SettingsSection = "path-mappings" | "path-aliases-admin" | null;

export default function SettingsPage() {
  usePageTitle("Settings");
  const { isAdmin } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSection>(null);

  const settingsItems = [
    {
      id: "path-mappings" as const,
      icon: FolderSync,
      title: "Path Mappings",
      description: "Configure drive letter mappings for shared network folders",
      available: true,
    },
    {
      id: "path-aliases-admin" as const,
      icon: Shield,
      title: "Path Aliases (Admin)",
      description: "Manage available path aliases for your organization",
      available: isAdmin,
    },
  ];

  const availableItems = settingsItems.filter(item => item.available);

  return (
    <DeskSurface>
      <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-[#f5f0e8] dark:bg-[#2d2618]">
            <Settings className="h-6 w-6 text-foreground/60" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Settings
            </h1>
            <p className="text-sm text-white/70">
              Configure your preferences and system settings
            </p>
          </div>
        </div>

        {/* Settings Grid */}
        <div className="w-full">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Settings menu */}
            <div className="md:col-span-1">
              <div className="space-y-2">
                {availableItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(isActive ? null : item.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all",
                        isActive
                          ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700"
                          : "bg-[#fef9f3] dark:bg-[#2d2618] border-[#e8d4b8] dark:border-[#6b5a4a] hover:border-amber-300 dark:hover:border-amber-700"
                      )}
                    >
                      <Icon className={cn(
                        "h-5 w-5 shrink-0",
                        isActive
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-foreground/40"
                      )} />
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          "block font-medium truncate",
                          isActive
                            ? "text-amber-800 dark:text-amber-200"
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
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-foreground/40"
                      )} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Settings content */}
            <div className="md:col-span-2">
              {activeSection === null ? (
                <div className="flex items-center justify-center h-64 text-foreground/50">
                  <div className="text-center">
                    <Settings className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Select a setting to configure</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-6 shadow-sm">
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
    </DeskSurface>
  );
}
