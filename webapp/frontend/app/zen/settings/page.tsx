"use client";

import { useState, useEffect, useCallback } from "react";
import { useZen, ZEN_THEMES, type ZenTheme } from "@/contexts/ZenContext";
import { useRole } from "@/contexts/RoleContext";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { setZenStatus } from "@/components/zen/ZenStatusBar";
import { api, type PathAliasDefinition } from "@/lib/api";
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

// Color key labels for display
const COLOR_LABELS: Record<keyof ZenTheme["colors"], string> = {
  background: "Background",
  foreground: "Foreground",
  dim: "Dim Text",
  accent: "Accent",
  cursor: "Cursor",
  success: "Success",
  error: "Error",
  warning: "Warning",
  border: "Border",
};

function ColorPicker({
  label,
  colorKey,
  value,
  baseValue,
  onChange,
  onReset,
}: {
  label: string;
  colorKey: keyof ZenTheme["colors"];
  value: string;
  baseValue: string;
  onChange: (key: keyof ZenTheme["colors"], value: string) => void;
  onReset: (key: keyof ZenTheme["colors"]) => void;
}) {
  const isOverridden = value !== baseValue;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "8px 0",
        borderBottom: "1px dotted var(--zen-border)",
      }}
    >
      <span
        style={{
          width: "100px",
          color: "var(--zen-dim)",
          fontSize: "12px",
        }}
      >
        {label}
      </span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(colorKey, e.target.value)}
        style={{
          width: "40px",
          height: "24px",
          padding: 0,
          border: "1px solid var(--zen-border)",
          borderRadius: "2px",
          cursor: "pointer",
          backgroundColor: "transparent",
        }}
      />
      <span
        style={{
          fontFamily: "monospace",
          fontSize: "11px",
          color: isOverridden ? "var(--zen-accent)" : "var(--zen-dim)",
        }}
      >
        {value}
      </span>
      {isOverridden && (
        <button
          onClick={() => onReset(colorKey)}
          style={{
            background: "none",
            border: "1px solid var(--zen-border)",
            color: "var(--zen-dim)",
            padding: "2px 8px",
            fontSize: "10px",
            cursor: "pointer",
            borderRadius: "2px",
          }}
        >
          Reset
        </button>
      )}
    </div>
  );
}

function ThemeCard({
  themeId,
  theme,
  isActive,
  onClick,
}: {
  themeId: string;
  theme: ZenTheme;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "12px",
        backgroundColor: theme.colors.background,
        border: isActive
          ? `2px solid ${theme.colors.accent}`
          : `1px solid ${theme.colors.border}`,
        borderRadius: "4px",
        cursor: "pointer",
        textAlign: "left",
        minWidth: "140px",
      }}
    >
      <div
        style={{
          color: theme.colors.accent,
          fontWeight: "bold",
          fontSize: "12px",
          marginBottom: "4px",
          textShadow: theme.glow.enabled
            ? `0 0 5px ${theme.glow.color}`
            : "none",
        }}
      >
        {theme.name}
      </div>
      <div
        style={{
          display: "flex",
          gap: "4px",
          marginTop: "8px",
        }}
      >
        {["foreground", "accent", "success", "error", "warning"].map((key) => (
          <div
            key={key}
            style={{
              width: "16px",
              height: "16px",
              backgroundColor: theme.colors[key as keyof ZenTheme["colors"]],
              borderRadius: "2px",
              border: `1px solid ${theme.colors.border}`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          color: theme.colors.dim,
          fontSize: "10px",
          marginTop: "8px",
        }}
      >
        {theme.category}
      </div>
    </button>
  );
}

function GlowSlider({
  enabled,
  intensity,
  onToggle,
  onIntensityChange,
}: {
  enabled: boolean;
  intensity: number;
  onToggle: (enabled: boolean) => void;
  onIntensityChange: (intensity: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          style={{ cursor: "pointer" }}
        />
        <span style={{ color: "var(--zen-fg)", fontSize: "12px" }}>
          Enable Glow
        </span>
      </label>
      {enabled && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
            Intensity:
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={intensity * 100}
            onChange={(e) => onIntensityChange(Number(e.target.value) / 100)}
            style={{ width: "100px", cursor: "pointer" }}
          />
          <span
            style={{
              color: "var(--zen-dim)",
              fontSize: "11px",
              minWidth: "40px",
            }}
          >
            {Math.round(intensity * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

function LivePreview() {
  return (
    <div
      style={{
        padding: "16px",
        backgroundColor: "var(--zen-bg)",
        border: "1px solid var(--zen-border)",
        borderRadius: "4px",
      }}
    >
      <div
        style={{
          color: "var(--zen-accent)",
          fontWeight: "bold",
          fontSize: "14px",
          textShadow: "var(--zen-glow)",
          marginBottom: "8px",
        }}
      >
        LIVE PREVIEW
      </div>
      <div style={{ color: "var(--zen-dim)", marginBottom: "12px" }}>
        {"─".repeat(20)}
      </div>
      <div style={{ color: "var(--zen-fg)", marginBottom: "4px" }}>
        Normal text sample
      </div>
      <div style={{ color: "var(--zen-dim)", marginBottom: "4px" }}>
        Dim text sample
      </div>
      <div
        style={{
          color: "var(--zen-accent)",
          textShadow: "var(--zen-glow)",
          marginBottom: "8px",
        }}
      >
        Accent text with glow
      </div>
      <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
        <span style={{ color: "var(--zen-success)" }}>Success</span>
        <span style={{ color: "var(--zen-error)" }}>Error</span>
        <span style={{ color: "var(--zen-warning)" }}>Warning</span>
      </div>
    </div>
  );
}

export default function ZenSettingsPage() {
  const {
    theme,
    effectiveTheme,
    themeId,
    themeOverrides,
    setTheme,
    setThemeOverride,
    clearThemeOverrides,
    glowEnabled,
    glowIntensity,
    setGlowEnabled,
    setGlowIntensity,
  } = useZen();

  const { viewMode } = useRole();
  const isAdmin = viewMode === "center-view";

  // Disable global Tab section cycling - settings has its own tab navigation
  const { setDisableSectionCycling } = useZenKeyboardFocus();
  useEffect(() => {
    setDisableSectionCycling(true);
    return () => setDisableSectionCycling(false);
  }, [setDisableSectionCycling]);

  // Tab state
  type SettingsTab = "appearance" | "filesystem";
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");

  const hasOverrides = Object.keys(themeOverrides).length > 0;

  // Path Mapping state
  const [aliases, setAliases] = useState<PathAliasDefinition[]>([]);
  const [mappings, setMappings] = useState<PathMapping[]>([]);
  const [folders, setFolders] = useState<SavedFolder[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(true);
  const [mappingCursor, setMappingCursor] = useState(0);
  const [addingMapping, setAddingMapping] = useState(false);
  const [newAlias, setNewAlias] = useState("");
  const [newDrive, setNewDrive] = useState("");
  const [grantingAlias, setGrantingAlias] = useState<string | null>(null);

  // Load path mapping data
  useEffect(() => {
    const loadMappingData = async () => {
      setMappingsLoading(true);
      try {
        const [aliasesData, mappingsData, foldersData] = await Promise.all([
          api.pathAliases.getAll(),
          getPathMappings(),
          getSavedFolders(),
        ]);
        setAliases(aliasesData);
        setMappings(mappingsData);
        setFolders(foldersData);
      } catch (err) {
        console.error("Failed to load path mapping data:", err);
      } finally {
        setMappingsLoading(false);
      }
    };
    loadMappingData();
  }, []);

  // Check if a mapping has folder access granted
  const hasFolderAccess = useCallback((alias: string) => {
    return folders.some(f => f.name.toLowerCase() === alias.toLowerCase());
  }, [folders]);

  // Get folder for alias
  const getFolderForAlias = useCallback((alias: string) => {
    return folders.find(f => f.name.toLowerCase() === alias.toLowerCase());
  }, [folders]);

  // Grant folder access for a mapping
  const handleGrantAccess = useCallback(async (alias: string) => {
    setGrantingAlias(alias);
    try {
      const folder = await addSharedFolder(alias);
      if (folder) {
        setFolders(prev => [...prev, folder]);
        setZenStatus(`Access granted for ${alias}`, "success");
      }
    } catch (err) {
      setZenStatus(`Failed to grant access: ${err}`, "error");
    } finally {
      setGrantingAlias(null);
    }
  }, []);

  // Revoke folder access
  const handleRevokeAccess = useCallback(async (alias: string) => {
    const folder = folders.find(f => f.name.toLowerCase() === alias.toLowerCase());
    if (folder) {
      await removeFolder(folder.id);
      setFolders(prev => prev.filter(f => f.id !== folder.id));
      setZenStatus(`Access revoked for ${alias}`, "info");
    }
  }, [folders]);

  // Add a new mapping
  const handleAddMapping = useCallback(async () => {
    if (!newAlias || !newDrive) return;
    const normalizedDrive = newDrive.toUpperCase().replace(/[:\\\/]+$/, "") + ":";

    if (mappings.some(m => m.alias === newAlias)) {
      setZenStatus(`"${newAlias}" is already mapped`, "error");
      return;
    }

    await addPathMapping({ alias: newAlias, drivePath: normalizedDrive });
    setMappings(prev => [...prev, { alias: newAlias, drivePath: normalizedDrive }]);
    setZenStatus(`Added mapping: ${newAlias} → ${normalizedDrive}`, "success");

    const aliasToGrant = newAlias;
    setNewAlias("");
    setNewDrive("");
    setAddingMapping(false);

    // Prompt to grant access
    if (window.confirm(`Grant browser access to ${normalizedDrive}\\ now?`)) {
      await handleGrantAccess(aliasToGrant);
    }
  }, [newAlias, newDrive, mappings, handleGrantAccess]);

  // Remove a mapping
  const handleRemoveMapping = useCallback(async (alias: string) => {
    if (!window.confirm(`Remove mapping "${alias}"?`)) return;

    // Also remove folder access if granted
    const folder = getFolderForAlias(alias);
    if (folder) {
      await removeFolder(folder.id);
      setFolders(prev => prev.filter(f => f.id !== folder.id));
    }
    await removePathMapping(alias);
    setMappings(prev => prev.filter(m => m.alias !== alias));
    if (mappingCursor >= mappings.length - 1) {
      setMappingCursor(Math.max(0, mappings.length - 2));
    }
    setZenStatus(`Removed mapping: ${alias}`, "info");
  }, [getFolderForAlias, mappings.length, mappingCursor]);

  // Get unmapped aliases
  const unmappedAliases = aliases.filter(
    a => !mappings.some(m => m.alias === a.alias)
  );

  // Admin: Create new path alias
  const [newAliasName, setNewAliasName] = useState("");
  const [newAliasDesc, setNewAliasDesc] = useState("");
  const [creatingAlias, setCreatingAlias] = useState(false);

  const handleCreateAlias = useCallback(async () => {
    if (!newAliasName.trim()) return;
    const aliasName = newAliasName.trim();

    // Validate alias name
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(aliasName)) {
      setZenStatus("Alias must start with letter, contain only letters/numbers/hyphens/underscores", "error");
      return;
    }

    if (aliases.some(a => a.alias.toLowerCase() === aliasName.toLowerCase())) {
      setZenStatus(`Alias "${aliasName}" already exists`, "error");
      return;
    }

    setCreatingAlias(true);
    try {
      const created = await api.pathAliases.create(aliasName, newAliasDesc.trim() || undefined);
      setAliases(prev => [...prev, created]);
      setNewAliasName("");
      setNewAliasDesc("");
      setZenStatus(`Created alias: ${aliasName}`, "success");
    } catch (err) {
      setZenStatus(`Failed to create alias: ${err}`, "error");
    } finally {
      setCreatingAlias(false);
    }
  }, [newAliasName, newAliasDesc, aliases]);

  const handleDeleteAlias = useCallback(async (id: number, alias: string) => {
    if (!window.confirm(`Delete alias "${alias}"? This cannot be undone.`)) return;

    try {
      await api.pathAliases.delete(id);
      setAliases(prev => prev.filter(a => a.id !== id));
      // Also remove mapping if exists
      const mapping = mappings.find(m => m.alias === alias);
      if (mapping) {
        await removePathMapping(alias);
        setMappings(prev => prev.filter(m => m.alias !== alias));
      }
      setZenStatus(`Deleted alias: ${alias}`, "info");
    } catch (err) {
      setZenStatus(`Failed to delete alias: ${err}`, "error");
    }
  }, [mappings]);

  const handleResetColor = (key: keyof ZenTheme["colors"]) => {
    // Remove single override by setting all others
    const newOverrides = { ...themeOverrides };
    delete newOverrides[key];
    // Clear all and re-set remaining
    clearThemeOverrides();
    Object.entries(newOverrides).forEach(([k, v]) => {
      setThemeOverride(k as keyof ZenTheme["colors"], v);
    });
  };

  const handleResetAll = () => {
    clearThemeOverrides();
    setZenStatus("All color overrides cleared", "success");
  };

  // Tab keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case "1":
          e.preventDefault();
          setActiveTab("appearance");
          setZenStatus("Appearance settings", "info");
          break;
        case "2":
          e.preventDefault();
          setActiveTab("filesystem");
          setZenStatus("File System settings", "info");
          break;
        case "h":
        case "ArrowLeft":
          if (activeTab !== "appearance") {
            e.preventDefault();
            setActiveTab("appearance");
            setZenStatus("Appearance settings", "info");
          }
          break;
        case "l":
        case "ArrowRight":
          if (activeTab !== "filesystem") {
            e.preventDefault();
            setActiveTab("filesystem");
            setZenStatus("File System settings", "info");
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab]);

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          marginBottom: "24px",
          borderBottom: "1px solid var(--zen-border)",
          paddingBottom: "8px",
        }}
      >
        <h1
          style={{
            fontSize: "16px",
            fontWeight: "bold",
            textTransform: "uppercase",
            color: "var(--zen-fg)",
            textShadow: "var(--zen-glow)",
            margin: 0,
          }}
        >
          SETTINGS
        </h1>
      </div>

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: "24px", marginBottom: "24px" }}>
        {/* Appearance Tab */}
        <button
          onClick={() => setActiveTab("appearance")}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "appearance"
              ? "2px solid var(--zen-accent)"
              : "2px solid transparent",
            padding: "8px 0",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "13px",
            color: activeTab === "appearance" ? "var(--zen-accent)" : "var(--zen-dim)",
            textShadow: activeTab === "appearance" ? "var(--zen-glow)" : "none",
          }}
        >
          [1] Appearance
        </button>
        {/* File System Tab */}
        <button
          onClick={() => setActiveTab("filesystem")}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "filesystem"
              ? "2px solid var(--zen-accent)"
              : "2px solid transparent",
            padding: "8px 0",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "13px",
            color: activeTab === "filesystem" ? "var(--zen-accent)" : "var(--zen-dim)",
            textShadow: activeTab === "filesystem" ? "var(--zen-glow)" : "none",
          }}
        >
          [2] File System
        </button>
      </div>

      {/* Appearance Tab Content */}
      {activeTab === "appearance" && (
        <>
          {/* Theme Selection */}
      <section style={{ marginBottom: "32px" }}>
        <h2
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            color: "var(--zen-accent)",
            marginBottom: "8px",
            textShadow: "var(--zen-glow)",
          }}
        >
          THEME
        </h2>
        <div style={{ color: "var(--zen-dim)", marginBottom: "12px" }}>
          {"─".repeat(12)}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          {Object.entries(ZEN_THEMES).map(([id, themeOption]) => (
            <ThemeCard
              key={id}
              themeId={id}
              theme={themeOption}
              isActive={themeId === id}
              onClick={() => {
                setTheme(id);
                setZenStatus(`Theme changed to ${themeOption.name}`, "success");
              }}
            />
          ))}
        </div>
      </section>

      {/* Glow Settings */}
      <section style={{ marginBottom: "32px" }}>
        <h2
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            color: "var(--zen-accent)",
            marginBottom: "8px",
            textShadow: "var(--zen-glow)",
          }}
        >
          GLOW EFFECT
        </h2>
        <div style={{ color: "var(--zen-dim)", marginBottom: "12px" }}>
          {"─".repeat(12)}
        </div>
        <GlowSlider
          enabled={glowEnabled}
          intensity={glowIntensity}
          onToggle={setGlowEnabled}
          onIntensityChange={setGlowIntensity}
        />
      </section>

      {/* Color Customization */}
      <section style={{ marginBottom: "32px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <h2
            style={{
              fontSize: "14px",
              fontWeight: "bold",
              color: "var(--zen-accent)",
              textShadow: "var(--zen-glow)",
              margin: 0,
            }}
          >
            COLOR OVERRIDES
          </h2>
          {hasOverrides && (
            <button
              onClick={handleResetAll}
              style={{
                background: "none",
                border: "1px solid var(--zen-error)",
                color: "var(--zen-error)",
                padding: "4px 12px",
                fontSize: "11px",
                cursor: "pointer",
                borderRadius: "2px",
              }}
            >
              Reset All
            </button>
          )}
        </div>
        <div style={{ color: "var(--zen-dim)", marginBottom: "12px" }}>
          {"─".repeat(16)}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0 24px",
          }}
        >
          {(Object.keys(COLOR_LABELS) as Array<keyof ZenTheme["colors"]>).map(
            (key) => (
              <ColorPicker
                key={key}
                label={COLOR_LABELS[key]}
                colorKey={key}
                value={effectiveTheme.colors[key]}
                baseValue={theme.colors[key]}
                onChange={setThemeOverride}
                onReset={handleResetColor}
              />
            )
          )}
        </div>
      </section>

      {/* Live Preview */}
      <section style={{ marginBottom: "32px" }}>
        <h2
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            color: "var(--zen-accent)",
            marginBottom: "8px",
            textShadow: "var(--zen-glow)",
          }}
        >
          PREVIEW
        </h2>
        <div style={{ color: "var(--zen-dim)", marginBottom: "12px" }}>
          {"─".repeat(12)}
        </div>
        <LivePreview />
      </section>
        </>
      )}

      {/* File System Tab Content */}
      {activeTab === "filesystem" && (
        <>
          {/* Path Mappings */}
      <section style={{ marginBottom: "32px" }}>
        <h2
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            color: "var(--zen-accent)",
            marginBottom: "8px",
            textShadow: "var(--zen-glow)",
          }}
        >
          PATH MAPPINGS
        </h2>
        <div style={{ color: "var(--zen-dim)", marginBottom: "12px" }}>
          {"─".repeat(14)}
        </div>

        {mappingsLoading ? (
          <div style={{ color: "var(--zen-dim)", fontSize: "12px" }}>Loading...</div>
        ) : (
          <>
            {/* Current Mappings */}
            {mappings.length === 0 ? (
              <div style={{ color: "var(--zen-dim)", fontSize: "12px", marginBottom: "12px" }}>
                No drive mappings configured.
              </div>
            ) : (
              <div style={{ marginBottom: "16px" }}>
                {mappings.map((mapping, idx) => {
                  const hasAccess = hasFolderAccess(mapping.alias);
                  const isGranting = grantingAlias === mapping.alias;
                  const aliasInfo = aliases.find(a => a.alias === mapping.alias);
                  return (
                    <div
                      key={mapping.alias}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "6px 8px",
                        backgroundColor: idx === mappingCursor ? "var(--zen-selection)" : "transparent",
                        borderLeft: idx === mappingCursor ? "2px solid var(--zen-accent)" : "2px solid transparent",
                      }}
                    >
                      <span style={{ color: "var(--zen-fg)", minWidth: "120px", fontSize: "12px" }}>
                        {mapping.alias}
                      </span>
                      <span style={{ color: "var(--zen-dim)", fontSize: "12px" }}>→</span>
                      <span style={{ color: "var(--zen-accent)", fontFamily: "monospace", fontSize: "12px", minWidth: "40px" }}>
                        {mapping.drivePath}
                      </span>
                      {/* Access status */}
                      <button
                        onClick={() => hasAccess ? handleRevokeAccess(mapping.alias) : handleGrantAccess(mapping.alias)}
                        disabled={isGranting}
                        style={{
                          background: "none",
                          border: `1px solid ${hasAccess ? "var(--zen-success)" : "var(--zen-warning)"}`,
                          color: hasAccess ? "var(--zen-success)" : "var(--zen-warning)",
                          padding: "2px 8px",
                          fontSize: "10px",
                          cursor: isGranting ? "wait" : "pointer",
                          borderRadius: "2px",
                          opacity: isGranting ? 0.5 : 1,
                        }}
                        title={hasAccess ? "Click to revoke access" : "Click to grant browser access"}
                      >
                        {isGranting ? "..." : hasAccess ? "✓ Access" : "Grant"}
                      </button>
                      {/* Delete button */}
                      <button
                        onClick={() => handleRemoveMapping(mapping.alias)}
                        style={{
                          background: "none",
                          border: "1px solid var(--zen-border)",
                          color: "var(--zen-dim)",
                          padding: "2px 6px",
                          fontSize: "10px",
                          cursor: "pointer",
                          borderRadius: "2px",
                        }}
                        title="Remove mapping"
                      >
                        x
                      </button>
                      {/* Description */}
                      {aliasInfo?.description && (
                        <span style={{ color: "var(--zen-dim)", fontSize: "10px", marginLeft: "auto" }}>
                          {aliasInfo.description}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Mapping Form */}
            {addingMapping ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px",
                  border: "1px solid var(--zen-accent)",
                  backgroundColor: "var(--zen-selection)",
                }}
              >
                <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>Alias:</span>
                <select
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  style={{
                    backgroundColor: "var(--zen-bg)",
                    border: "1px solid var(--zen-border)",
                    color: "var(--zen-fg)",
                    padding: "4px 8px",
                    fontSize: "12px",
                    fontFamily: "inherit",
                  }}
                >
                  <option value="">Select...</option>
                  {unmappedAliases.map((alias) => (
                    <option key={alias.id} value={alias.alias}>
                      {alias.alias}
                    </option>
                  ))}
                </select>
                <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>Drive:</span>
                <input
                  type="text"
                  value={newDrive}
                  onChange={(e) => setNewDrive(e.target.value.toUpperCase())}
                  placeholder="Z:"
                  maxLength={2}
                  style={{
                    backgroundColor: "var(--zen-bg)",
                    border: "1px solid var(--zen-border)",
                    color: "var(--zen-fg)",
                    padding: "4px 8px",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    width: "50px",
                    textTransform: "uppercase",
                  }}
                />
                <button
                  onClick={handleAddMapping}
                  disabled={!newAlias || !newDrive}
                  style={{
                    background: "none",
                    border: "1px solid var(--zen-accent)",
                    color: "var(--zen-accent)",
                    padding: "4px 12px",
                    fontSize: "11px",
                    cursor: !newAlias || !newDrive ? "not-allowed" : "pointer",
                    borderRadius: "2px",
                    opacity: !newAlias || !newDrive ? 0.5 : 1,
                  }}
                >
                  Add
                </button>
                <button
                  onClick={() => { setAddingMapping(false); setNewAlias(""); setNewDrive(""); }}
                  style={{
                    background: "none",
                    border: "1px solid var(--zen-border)",
                    color: "var(--zen-dim)",
                    padding: "4px 8px",
                    fontSize: "11px",
                    cursor: "pointer",
                    borderRadius: "2px",
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              unmappedAliases.length > 0 && (
                <button
                  onClick={() => setAddingMapping(true)}
                  style={{
                    background: "none",
                    border: "1px solid var(--zen-border)",
                    color: "var(--zen-dim)",
                    padding: "4px 12px",
                    fontSize: "11px",
                    cursor: "pointer",
                    borderRadius: "2px",
                  }}
                >
                  + Add Mapping
                </button>
              )
            )}

            {/* No aliases defined - only show for non-admin */}
            {aliases.length === 0 && !isAdmin && (
              <div style={{ color: "var(--zen-warning)", fontSize: "11px", marginTop: "8px" }}>
                No aliases defined. Ask an administrator to create path aliases.
              </div>
            )}

            {/* All mapped message */}
            {unmappedAliases.length === 0 && mappings.length > 0 && !addingMapping && (
              <div style={{ color: "var(--zen-dim)", fontSize: "11px", marginTop: "8px" }}>
                All available aliases are mapped.
              </div>
            )}
          </>
        )}
      </section>

      {/* Path Aliases Admin - only visible to admins */}
      {isAdmin && (
        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "14px",
              fontWeight: "bold",
              color: "var(--zen-accent)",
              marginBottom: "8px",
              textShadow: "var(--zen-glow)",
            }}
          >
            PATH ALIASES <span style={{ color: "var(--zen-warning)", fontSize: "11px" }}>(Admin)</span>
          </h2>
          <div style={{ color: "var(--zen-dim)", marginBottom: "12px" }}>
            {"─".repeat(20)}
          </div>

          {/* Current Aliases List */}
          {aliases.length === 0 ? (
            <div style={{ color: "var(--zen-dim)", fontSize: "12px", marginBottom: "16px" }}>
              No aliases defined. Create your first alias below.
            </div>
          ) : (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: "var(--zen-dim)", fontSize: "11px", marginBottom: "8px" }}>
                Defined aliases:
              </div>
              {aliases.map((alias) => (
                <div
                  key={alias.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "6px 8px",
                    borderBottom: "1px dotted var(--zen-border)",
                  }}
                >
                  <span style={{ color: "var(--zen-fg)", minWidth: "120px", fontSize: "12px" }}>
                    {alias.alias}
                  </span>
                  <span style={{ color: "var(--zen-dim)", fontSize: "11px", flex: 1 }}>
                    {alias.description || "—"}
                  </span>
                  <button
                    onClick={() => handleDeleteAlias(alias.id, alias.alias)}
                    disabled={creatingAlias}
                    style={{
                      background: "none",
                      border: "1px solid var(--zen-border)",
                      color: "var(--zen-dim)",
                      padding: "2px 8px",
                      fontSize: "10px",
                      cursor: creatingAlias ? "not-allowed" : "pointer",
                      borderRadius: "2px",
                      opacity: creatingAlias ? 0.5 : 1,
                    }}
                    title="Delete alias"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add New Alias Form */}
          <div
            style={{
              padding: "12px",
              border: "1px solid var(--zen-border)",
              backgroundColor: "var(--zen-selection)",
            }}
          >
            <div style={{ color: "var(--zen-dim)", fontSize: "11px", marginBottom: "8px" }}>
              Add New Alias:
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>Name:</span>
              <input
                type="text"
                value={newAliasName}
                onChange={(e) => setNewAliasName(e.target.value)}
                placeholder="Center"
                style={{
                  backgroundColor: "var(--zen-bg)",
                  border: "1px solid var(--zen-border)",
                  color: "var(--zen-fg)",
                  padding: "4px 8px",
                  fontSize: "12px",
                  fontFamily: "inherit",
                  width: "100px",
                }}
              />
              <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>Desc:</span>
              <input
                type="text"
                value={newAliasDesc}
                onChange={(e) => setNewAliasDesc(e.target.value)}
                placeholder="Description (optional)"
                style={{
                  backgroundColor: "var(--zen-bg)",
                  border: "1px solid var(--zen-border)",
                  color: "var(--zen-fg)",
                  padding: "4px 8px",
                  fontSize: "12px",
                  fontFamily: "inherit",
                  flex: 1,
                  minWidth: "150px",
                }}
              />
              <button
                onClick={handleCreateAlias}
                disabled={!newAliasName.trim() || creatingAlias}
                style={{
                  background: "none",
                  border: "1px solid var(--zen-accent)",
                  color: "var(--zen-accent)",
                  padding: "4px 12px",
                  fontSize: "11px",
                  cursor: !newAliasName.trim() || creatingAlias ? "not-allowed" : "pointer",
                  borderRadius: "2px",
                  opacity: !newAliasName.trim() || creatingAlias ? 0.5 : 1,
                }}
              >
                {creatingAlias ? "..." : "Add"}
              </button>
            </div>
          </div>
        </section>
      )}
        </>
      )}

      {/* Navigation hint */}
      <div
        style={{
          marginTop: "32px",
          paddingTop: "16px",
          borderTop: "1px solid var(--zen-border)",
          color: "var(--zen-dim)",
          fontSize: "12px",
        }}
      >
        <span style={{ color: "var(--zen-fg)" }}>1</span>/<span style={{ color: "var(--zen-fg)" }}>2</span> tabs{" "}
        <span style={{ color: "var(--zen-fg)" }}>h</span>/<span style={{ color: "var(--zen-fg)" }}>l</span> navigate |{" "}
        <span style={{ color: "var(--zen-fg)" }}>d</span>=dashboard{" "}
        <span style={{ color: "var(--zen-fg)" }}>n</span>=sessions{" "}
        <span style={{ color: "var(--zen-fg)" }}>?</span>=help | Auto-save
      </div>
    </div>
  );
}
