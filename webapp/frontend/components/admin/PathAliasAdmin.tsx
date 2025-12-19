"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, AlertCircle, FolderCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, PathAliasDefinition } from "@/lib/api";

interface PathAliasAdminProps {
  onClose?: () => void;
}

export function PathAliasAdmin({ onClose }: PathAliasAdminProps) {
  const [aliases, setAliases] = useState<PathAliasDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state for adding new alias
  const [newAlias, setNewAlias] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // Load aliases on mount
  useEffect(() => {
    loadAliases();
  }, []);

  const loadAliases = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.pathAliases.getAll();
      setAliases(data);
    } catch (err) {
      setError("Failed to load aliases. Please try again.");
      console.error("Failed to load path aliases:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAlias = useCallback(async () => {
    if (!newAlias.trim()) return;

    // Validate alias name (alphanumeric, no spaces)
    const aliasName = newAlias.trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(aliasName)) {
      setError("Alias must start with a letter and contain only letters, numbers, hyphens, and underscores.");
      return;
    }

    // Check if already exists
    if (aliases.some(a => a.alias.toLowerCase() === aliasName.toLowerCase())) {
      setError(`Alias "${aliasName}" already exists.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await api.pathAliases.create(aliasName, newDescription.trim() || undefined);
      setAliases([...aliases, created]);
      setNewAlias("");
      setNewDescription("");
    } catch (err) {
      setError("Failed to create alias. Please try again.");
      console.error("Failed to create path alias:", err);
    } finally {
      setSaving(false);
    }
  }, [newAlias, newDescription, aliases]);

  const handleDeleteAlias = useCallback(async (id: number, alias: string) => {
    if (!confirm(`Are you sure you want to delete the alias "${alias}"? This cannot be undone.`)) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.pathAliases.delete(id);
      setAliases(aliases.filter(a => a.id !== id));
    } catch (err) {
      setError("Failed to delete alias. Please try again.");
      console.error("Failed to delete path alias:", err);
    } finally {
      setSaving(false);
    }
  }, [aliases]);

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0" />
          <span className="text-sm text-red-800 dark:text-red-200">{error}</span>
        </div>
      )}

      {/* Current aliases */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Defined Aliases
        </h3>
        {aliases.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <FolderCog className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No aliases defined yet.</p>
            <p className="text-xs mt-1">Create your first alias below.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {aliases.map((alias) => (
              <div
                key={alias.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg border",
                  "bg-white dark:bg-gray-800",
                  "border-gray-200 dark:border-gray-700"
                )}
              >
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {alias.alias}
                  </span>
                  {alias.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {alias.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteAlias(alias.id, alias.alias)}
                  disabled={saving}
                  className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                  title="Delete alias"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add new alias */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Add New Alias
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Alias Name (e.g., &quot;Center&quot;, &quot;Archive&quot;)
            </label>
            <input
              type="text"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder="Center"
              className={cn(
                "w-full px-3 py-2 rounded-lg border",
                "bg-white dark:bg-gray-800",
                "border-gray-300 dark:border-gray-600",
                "text-gray-900 dark:text-gray-100",
                "focus:outline-none focus:ring-2 focus:ring-amber-400"
              )}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Teaching center shared network drive"
              className={cn(
                "w-full px-3 py-2 rounded-lg border",
                "bg-white dark:bg-gray-800",
                "border-gray-300 dark:border-gray-600",
                "text-gray-900 dark:text-gray-100",
                "focus:outline-none focus:ring-2 focus:ring-amber-400"
              )}
            />
          </div>
          <Button
            onClick={handleAddAlias}
            disabled={!newAlias.trim() || saving}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-1" />
            {saving ? "Adding..." : "Add Alias"}
          </Button>
        </div>
      </div>

      {onClose && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
