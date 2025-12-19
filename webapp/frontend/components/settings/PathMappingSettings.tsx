"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, AlertCircle, FolderSync, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, PathAliasDefinition } from "@/lib/api";
import {
  getPathMappings,
  addPathMapping,
  removePathMapping,
  type PathMapping,
} from "@/lib/file-system";

interface PathMappingSettingsProps {
  onClose?: () => void;
}

export function PathMappingSettings({ onClose }: PathMappingSettingsProps) {
  const [aliases, setAliases] = useState<PathAliasDefinition[]>([]);
  const [mappings, setMappings] = useState<PathMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      // Load aliases from backend and mappings from IndexedDB
      const [aliasesData, mappingsData] = await Promise.all([
        api.pathAliases.getAll(),
        getPathMappings(),
      ]);
      setAliases(aliasesData);
      setMappings(mappingsData);
    } catch (err) {
      setError("Failed to load data. Please try again.");
      console.error("Failed to load path mapping data:", err);
    } finally {
      setLoading(false);
    }
  };

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
    setMappings([...mappings, { alias: selectedAlias, drivePath: normalizedDrive }]);
    setSelectedAlias("");
    setDrivePath("");
    setError(null);
  }, [selectedAlias, drivePath, mappings]);

  const handleRemoveMapping = useCallback(async (alias: string) => {
    await removePathMapping(alias);
    setMappings(mappings.filter(m => m.alias !== alias));
  }, [mappings]);

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
          <p className="font-medium mb-1">How path mapping works:</p>
          <p className="text-amber-700 dark:text-amber-300">
            Map shared drive aliases to your local drive letters. For example, if the
            &quot;Center&quot; drive is mounted as <code className="bg-amber-100 dark:bg-amber-800/50 px-1 rounded">Z:</code> on
            your computer, map &quot;Center&quot; to &quot;Z:&quot;. This allows you to open files
            that others have shared using different drive letters.
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
