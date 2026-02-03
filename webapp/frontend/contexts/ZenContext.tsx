"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from "react";

// Theme definitions
export interface ZenTheme {
  id: string;
  name: string;
  category: "classic" | "modern" | "light";
  colors: {
    background: string;
    foreground: string;
    dim: string;
    accent: string;
    cursor: string;
    success: string;
    error: string;
    warning: string;
    border: string;
  };
  glow: {
    enabled: boolean;
    color: string;
    intensity: number;
  };
  font: {
    family: string;
    fallback: string;
  };
  prompt: string;
}

export const ZEN_THEMES: Record<string, ZenTheme> = {
  // ═══════════════════════════════════════════════════════════════
  // CLASSIC CRT THEMES
  // ═══════════════════════════════════════════════════════════════
  "phosphor-green": {
    id: "phosphor-green",
    name: "Phosphor Green",
    category: "classic",
    colors: {
      background: "#0a0a0a",
      foreground: "#00ff00",
      dim: "#008800",
      accent: "#00ff00",
      cursor: "#00ff00",
      success: "#00ff00",
      error: "#ff4444",
      warning: "#ffaa00",
      border: "#004400",
    },
    glow: {
      enabled: true,
      color: "#00ff00",
      intensity: 0.5,
    },
    font: {
      family: "IBM Plex Mono",
      fallback: "monospace",
    },
    prompt: ">",
  },
  amber: {
    id: "amber",
    name: "Amber CRT",
    category: "classic",
    colors: {
      background: "#0a0800",
      foreground: "#ffb000",
      dim: "#996600",
      accent: "#ffcc00",
      cursor: "#ffb000",
      success: "#ffcc00",
      error: "#ff4444",
      warning: "#ff8800",
      border: "#553300",
    },
    glow: {
      enabled: true,
      color: "#ffb000",
      intensity: 0.5,
    },
    font: {
      family: "IBM Plex Mono",
      fallback: "monospace",
    },
    prompt: ">",
  },
  matrix: {
    id: "matrix",
    name: "Matrix",
    category: "classic",
    colors: {
      background: "#000000",
      foreground: "#00ff41",
      dim: "#008f11",
      accent: "#00ff41",
      cursor: "#00ff41",
      success: "#00ff41",
      error: "#ff0000",
      warning: "#ffff00",
      border: "#003b00",
    },
    glow: {
      enabled: true,
      color: "#00ff41",
      intensity: 0.7,
    },
    font: {
      family: "IBM Plex Mono",
      fallback: "monospace",
    },
    prompt: "⟩",
  },

  // ═══════════════════════════════════════════════════════════════
  // MODERN DARK THEMES
  // ═══════════════════════════════════════════════════════════════
  dracula: {
    id: "dracula",
    name: "Dracula",
    category: "modern",
    colors: {
      background: "#282a36",
      foreground: "#f8f8f2",
      dim: "#6272a4",
      accent: "#bd93f9",
      cursor: "#f8f8f2",
      success: "#50fa7b",
      error: "#ff5555",
      warning: "#ffb86c",
      border: "#44475a",
    },
    glow: {
      enabled: true,
      color: "#bd93f9",
      intensity: 0.3,
    },
    font: {
      family: "JetBrains Mono",
      fallback: "monospace",
    },
    prompt: "λ",
  },
  nord: {
    id: "nord",
    name: "Nord",
    category: "modern",
    colors: {
      background: "#2e3440",
      foreground: "#eceff4",
      dim: "#4c566a",
      accent: "#88c0d0",
      cursor: "#d8dee9",
      success: "#a3be8c",
      error: "#bf616a",
      warning: "#ebcb8b",
      border: "#3b4252",
    },
    glow: {
      enabled: true,
      color: "#88c0d0",
      intensity: 0.2,
    },
    font: {
      family: "JetBrains Mono",
      fallback: "monospace",
    },
    prompt: "→",
  },
  gruvbox: {
    id: "gruvbox",
    name: "Gruvbox",
    category: "modern",
    colors: {
      background: "#282828",
      foreground: "#ebdbb2",
      dim: "#928374",
      accent: "#fe8019",
      cursor: "#ebdbb2",
      success: "#b8bb26",
      error: "#fb4934",
      warning: "#fabd2f",
      border: "#3c3836",
    },
    glow: {
      enabled: true,
      color: "#fe8019",
      intensity: 0.3,
    },
    font: {
      family: "JetBrains Mono",
      fallback: "monospace",
    },
    prompt: "λ",
  },
  monokai: {
    id: "monokai",
    name: "Monokai",
    category: "modern",
    colors: {
      background: "#272822",
      foreground: "#f8f8f2",
      dim: "#75715e",
      accent: "#a6e22e",
      cursor: "#f8f8f2",
      success: "#a6e22e",
      error: "#f92672",
      warning: "#e6db74",
      border: "#3e3d32",
    },
    glow: {
      enabled: true,
      color: "#a6e22e",
      intensity: 0.25,
    },
    font: {
      family: "Fira Code",
      fallback: "monospace",
    },
    prompt: "$",
  },
  "one-dark": {
    id: "one-dark",
    name: "One Dark",
    category: "modern",
    colors: {
      background: "#282c34",
      foreground: "#abb2bf",
      dim: "#5c6370",
      accent: "#c678dd",
      cursor: "#abb2bf",
      success: "#98c379",
      error: "#e06c75",
      warning: "#e5c07b",
      border: "#3e4451",
    },
    glow: {
      enabled: true,
      color: "#c678dd",
      intensity: 0.3,
    },
    font: {
      family: "JetBrains Mono",
      fallback: "monospace",
    },
    prompt: "❯",
  },
  "tokyo-night": {
    id: "tokyo-night",
    name: "Tokyo Night",
    category: "modern",
    colors: {
      background: "#1a1b26",
      foreground: "#a9b1d6",
      dim: "#565f89",
      accent: "#7aa2f7",
      cursor: "#a9b1d6",
      success: "#9ece6a",
      error: "#f7768e",
      warning: "#e0af68",
      border: "#292e42",
    },
    glow: {
      enabled: true,
      color: "#7aa2f7",
      intensity: 0.35,
    },
    font: {
      family: "JetBrains Mono",
      fallback: "monospace",
    },
    prompt: "›",
  },
  catppuccin: {
    id: "catppuccin",
    name: "Catppuccin",
    category: "modern",
    colors: {
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      dim: "#6c7086",
      accent: "#cba6f7",
      cursor: "#cdd6f4",
      success: "#a6e3a1",
      error: "#f38ba8",
      warning: "#f9e2af",
      border: "#313244",
    },
    glow: {
      enabled: true,
      color: "#cba6f7",
      intensity: 0.25,
    },
    font: {
      family: "JetBrains Mono",
      fallback: "monospace",
    },
    prompt: "▸",
  },
  "solarized-dark": {
    id: "solarized-dark",
    name: "Solarized Dark",
    category: "modern",
    colors: {
      background: "#002b36",
      foreground: "#839496",
      dim: "#586e75",
      accent: "#268bd2",
      cursor: "#93a1a1",
      success: "#859900",
      error: "#dc322f",
      warning: "#b58900",
      border: "#073642",
    },
    glow: {
      enabled: false,
      color: "#268bd2",
      intensity: 0.2,
    },
    font: {
      family: "Source Code Pro",
      fallback: "monospace",
    },
    prompt: "»",
  },
  cyberpunk: {
    id: "cyberpunk",
    name: "Cyberpunk",
    category: "modern",
    colors: {
      background: "#0d0221",
      foreground: "#00fff9",
      dim: "#7b5ea7",
      accent: "#ff00ff",
      cursor: "#00fff9",
      success: "#00ff00",
      error: "#ff0055",
      warning: "#ffcc00",
      border: "#291e4f",
    },
    glow: {
      enabled: true,
      color: "#ff00ff",
      intensity: 0.6,
    },
    font: {
      family: "JetBrains Mono",
      fallback: "monospace",
    },
    prompt: "▶",
  },

  // ═══════════════════════════════════════════════════════════════
  // LIGHT THEMES
  // ═══════════════════════════════════════════════════════════════
  "solarized-light": {
    id: "solarized-light",
    name: "Solarized Light",
    category: "light",
    colors: {
      background: "#fdf6e3",
      foreground: "#657b83",
      dim: "#93a1a1",
      accent: "#268bd2",
      cursor: "#657b83",
      success: "#859900",
      error: "#dc322f",
      warning: "#b58900",
      border: "#eee8d5",
    },
    glow: {
      enabled: false,
      color: "#268bd2",
      intensity: 0.1,
    },
    font: {
      family: "Source Code Pro",
      fallback: "monospace",
    },
    prompt: "»",
  },
  "github-light": {
    id: "github-light",
    name: "GitHub Light",
    category: "light",
    colors: {
      background: "#ffffff",
      foreground: "#24292f",
      dim: "#57606a",
      accent: "#0969da",
      cursor: "#24292f",
      success: "#1a7f37",
      error: "#cf222e",
      warning: "#9a6700",
      border: "#d0d7de",
    },
    glow: {
      enabled: false,
      color: "#0969da",
      intensity: 0.1,
    },
    font: {
      family: "JetBrains Mono",
      fallback: "monospace",
    },
    prompt: "$",
  },
  "one-light": {
    id: "one-light",
    name: "One Light",
    category: "light",
    colors: {
      background: "#fafafa",
      foreground: "#383a42",
      dim: "#a0a1a7",
      accent: "#a626a4",
      cursor: "#383a42",
      success: "#50a14f",
      error: "#e45649",
      warning: "#c18401",
      border: "#e5e5e6",
    },
    glow: {
      enabled: false,
      color: "#a626a4",
      intensity: 0.1,
    },
    font: {
      family: "JetBrains Mono",
      fallback: "monospace",
    },
    prompt: "❯",
  },
  "catppuccin-latte": {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    category: "light",
    colors: {
      background: "#eff1f5",
      foreground: "#4c4f69",
      dim: "#9ca0b0",
      accent: "#8839ef",
      cursor: "#4c4f69",
      success: "#40a02b",
      error: "#d20f39",
      warning: "#df8e1d",
      border: "#ccd0da",
    },
    glow: {
      enabled: false,
      color: "#8839ef",
      intensity: 0.1,
    },
    font: {
      family: "JetBrains Mono",
      fallback: "monospace",
    },
    prompt: "▸",
  },
};

export const DEFAULT_THEME = "dracula";

interface ZenState {
  enabled: boolean;
  theme: string;
  themeOverrides?: Partial<ZenTheme["colors"]>;
  commandHistory: string[];
  glowEnabled: boolean;
  glowIntensity: number;
  isExiting: boolean;
}

interface ZenContextType {
  // State
  enabled: boolean;
  theme: ZenTheme;           // Base theme (without overrides)
  effectiveTheme: ZenTheme;  // Theme with overrides applied
  themeId: string;
  themeOverrides: Partial<ZenTheme["colors"]>;
  commandHistory: string[];
  glowEnabled: boolean;
  glowIntensity: number;
  mounted: boolean;
  isExiting: boolean;

  // Actions
  enableZenMode: () => void;
  disableZenMode: () => void;
  toggleZenMode: () => void;
  setTheme: (themeId: string) => void;
  setThemeOverride: (key: keyof ZenTheme["colors"], value: string) => void;
  clearThemeOverrides: () => void;
  addToHistory: (command: string) => void;
  clearHistory: () => void;
  setGlowEnabled: (enabled: boolean) => void;
  setGlowIntensity: (intensity: number) => void;
  setExiting: (value: boolean) => void;
}

const ZenContext = createContext<ZenContextType | undefined>(undefined);

const STORAGE_KEY = "csm-pro-zen-state";
const MAX_HISTORY = 100;

function loadState(): Partial<ZenState> {
  if (typeof window === "undefined") return {};
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    // Failed to load zen state silently
  }
  return {};
}

function saveState(state: ZenState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Failed to save zen state silently
  }
}

export function ZenProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [themeId, setThemeId] = useState(DEFAULT_THEME);
  const [themeOverrides, setThemeOverrides] = useState<Partial<ZenTheme["colors"]>>({});
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [glowEnabled, setGlowEnabledState] = useState(true);
  const [glowIntensity, setGlowIntensityState] = useState(0.5);
  const [mounted, setMounted] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    const saved = loadState();
    if (saved.enabled !== undefined) setEnabled(saved.enabled);
    if (saved.theme) setThemeId(saved.theme);
    if (saved.themeOverrides) setThemeOverrides(saved.themeOverrides);
    if (saved.commandHistory) setCommandHistory(saved.commandHistory);
    if (saved.glowEnabled !== undefined) setGlowEnabledState(saved.glowEnabled);
    if (saved.glowIntensity !== undefined) setGlowIntensityState(saved.glowIntensity);
    setMounted(true);
  }, []);

  // Save state whenever it changes (debounced to avoid excessive writes)
  useEffect(() => {
    if (!mounted) return;

    // Debounce localStorage saves by 500ms to avoid excessive writes
    // during rapid changes like glow slider adjustments
    const timer = setTimeout(() => {
      saveState({
        enabled,
        theme: themeId,
        themeOverrides,
        commandHistory,
        glowEnabled,
        glowIntensity,
        isExiting: false, // Never persist exit state
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [enabled, themeId, themeOverrides, commandHistory, glowEnabled, glowIntensity, mounted]);

  const theme = ZEN_THEMES[themeId] || ZEN_THEMES[DEFAULT_THEME];

  // Compute effective theme by merging base theme with overrides
  const effectiveTheme = useMemo((): ZenTheme => {
    if (Object.keys(themeOverrides).length === 0) {
      return theme;
    }
    return {
      ...theme,
      colors: {
        ...theme.colors,
        ...themeOverrides,
      },
    };
  }, [theme, themeOverrides]);

  const enableZenMode = useCallback(() => {
    setIsExiting(false); // Reset exit state when entering
    setEnabled(true);
  }, []);

  const disableZenMode = useCallback(() => {
    setEnabled(false);
  }, []);

  const toggleZenMode = useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);

  const setTheme = useCallback((newThemeId: string) => {
    if (ZEN_THEMES[newThemeId]) {
      setThemeId(newThemeId);
    }
  }, []);

  const setThemeOverride = useCallback((key: keyof ZenTheme["colors"], value: string) => {
    setThemeOverrides((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const clearThemeOverrides = useCallback(() => {
    setThemeOverrides({});
  }, []);

  const addToHistory = useCallback((command: string) => {
    setCommandHistory((prev) => {
      const filtered = prev.filter((c) => c !== command); // Remove duplicates
      const updated = [command, ...filtered].slice(0, MAX_HISTORY);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setCommandHistory([]);
  }, []);

  const setGlowEnabled = useCallback((value: boolean) => {
    setGlowEnabledState(value);
  }, []);

  const setGlowIntensity = useCallback((value: number) => {
    setGlowIntensityState(Math.max(0, Math.min(1, value)));
  }, []);

  const setExiting = useCallback((value: boolean) => {
    setIsExiting(value);
  }, []);

  return (
    <ZenContext.Provider
      value={{
        enabled,
        theme,
        effectiveTheme,
        themeId,
        themeOverrides,
        commandHistory,
        glowEnabled,
        glowIntensity,
        mounted,
        isExiting,
        enableZenMode,
        disableZenMode,
        toggleZenMode,
        setTheme,
        setThemeOverride,
        clearThemeOverrides,
        addToHistory,
        clearHistory,
        setGlowEnabled,
        setGlowIntensity,
        setExiting,
      }}
    >
      {children}
    </ZenContext.Provider>
  );
}

export function useZen() {
  const context = useContext(ZenContext);
  if (context === undefined) {
    throw new Error("useZen must be used within a ZenProvider");
  }
  return context;
}
