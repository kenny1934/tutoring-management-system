"use client";

import { useState, useEffect, useCallback } from "react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { usePageTitle } from "@/lib/hooks";
import { summerAPI } from "@/lib/api";
import type { SummerCourseConfig } from "@/types";
import { Sun, Plus, Copy, Pencil, ChevronLeft } from "lucide-react";
import { SummerConfigEditor } from "@/components/admin/SummerConfigEditor";

export default function AdminSummerConfigPage() {
  usePageTitle("Summer Config");
  const { user, isLoading: authLoading, canViewAdminPages, isReadOnly } = useAuth();
  const { showToast } = useToast();

  const [configs, setConfigs] = useState<SummerCourseConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [cloneDialogId, setCloneDialogId] = useState<number | null>(null);
  const [cloneYear, setCloneYear] = useState("");

  const loadConfigs = useCallback(async () => {
    try {
      const data = await summerAPI.getConfigs();
      setConfigs(data.sort((a, b) => b.year - a.year));
    } catch {
      showToast("Failed to load configs", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (user && canViewAdminPages) loadConfigs();
  }, [user, canViewAdminPages, loadConfigs]);

  const handleClone = async (configId: number) => {
    const year = parseInt(cloneYear);
    if (!year || year < 2025 || year > 2099) {
      showToast("Please enter a valid year (2025-2099)", "error");
      return;
    }
    try {
      await summerAPI.cloneConfig(configId, year);
      showToast(`Config cloned for ${year}`, "success");
      setCloneDialogId(null);
      setCloneYear("");
      loadConfigs();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Clone failed", "error");
    }
  };

  const handleSaved = () => {
    setEditingId(null);
    setCreating(false);
    loadConfigs();
  };

  // Auth guard
  if (authLoading) {
    return (
      <DeskSurface>
        <PageTransition className="min-h-full p-4 sm:p-6">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  if (!user || !canViewAdminPages) {
    return (
      <DeskSurface>
        <PageTransition className="min-h-full p-4 sm:p-6">
          <p className="text-center py-20 text-muted-foreground">
            You do not have permission to view this page.
          </p>
        </PageTransition>
      </DeskSurface>
    );
  }

  // Editor view
  if (editingId !== null || creating) {
    return (
      <DeskSurface>
        <PageTransition className="min-h-full p-4 sm:p-6">
          <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm p-4 sm:p-6 max-w-7xl mx-auto">
            <button
              onClick={() => { setEditingId(null); setCreating(false); }}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to list
            </button>
            <SummerConfigEditor
              configId={editingId}
              isNew={creating}
              isReadOnly={isReadOnly}
              onSaved={handleSaved}
              onCancel={() => { setEditingId(null); setCreating(false); }}
            />
          </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  // List view
  return (
    <DeskSurface>
      <PageTransition className="min-h-full p-4 sm:p-6">
        <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Sun className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Summer Course Config</h1>
                <p className="text-sm text-foreground/60">
                  Manage yearly summer course configurations
                  {isReadOnly && <span className="ml-2 text-amber-600">(Read-only)</span>}
                </p>
              </div>
            </div>
            {!isReadOnly && (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                New Config
              </button>
            )}
          </div>

          {/* Config list */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="p-4 rounded-lg border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 animate-pulse">
                  <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-4 w-64 bg-gray-100 dark:bg-gray-800 rounded mt-2" />
                </div>
              ))}
            </div>
          ) : configs.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">
              No summer course configs yet. Create one to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className="p-4 rounded-lg border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-foreground">
                          {config.year}
                        </span>
                        <span className="text-sm text-muted-foreground truncate">
                          {config.title}
                        </span>
                        {config.is_active ? (
                          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded-full">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Applications: {new Date(config.application_open_date).toLocaleDateString()} – {new Date(config.application_close_date).toLocaleDateString()}
                        {" · "}
                        {config.locations.length} location{config.locations.length !== 1 ? "s" : ""}
                        {" · "}
                        {config.total_lessons} lessons
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setEditingId(config.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-foreground/80 hover:text-foreground border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      {!isReadOnly && (
                        <button
                          onClick={() => { setCloneDialogId(config.id); setCloneYear(String(config.year + 1)); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm text-foreground/80 hover:text-foreground border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Clone
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Clone dialog */}
          {cloneDialogId !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 w-80 shadow-xl">
                <h3 className="text-lg font-semibold text-foreground mb-3">Clone Config</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter the target year for the cloned config. Dates will be shifted automatically.
                </p>
                <input
                  type="number"
                  value={cloneYear}
                  onChange={(e) => setCloneYear(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-foreground text-sm mb-4"
                  placeholder="e.g. 2026"
                  min={2025}
                  max={2099}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setCloneDialogId(null); setCloneYear(""); }}
                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleClone(cloneDialogId)}
                    className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors font-medium"
                  >
                    Clone
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </PageTransition>
    </DeskSurface>
  );
}
