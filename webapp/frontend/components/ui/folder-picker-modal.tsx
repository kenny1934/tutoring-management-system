"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Folder, Plus, X, AlertCircle, Settings } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  type SavedFolder,
  getSavedFolders,
  addFolder,
  removeFolder,
  pickFileFromFolder,
  verifyPermission,
  updateFolderName,
  isRootDriveName,
} from "@/lib/file-system";

interface FolderPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelected: (path: string) => void;
}

export function FolderPickerModal({
  isOpen,
  onClose,
  onFileSelected,
}: FolderPickerModalProps) {
  const [folders, setFolders] = useState<SavedFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickingFromFolder, setPickingFromFolder] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<SavedFolder | null>(null);
  const [newFolderName, setNewFolderName] = useState("");

  // Load saved folders when modal opens
  useEffect(() => {
    if (isOpen) {
      loadFolders();
    }
  }, [isOpen]);

  const loadFolders = async () => {
    setLoading(true);
    const savedFolders = await getSavedFolders();
    setFolders(savedFolders);
    setLoading(false);
  };

  const handleAddFolder = useCallback(async () => {
    const newFolder = await addFolder();
    if (newFolder) {
      // Check if it's a root drive (name is "\" or empty)
      if (isRootDriveName(newFolder.name)) {
        // Need to prompt for a custom name
        setRenamingFolder(newFolder);
        setNewFolderName("");
      } else {
        setFolders((prev) => [...prev, newFolder]);
      }
    }
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (renamingFolder && newFolderName.trim()) {
      const updatedFolder = { ...renamingFolder, name: newFolderName.trim() };
      await updateFolderName(renamingFolder.id, newFolderName.trim());
      setFolders((prev) => [...prev, updatedFolder]);
      setRenamingFolder(null);
      setNewFolderName("");
    }
  }, [renamingFolder, newFolderName]);

  const handleCancelRename = useCallback(async () => {
    if (renamingFolder) {
      // Remove the folder since user cancelled naming
      await removeFolder(renamingFolder.id);
    }
    setRenamingFolder(null);
    setNewFolderName("");
  }, [renamingFolder]);

  const handleRemoveFolder = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await removeFolder(id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handlePickFromFolder = useCallback(async (folder: SavedFolder) => {
    setPickingFromFolder(folder.id);

    // Verify permission first
    const hasPermission = await verifyPermission(folder.handle);
    if (!hasPermission) {
      // Permission denied - might need to re-add folder
      setPickingFromFolder(null);
      return;
    }

    const result = await pickFileFromFolder(folder);
    setPickingFromFolder(null);

    if (result) {
      onFileSelected(result.path);
      onClose();
    }
  }, [onFileSelected, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Source Folder"
      size="sm"
    >
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Loading folders...
          </div>
        ) : folders.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-gray-400 dark:text-gray-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              No folders added yet.<br />
              Add a folder to start browsing files.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {folders.map((folder) => (
              <div
                key={folder.id}
                role="button"
                tabIndex={pickingFromFolder !== null ? -1 : 0}
                onClick={() => pickingFromFolder === null && handlePickFromFolder(folder)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && pickingFromFolder === null) {
                    e.preventDefault();
                    handlePickFromFolder(folder);
                  }
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all cursor-pointer",
                  "bg-white dark:bg-gray-800",
                  "border-gray-200 dark:border-gray-700",
                  "hover:border-amber-400 dark:hover:border-amber-500",
                  "hover:bg-amber-50 dark:hover:bg-amber-900/20",
                  "focus:outline-none focus:ring-2 focus:ring-amber-400",
                  pickingFromFolder === folder.id && "opacity-50 cursor-wait",
                  pickingFromFolder !== null && pickingFromFolder !== folder.id && "opacity-50 cursor-not-allowed"
                )}
              >
                <Folder className="h-5 w-5 text-amber-500 dark:text-amber-400 shrink-0" />
                <span className="flex-1 text-left font-medium text-gray-900 dark:text-gray-100 truncate">
                  {folder.name}
                </span>
                <button
                  onClick={(e) => handleRemoveFolder(e, folder.id)}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                  title="Remove folder"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Rename prompt for root drives */}
        {renamingFolder && (
          <div className="p-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              Please name this folder (e.g., "D: Drive", "NAS"):
            </p>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  handleConfirmRename();
                } else if (e.key === 'Escape') {
                  handleCancelRename();
                }
              }}
              placeholder="Enter folder name..."
              autoFocus
              className={cn(
                "w-full px-3 py-2 rounded-md border mb-3",
                "bg-white dark:bg-gray-900",
                "border-gray-300 dark:border-gray-600",
                "text-gray-900 dark:text-gray-100",
                "focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent",
                "text-sm"
              )}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelRename}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmRename}
                disabled={!newFolderName.trim()}
                className="flex-1"
              >
                Add Folder
              </Button>
            </div>
          </div>
        )}

        {/* Add Folder Button */}
        {!renamingFolder && (
          <Button
            variant="outline"
            onClick={handleAddFolder}
            className="w-full"
            disabled={pickingFromFolder !== null}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add new folder...
          </Button>
        )}

        {/* Help text and settings link */}
        <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
          <p>Click a folder to browse and select a file from it.</p>
          <Link
            href="/settings"
            onClick={onClose}
            className="flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          >
            <Settings className="h-3 w-3" />
            Path mappings
          </Link>
        </div>
      </div>
    </Modal>
  );
}
