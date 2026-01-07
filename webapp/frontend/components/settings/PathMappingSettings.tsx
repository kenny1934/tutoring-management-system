"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, AlertCircle, FolderSync, Info, FolderCheck, FolderPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, PathAliasDefinition } from "@/lib/api";
import {
  getPathMappings,
  addPathMapping,
  removePathMapping,
  getSavedFolders,
  addSharedFolder,
  removeFolder,
  type PathMapping,
  type SavedFolder,
} from "@/lib/file-system";

interface PathMappingSettingsProps {
  onClose?: () => void;
}

export function PathMappingSettings({ onClose }: PathMappingSettingsProps) {
  const [aliases, setAliases] = useState<PathAliasDefinition[]>([]);
  const [mappings, setMappings] = useState<PathMapping[]>([]);
  const [folders, setFolders] = useState<SavedFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantingAccess, setGrantingAccess] = useState<string | null>(null);

  // Form state for adding new mapping
  const [selectedAlias, setSelectedAlias] = useState("");
  const [drivePath, setDrivePath] = useState("");

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load aliases from backend, mappings and folders from IndexedDB
      const [aliasesData, mappingsData, foldersData] = await Promise.all([
        api.pathAliases.getAll(),
        getPathMappings(),
        getSavedFolders(),
      ]);
      setAliases(aliasesData);
      setMappings(mappingsData);
      setFolders(foldersData);
    } catch (err) {
      setError("Failed to load data. Please try again.");
      console.error("Failed to load path mapping data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Check if a mapping has folder access granted (case-insensitive)
  const hasFolderAccess = useCallback((alias: string) => {
    return folders.some(f => f.name.toLowerCase() === alias.toLowerCase());
  }, [folders]);

  // Get the folder for a mapping
  const getFolderForAlias = useCallback((alias: string) => {
    return folders.find(f => f.name.toLowerCase() === alias.toLowerCase());
  }, [folders]);

  // Grant folder access for a mapping
  const handleGrantAccess = useCallback(async (alias: string, drivePath: string) => {
    setGrantingAccess(alias);
    setError(null);

    try {
      // Prompt user to select the drive folder
      const folder = await addSharedFolder(alias);
      if (folder) {
        setFolders([...folders, folder]);
      }
    } catch (err) {
      setError(`Failed to grant access for "${alias}". Please try again.`);
      console.error("Failed to grant folder access:", err);
    } finally {
      setGrantingAccess(null);
    }
  }, [folders]);

  // Revoke folder access for a mapping
  const handleRevokeAccess = useCallback(async (alias: string) => {
    const folder = getFolderForAlias(alias);
    if (folder) {
      await removeFolder(folder.id);
      setFolders(folders.filter(f => f.id !== folder.id));
    }
  }, [folders, getFolderForAlias]);

  const handleAddMapping = useCallback(async () => {
    if (!selectedAlias || !drivePath) return;

    // Normalize drive path (ensure it ends with just the colon, uppercase)
    const normalizedDrive = drivePath.toUpperCase().replace(/[:\\\/]+$/, "") + ":";

    // Check if already mapped
    if (mappings.some(m => m.alias === selectedAlias)) {
      setError(`"${selectedAlias}" is already mapped.`);
      return;
    }

    await addPathMapping({ alias: selectedAlias, drivePath: normalizedDrive });
    const newMappings = [...mappings, { alias: selectedAlias, drivePath: normalizedDrive }];
    setMappings(newMappings);

    const aliasToGrant = selectedAlias;
    const driveToGrant = normalizedDrive;

    setSelectedAlias("");
    setDrivePath("");
    setError(null);

    // Prompt to grant folder access
    const shouldGrant = window.confirm(
      `Would you like to grant browser access to ${driveToGrant}\\ now?\n\n` +
      `This allows you to browse and open files from this drive in the exercise modal.`
    );

    if (shouldGrant) {
      await handleGrantAccess(aliasToGrant, driveToGrant);
    }
  }, [selectedAlias, drivePath, mappings, handleGrantAccess]);

  const handleRemoveMapping = useCallback(async (alias: string) => {
    // Also remove folder access if granted
    const folder = getFolderForAlias(alias);
    if (folder) {
      await removeFolder(folder.id);
      setFolders(folders.filter(f => f.id !== folder.id));
    }
    await removePathMapping(alias);
    setMappings(mappings.filter(m => m.alias !== alias));
  }, [mappings, folders, getFolderForAlias]);

  // Get unmapped aliases (aliases that don't have a mapping yet)
  const unmappedAliases = aliases.filter(
    a => !mappings.some(m => m.alias === a.alias)
  );

  if (loading) {
    return (
      <div className="p-6 text-center text-foreground/60">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info box */}
      <div className="flex gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium mb-1">Setting up shared drives:</p>
          <ol className="text-amber-700 dark:text-amber-300 list-decimal list-inside space-y-1">
            <li>Add a mapping below (e.g., &quot;Center&quot; → &quot;Z:&quot;)</li>
            <li>Click &quot;Grant Access&quot; and select your drive folder</li>
            <li>The drive will now appear in file browser dialogs</li>
          </ol>
          <p className="text-amber-700/80 dark:text-amber-300/80 text-xs mt-2">
            This lets you open files shared by others who may use different drive letters.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0" />
          <span className="text-sm text-red-800 dark:text-red-200">{error}</span>
        </div>
      )}

      {/* Current mappings */}
      <div>
        <h3 className="text-sm font-medium text-foreground/80 mb-3">
          Your Drive Mappings
        </h3>
        {mappings.length === 0 ? (
          <div className="text-center py-8 text-foreground/60 border border-dashed border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg">
            <FolderSync className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No mappings configured yet.</p>
            <p className="text-xs mt-1">Add a mapping below to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {mappings.map((mapping) => {
              const aliasInfo = aliases.find(a => a.alias === mapping.alias);
              const hasAccess = hasFolderAccess(mapping.alias);
              const isGranting = grantingAccess === mapping.alias;
              return (
                <div
                  key={mapping.alias}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg border",
                    "bg-[#fef9f3] dark:bg-[#2d2618]",
                    "border-[#e8d4b8] dark:border-[#6b5a4a]"
                  )}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {mapping.alias}
                      </span>
                      <span className="text-foreground/40">→</span>
                      <span className="font-mono text-amber-600 dark:text-amber-400">
                        {mapping.drivePath}
                      </span>
                    </div>
                    {aliasInfo?.description && (
                      <p className="text-xs text-foreground/60 mt-1">
                        {aliasInfo.description}
                      </p>
                    )}
                  </div>
                  {/* Access status and button */}
                  <div className="flex items-center gap-2">
                    {hasAccess ? (
                      <button
                        onClick={() => handleRevokeAccess(mapping.alias)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                        title="Click to revoke browser access"
                      >
                        <FolderCheck className="h-3.5 w-3.5" />
                        <span>Access granted</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleGrantAccess(mapping.alias, mapping.drivePath)}
                        disabled={isGranting}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50"
                        title={`Grant browser access to ${mapping.drivePath}`}
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                        <span>{isGranting ? "Waiting..." : "Grant Access"}</span>
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveMapping(mapping.alias)}
                    className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-foreground/40 hover:text-red-500 transition-colors"
                    title="Remove mapping"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add new mapping */}
      {unmappedAliases.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground/80 mb-3">
            Add New Mapping
          </h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-foreground/60 mb-1">
                Alias
              </label>
              <select
                value={selectedAlias}
                onChange={(e) => setSelectedAlias(e.target.value)}
                className={cn(
                  "w-full px-3 py-2 rounded-lg border",
                  "bg-[#fef9f3] dark:bg-[#2d2618]",
                  "border-[#e8d4b8] dark:border-[#6b5a4a]",
                  "text-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-amber-400"
                )}
              >
                <option value="">Select an alias...</option>
                {unmappedAliases.map((alias) => (
                  <option key={alias.id} value={alias.alias}>
                    {alias.alias}
                    {alias.description ? ` - ${alias.description}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs text-foreground/60 mb-1">
                Drive Letter
              </label>
              <input
                type="text"
                value={drivePath}
                onChange={(e) => setDrivePath(e.target.value.toUpperCase())}
                placeholder="Z:"
                maxLength={2}
                className={cn(
                  "w-full px-3 py-2 rounded-lg border font-mono",
                  "bg-[#fef9f3] dark:bg-[#2d2618]",
                  "border-[#e8d4b8] dark:border-[#6b5a4a]",
                  "text-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-amber-400",
                  "uppercase"
                )}
              />
            </div>
            <Button
              onClick={handleAddMapping}
              disabled={!selectedAlias || !drivePath}
              className="shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          {selectedAlias && (
            <p className="text-xs text-foreground/60 mt-2">
              {aliases.find(a => a.alias === selectedAlias)?.description || ""}
            </p>
          )}
        </div>
      )}

      {unmappedAliases.length === 0 && mappings.length > 0 && (
        <div className="text-center py-4 text-foreground/60 text-sm">
          All available aliases have been mapped.
        </div>
      )}

      {aliases.length === 0 && (
        <div className="text-center py-4 text-amber-600 dark:text-amber-400 text-sm">
          No aliases have been defined yet. Ask an administrator to create some.
        </div>
      )}

      {onClose && (
        <div className="pt-4 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
          <Button variant="outline" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
