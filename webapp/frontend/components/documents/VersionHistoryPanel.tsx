"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Clock,
  Bookmark,
  Play,
  Eye,
  RotateCcw,
  Trash2,
  Loader2,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { versionsAPI } from "@/lib/document-api";
import type { DocumentVersion } from "@/types";
import { Button, IconButton, Input } from "@/components/controls";

interface VersionHistoryPanelProps {
  docId: number;
  isOpen: boolean;
  onClose: () => void;
  onPreview: (versionId: number) => void;
  onRestore: (versionId: number) => Promise<void>;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: diffDay > 365 ? "numeric" : undefined });
}

function VersionTypeIcon({ type }: { type: DocumentVersion["version_type"] }) {
  switch (type) {
    case "manual":
      return <Bookmark className="w-3.5 h-3.5 text-amber-700" />;
    case "session_start":
      return <Play className="w-3.5 h-3.5 text-blue-600" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />;
  }
}

function versionTypeLabel(type: DocumentVersion["version_type"]): string {
  switch (type) {
    case "manual": return "Checkpoint";
    case "session_start": return "Session start";
    default: return "Auto-save";
  }
}

export function VersionHistoryPanel({
  docId,
  isOpen,
  onClose,
  onPreview,
  onRestore,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkpointLabel, setCheckpointLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await versionsAPI.list(docId, { limit: 100 });
      setVersions(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    if (isOpen) fetchVersions();
  }, [isOpen, fetchVersions]);

  const handleCreateCheckpoint = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await versionsAPI.createCheckpoint(docId, checkpointLabel.trim() || undefined);
      setCheckpointLabel("");
      await fetchVersions();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (verId: number) => {
    setDeletingId(verId);
    try {
      await versionsAPI.delete(docId, verId);
      setVersions((prev) => prev.filter((v) => v.id !== verId));
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  };

  const handleRestore = async (verId: number) => {
    setRestoringId(verId);
    try {
      await onRestore(verId);
      await fetchVersions();
    } finally {
      setRestoringId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 md:relative md:inset-auto md:z-auto md:w-80 shrink-0 bg-white dark:bg-[#1a1410] border-l border-line shadow-xl md:shadow-none flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Version history</h3>
        <IconButton icon={X} size="sm" label="Close version history" onClick={onClose} />
      </div>

      {/* Create checkpoint */}
      <div className="px-4 py-3 border-b border-line">
        <div className="flex gap-2">
          <Input
            size="sm"
            type="text"
            value={checkpointLabel}
            onChange={(e) => setCheckpointLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateCheckpoint(); }}
            placeholder="Checkpoint label (optional)"
            aria-label="Checkpoint label"
            className="flex-1"
          />
          <Button variant="primary" size="sm" icon={Save} loading={saving} onClick={handleCreateCheckpoint}>
            Save
          </Button>
        </div>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {loading && versions.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : versions.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-gray-500 dark:text-gray-400">
            No versions yet. Versions are created automatically as you edit.
          </div>
        ) : (
          <div className="divide-y divide-line/50">
            {versions.map((ver) => (
              <div
                key={ver.id}
                className="group px-4 py-2.5 hover:bg-[#f5ede3]/50 dark:hover:bg-[#2d2618]/50 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <VersionTypeIcon type={ver.version_type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-900 dark:text-white">
                        v{ver.version_number}
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {versionTypeLabel(ver.version_type)}
                      </span>
                    </div>
                    {ver.label && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 truncate mt-0.5">
                        {ver.label}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {formatRelativeTime(ver.created_at)}
                      </span>
                      <span className="text-[11px] text-gray-300 dark:text-gray-400">·</span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {ver.created_by_name}
                      </span>
                    </div>
                  </div>

                  {/* Actions — visible on hover */}
                  <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <IconButton
                      icon={Eye}
                      size="sm"
                      label="Preview this version"
                      onClick={() => onPreview(ver.id)}
                    />
                    <IconButton
                      icon={restoringId === ver.id ? Loader2 : RotateCcw}
                      iconClassName={restoringId === ver.id ? "animate-spin" : undefined}
                      size="sm"
                      label="Restore this version"
                      onClick={() => handleRestore(ver.id)}
                      disabled={restoringId === ver.id}
                    />
                    <IconButton
                      icon={deletingId === ver.id ? Loader2 : Trash2}
                      iconClassName={deletingId === ver.id ? "animate-spin" : undefined}
                      size="sm"
                      tone="danger"
                      label="Delete this version"
                      onClick={() => handleDelete(ver.id)}
                      disabled={deletingId === ver.id}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
