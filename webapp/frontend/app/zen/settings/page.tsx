"use client";

import { useZen, ZEN_THEMES, type ZenTheme } from "@/contexts/ZenContext";
import { setZenStatus } from "@/components/zen/ZenStatusBar";

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

  const hasOverrides = Object.keys(themeOverrides).length > 0;

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
        <span style={{ color: "var(--zen-fg)" }}>d</span>=dashboard{" "}
        <span style={{ color: "var(--zen-fg)" }}>n</span>=sessions{" "}
        <span style={{ color: "var(--zen-fg)" }}>?</span>=help | Changes saved automatically
      </div>
    </div>
  );
}
