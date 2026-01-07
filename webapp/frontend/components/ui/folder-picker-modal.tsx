"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Folder, FolderSync, Plus, X, AlertCircle, Settings, Info } from "lucide-react";
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

// Reusable folder button component
function FolderButton({
  folder,
  isShared,
  disabled,
  isPicking,
  onPick,
  onRemove,
}: {
  folder: SavedFolder;
  isShared: boolean;
  disabled: boolean;
  isPicking: boolean;
  onPick: (folder: SavedFolder) => void;
  onRemove: (e: React.MouseEvent, id: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onPick(folder)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          onPick(folder);
        }
      }}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all cursor-pointer",
        "bg-white dark:bg-gray-800",
        "border-gray-200 dark:border-gray-700",
        "hover:border-amber-400 dark:hover:border-amber-500",
        "hover:bg-amber-50 dark:hover:bg-amber-900/20",
        "focus:outline-none focus:ring-2 focus:ring-amber-400",
        isPicking && "opacity-50 cursor-wait",
        disabled && !isPicking && "opacity-50 cursor-not-allowed"
      )}
    >
      {isShared ? (
        <FolderSync className="h-5 w-5 text-green-500 dark:text-green-400 shrink-0" />
      ) : (
        <Folder className="h-5 w-5 text-amber-500 dark:text-amber-400 shrink-0" />
      )}
      <span className="flex-1 text-left font-medium text-gray-900 dark:text-gray-100 truncate">
        {folder.name}
      </span>
      {!isShared && (
        <button
          onClick={(e) => onRemove(e, folder.id)}
          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors shrink-0"
          title="Remove folder"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
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
  const [showPersonalWarning, setShowPersonalWarning] = useState(false);

  // Separate shared drives from personal folders
  const sharedFolders = useMemo(
    () => folders.filter((f) => f.isShared === true),
    [folders]
  );
  const personalFolders = useMemo(
    () => folders.filter((f) => f.isShared !== true),
    [folders]
  );

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

  const handleAddPersonalFolder = useCallback(() => {
    setShowPersonalWarning(true);
  }, []);

  const handleConfirmAddPersonal = useCallback(async () => {
    setShowPersonalWarning(false);
    const newFolder = await addFolder();
    if (newFolder) {
      // Check if it's a root drive (name is "\" or empty)
      if (isRootDriveName(newFolder.name)) {
        // Need to prompt for a custom name
        setRenamingFolder(newFolder);
        setNewFolderName("");
      } else {
        // Mark as personal folder (not shared)
        const personalFolder = { ...newFolder, isShared: false };
        setFolders((prev) => [...prev, personalFolder]);
      }
    }
  }, []);

  const handleCancelAddPersonal = useCallback(() => {
    setShowPersonalWarning(false);
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
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Loading folders...
          </div>
        ) : (
          <>
            {/* Shared Drives Section */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Shared Drives
              </h3>
              {sharedFolders.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-center">
                  <FolderSync className="h-8 w-8 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    No shared drives configured.
                  </p>
                  <Link
                    href="/settings"
                    onClick={onClose}
                    className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Set up in Settings → Path Mappings
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {sharedFolders.map((folder) => (
                    <FolderButton
                      key={folder.id}
                      folder={folder}
                      isShared
                      disabled={pickingFromFolder !== null}
                      isPicking={pickingFromFolder === folder.id}
                      onPick={handlePickFromFolder}
                      onRemove={handleRemoveFolder}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Personal Folders Section */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Personal Folders
                <span className="font-normal normal-case ml-1">(this computer only)</span>
              </h3>
              {personalFolders.length === 0 && !showPersonalWarning && !renamingFolder ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                  No personal folders added.
                </p>
              ) : (
                <div className="space-y-2">
                  {personalFolders.map((folder) => (
                    <FolderButton
                      key={folder.id}
                      folder={folder}
                      isShared={false}
                      disabled={pickingFromFolder !== null}
                      isPicking={pickingFromFolder === folder.id}
                      onPick={handlePickFromFolder}
                      onRemove={handleRemoveFolder}
                    />
                  ))}
                </div>
              )}

              {/* Personal folder warning */}
              {showPersonalWarning && (
                <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
                  <div className="flex gap-2 mb-3">
                    <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Personal folders are only accessible on this computer. Files from personal folders cannot be shared with others.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelAddPersonal}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleConfirmAddPersonal}
                      className="flex-1"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {/* Rename prompt for root drives */}
              {renamingFolder && (
                <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                    Name this personal folder:
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
                    placeholder="e.g., My Documents, Downloads..."
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

              {/* Add Personal Folder Button */}
              {!renamingFolder && !showPersonalWarning && (
                <Button
                  variant="outline"
                  onClick={handleAddPersonalFolder}
                  className="w-full mt-2"
                  disabled={pickingFromFolder !== null}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add personal folder...
                </Button>
              )}
            </div>
          </>
        )}

        {/* Help text */}
        <div className="text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-200 dark:border-gray-700">
          Click a folder to browse and select a file from it.
        </div>
      </div>
    </Modal>
  );
}
