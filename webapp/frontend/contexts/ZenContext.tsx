"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

// Theme definitions
export interface ZenTheme {
  id: string;
  name: string;
  category: "classic" | "modern";
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
};

export const DEFAULT_THEME = "dracula";

interface ZenState {
  enabled: boolean;
  theme: string;
  themeOverrides?: Partial<ZenTheme["colors"]>;
  commandHistory: string[];
  glowEnabled: boolean;
  glowIntensity: number;
}

interface ZenContextType {
  // State
  enabled: boolean;
  theme: ZenTheme;
  themeId: string;
  commandHistory: string[];
  glowEnabled: boolean;
  glowIntensity: number;
  mounted: boolean;

  // Actions
  enableZenMode: () => void;
  disableZenMode: () => void;
  toggleZenMode: () => void;
  setTheme: (themeId: string) => void;
  addToHistory: (command: string) => void;
  clearHistory: () => void;
  setGlowEnabled: (enabled: boolean) => void;
  setGlowIntensity: (intensity: number) => void;
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
    console.error("Failed to load zen state:", e);
  }
  return {};
}

function saveState(state: ZenState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save zen state:", e);
  }
}

export function ZenProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [themeId, setThemeId] = useState(DEFAULT_THEME);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [glowEnabled, setGlowEnabledState] = useState(true);
  const [glowIntensity, setGlowIntensityState] = useState(0.5);
  const [mounted, setMounted] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    const saved = loadState();
    if (saved.enabled !== undefined) setEnabled(saved.enabled);
    if (saved.theme) setThemeId(saved.theme);
    if (saved.commandHistory) setCommandHistory(saved.commandHistory);
    if (saved.glowEnabled !== undefined) setGlowEnabledState(saved.glowEnabled);
    if (saved.glowIntensity !== undefined) setGlowIntensityState(saved.glowIntensity);
    setMounted(true);
  }, []);

  // Save state whenever it changes
  useEffect(() => {
    if (!mounted) return;
    saveState({
      enabled,
      theme: themeId,
      commandHistory,
      glowEnabled,
      glowIntensity,
    });
  }, [enabled, themeId, commandHistory, glowEnabled, glowIntensity, mounted]);

  const theme = ZEN_THEMES[themeId] || ZEN_THEMES[DEFAULT_THEME];

  const enableZenMode = useCallback(() => {
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

  return (
    <ZenContext.Provider
      value={{
        enabled,
        theme,
        themeId,
        commandHistory,
        glowEnabled,
        glowIntensity,
        mounted,
        enableZenMode,
        disableZenMode,
        toggleZenMode,
        setTheme,
        addToHistory,
        clearHistory,
        setGlowEnabled,
        setGlowIntensity,
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
