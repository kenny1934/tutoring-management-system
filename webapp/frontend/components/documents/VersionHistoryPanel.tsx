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
      return <Bookmark className="w-3.5 h-3.5 text-amber-500" />;
    case "session_start":
      return <Play className="w-3.5 h-3.5 text-blue-500" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />;
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
    <div className="fixed inset-y-0 right-0 z-50 w-80 bg-white dark:bg-[#1a1410] border-l border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Version History</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#2d2618] text-gray-500 dark:text-gray-400"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Create checkpoint */}
      <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
        <div className="flex gap-2">
          <input
            type="text"
            value={checkpointLabel}
            onChange={(e) => setCheckpointLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateCheckpoint(); }}
            placeholder="Checkpoint label (optional)"
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-md border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1410] text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleCreateCheckpoint}
            disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50 whitespace-nowrap transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        </div>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {loading && versions.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : versions.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-gray-400 dark:text-gray-500">
            No versions yet. Versions are created automatically as you edit.
          </div>
        ) : (
          <div className="divide-y divide-[#e8d4b8]/50 dark:divide-[#6b5a4a]/50">
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
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {versionTypeLabel(ver.version_type)}
                      </span>
                    </div>
                    {ver.label && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 truncate mt-0.5">
                        {ver.label}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {formatRelativeTime(ver.created_at)}
                      </span>
                      <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                        {ver.created_by_name}
                      </span>
                    </div>
                  </div>

                  {/* Actions — visible on hover */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onPreview(ver.id)}
                      className="p-1 rounded hover:bg-[#e8d4b8]/50 dark:hover:bg-[#6b5a4a]/50 text-gray-400 hover:text-blue-500"
                      title="Preview this version"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleRestore(ver.id)}
                      disabled={restoringId === ver.id}
                      className="p-1 rounded hover:bg-[#e8d4b8]/50 dark:hover:bg-[#6b5a4a]/50 text-gray-400 hover:text-green-600 disabled:opacity-50"
                      title="Restore this version"
                    >
                      {restoringId === ver.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(ver.id)}
                      disabled={deletingId === ver.id}
                      className="p-1 rounded hover:bg-[#e8d4b8]/50 dark:hover:bg-[#6b5a4a]/50 text-gray-400 hover:text-red-500 disabled:opacity-50"
                      title="Delete this version"
                    >
                      {deletingId === ver.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
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
