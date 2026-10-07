"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, Field, IconButton, Input, Select } from "@/components/controls";
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
        <Info className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium mb-1">Setting up shared drives:</p>
          <ol className="text-amber-700 dark:text-amber-300 list-decimal list-inside space-y-1">
            <li>Add a mapping below (e.g., &quot;Center&quot; → &quot;Z:&quot;)</li>
            <li>Click &quot;Grant access&quot; and select your drive folder</li>
            <li>The drive will now appear in file browser dialogs</li>
          </ol>
          <p className="text-amber-700/80 dark:text-amber-300/80 text-xs mt-2">
            This lets you open files shared by others who may use different drive letters.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
          <span className="text-sm text-red-800 dark:text-red-200">{error}</span>
        </div>
      )}

      {/* Current mappings */}
      <div>
        <h3 className="text-sm font-medium text-foreground/80 mb-3">
          Your Drive Mappings
        </h3>
        {mappings.length === 0 ? (
          <div className="text-center py-8 text-foreground/60 border border-dashed border-line rounded-lg">
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
                    "bg-paper",
                    "border-line"
                  )}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {mapping.alias}
                      </span>
                      <span className="text-foreground/40">→</span>
                      <span className="font-mono text-amber-700 dark:text-amber-400">
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
                      <Button
                        size="sm"
                        icon={FolderCheck}
                        iconClassName="text-green-600 dark:text-green-400"
                        onClick={() => handleRevokeAccess(mapping.alias)}
                        title="Click to revoke browser access"
                      >
                        Access granted
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        icon={FolderPlus}
                        iconClassName="text-amber-600 dark:text-amber-400"
                        onClick={() => handleGrantAccess(mapping.alias, mapping.drivePath)}
                        loading={isGranting}
                        title={`Grant browser access to ${mapping.drivePath}`}
                      >
                        {isGranting ? "Waiting..." : "Grant access"}
                      </Button>
                    )}
                  </div>
                  <IconButton
                    icon={Trash2}
                    tone="danger"
                    label={`Remove the ${mapping.alias} mapping`}
                    title="Remove mapping"
                    onClick={() => handleRemoveMapping(mapping.alias)}
                  />
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
            <Field label="Alias" id="path-mapping-alias" className="flex-1">
              <Select
                value={selectedAlias}
                onChange={(e) => setSelectedAlias(e.target.value)}
              >
                <option value="">Select an alias...</option>
                {unmappedAliases.map((alias) => (
                  <option key={alias.id} value={alias.alias}>
                    {alias.alias}
                    {alias.description ? ` - ${alias.description}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Drive letter" id="path-mapping-drive" className="w-24">
              <Input
                type="text"
                value={drivePath}
                onChange={(e) => setDrivePath(e.target.value.toUpperCase())}
                placeholder="Z:"
                maxLength={2}
                className="font-mono uppercase"
              />
            </Field>
            <Button
              variant="primary"
              icon={Plus}
              onClick={handleAddMapping}
              disabled={!selectedAlias || !drivePath}
              className="shrink-0"
            >
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
        <div className="text-center py-4 text-amber-700 dark:text-amber-400 text-sm">
          No aliases have been defined yet. Ask an administrator to create some.
        </div>
      )}

      {onClose && (
        <div className="pt-4 border-t border-line">
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
