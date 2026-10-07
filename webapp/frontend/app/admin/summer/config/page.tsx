"use client";

import { useState, useEffect, useCallback } from "react";
import { PageSurface } from "@/components/layout/PageSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { usePageTitle } from "@/lib/hooks";
import { summerAPI } from "@/lib/api";
import type { SummerCourseConfig } from "@/types";
import { Sun, Plus, Copy, Pencil, Trash2, Power } from "lucide-react";
import { SummerConfigEditor } from "@/components/admin/SummerConfigEditor";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatShortDate } from "@/lib/formatters";
import { Badge, Button, IconButton, Input } from "@/components/controls";

export default function AdminSummerConfigPage() {
  usePageTitle("Summer config");
  const { user, isLoading: authLoading, canViewAdminPages, isReadOnly } = useAuth();
  const { showToast } = useToast();

  const [configs, setConfigs] = useState<SummerCourseConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  // Clone dialog state
  const [cloneDialogId, setCloneDialogId] = useState<number | null>(null);
  const [cloneYear, setCloneYear] = useState("");
  const [cloneDuplicateWarning, setCloneDuplicateWarning] = useState(false);

  // Toggle active state
  const [toggleTarget, setToggleTarget] = useState<{ id: number; year: number; activate: boolean } | null>(null);
  const [toggling, setToggling] = useState(false);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; year: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

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

    // Check for duplicate year
    if (!cloneDuplicateWarning && configs.some((c) => c.year === year)) {
      setCloneDuplicateWarning(true);
      return;
    }

    try {
      await summerAPI.cloneConfig(configId, year);
      showToast(`Config cloned for ${year}`, "success");
      setCloneDialogId(null);
      setCloneYear("");
      setCloneDuplicateWarning(false);
      loadConfigs();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Clone failed", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await summerAPI.deleteConfig(deleteTarget.id);
      showToast("Config deleted", "success");
      setDeleteTarget(null);
      loadConfigs();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      await summerAPI.updateConfig(toggleTarget.id, { is_active: toggleTarget.activate });
      showToast(toggleTarget.activate ? `${toggleTarget.year} config activated` : `${toggleTarget.year} config deactivated`, "success");
      setToggleTarget(null);
      loadConfigs();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Toggle failed", "error");
    } finally {
      setToggling(false);
    }
  };

  const handleEditorCancel = useCallback(() => {
    setEditingId(null);
    setCreating(false);
  }, []);

  const handleSaved = () => {
    setEditingId(null);
    setCreating(false);
    loadConfigs();
  };

  // Auth guard
  if (authLoading) {
    return (
      <PageSurface>
        <PageTransition className="min-h-full p-4 sm:p-6">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </PageTransition>
      </PageSurface>
    );
  }

  if (!user || !canViewAdminPages) {
    return (
      <PageSurface>
        <PageTransition className="min-h-full p-4 sm:p-6">
          <p className="text-center py-20 text-muted-foreground">
            You do not have permission to view this page.
          </p>
        </PageTransition>
      </PageSurface>
    );
  }

  // Editor view
  if (editingId !== null || creating) {
    return (
      <PageSurface>
        <PageTransition className="min-h-full p-4 sm:p-6">
          <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-line shadow-sm p-4 sm:p-6 max-w-7xl mx-auto">
            <SummerConfigEditor
              configId={editingId}
              isNew={creating}
              isReadOnly={isReadOnly}
              onSaved={handleSaved}
              onCancel={handleEditorCancel}
            />
          </div>
        </PageTransition>
      </PageSurface>
    );
  }

  // List view
  return (
    <PageSurface>
      <PageTransition className="min-h-full p-4 sm:p-6">
        <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-line shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-line">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-tint flex items-center justify-center">
                <Sun className="h-5 w-5 text-accent-ink" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Summer course config</h1>
                <p className="text-xs text-muted-foreground">
                  Manage yearly summer course configurations
                  {isReadOnly && <span className="ml-2 text-amber-700">(Read-only)</span>}
                </p>
              </div>
            </div>
            {!isReadOnly && (
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                New config
              </Button>
            )}
          </div>

          {/* Config list */}
          <div className="p-4 sm:p-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="p-4 rounded-lg border bg-paper border-line animate-pulse">
                  <div className="h-5 w-32 bg-tint rounded" />
                  <div className="h-4 w-64 bg-tint rounded mt-2" />
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
                  className="p-4 rounded-lg border bg-paper border-line"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-bold text-lg text-foreground">
                          {config.year}
                        </span>
                        <span className="text-sm text-muted-foreground truncate">
                          {config.title}
                        </span>
                        {config.is_active ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <Badge>Inactive</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Applications: {formatShortDate(config.application_open_date)} – {formatShortDate(config.application_close_date)}
                        {" · "}
                        Course: {formatShortDate(config.course_start_date)} – {formatShortDate(config.course_end_date)}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        ${config.pricing_config.base_fee.toLocaleString()}
                        {" · "}
                        {config.locations.length} location{config.locations.length !== 1 ? "s" : ""}
                        {" · "}
                        {config.total_lessons} lessons
                        {config.updated_at && (
                          <>
                            {" · "}
                            Updated {formatShortDate(config.updated_at)}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                      <Button size="sm" icon={Pencil} onClick={() => setEditingId(config.id)}>
                        {isReadOnly ? "View" : "Edit"}
                      </Button>
                      {!isReadOnly && (
                        <>
                          <Button
                            size="sm"
                            icon={Power}
                            iconClassName={config.is_active ? "text-amber-600" : "text-green-600"}
                            onClick={() => setToggleTarget({ id: config.id, year: config.year, activate: !config.is_active })}
                          >
                            {config.is_active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button size="sm" icon={Copy} onClick={() => { setCloneDialogId(config.id); setCloneYear(String(config.year + 1)); setCloneDuplicateWarning(false); }}>
                            Clone
                          </Button>
                          {!config.is_active && (
                            <IconButton
                              icon={Trash2}
                              size="sm"
                              tone="danger"
                              label={`Delete the ${config.year} config`}
                              onClick={() => setDeleteTarget({ id: config.id, year: config.year })}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>

          {/* Clone dialog — using Modal */}
          <Modal
            isOpen={cloneDialogId !== null}
            onClose={() => { setCloneDialogId(null); setCloneYear(""); setCloneDuplicateWarning(false); }}
            title="Clone config"
            size="sm"
            footer={
              <div className="flex justify-end gap-2">
                <Button onClick={() => { setCloneDialogId(null); setCloneYear(""); setCloneDuplicateWarning(false); }}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => cloneDialogId !== null && handleClone(cloneDialogId)}>
                  {cloneDuplicateWarning ? "Clone anyway" : "Clone"}
                </Button>
              </div>
            }
          >
            <p className="text-sm text-muted-foreground mb-4">
              Enter the target year for the cloned config. Dates will be shifted automatically.
            </p>
            <Input
              type="number"
              aria-label="Year"
              value={cloneYear}
              onChange={(e) => { setCloneYear(e.target.value); setCloneDuplicateWarning(false); }}
              placeholder="e.g. 2026"
              min={2025}
              max={2099}
            />
            {cloneDuplicateWarning && (
              <p className="text-sm text-amber-700 mt-2">
                A config for {cloneYear} already exists. Clone anyway?
              </p>
            )}
          </Modal>

          {/* Toggle active confirmation dialog */}
          <ConfirmDialog
            isOpen={toggleTarget !== null}
            onCancel={() => setToggleTarget(null)}
            onConfirm={handleToggleActive}
            title={toggleTarget?.activate ? "Activate config" : "Deactivate config"}
            message={
              toggleTarget?.activate
                ? `Activate the ${toggleTarget?.year} config? This will deactivate any currently active config.`
                : `Deactivate the ${toggleTarget?.year} config? No config will be active and the public form will be unavailable.`
            }
            confirmText={toggleTarget?.activate ? "Activate" : "Deactivate"}
            variant={toggleTarget?.activate ? "default" : "danger"}
            loading={toggling}
          />

          {/* Delete confirmation dialog */}
          <ConfirmDialog
            isOpen={deleteTarget !== null}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
            title="Delete config"
            message={`Delete the ${deleteTarget?.year} config? This cannot be undone.`}
            confirmText="Delete"
            variant="danger"
            loading={deleting}
          />
        </div>
      </PageTransition>
    </PageSurface>
  );
}
