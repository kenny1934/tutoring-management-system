"use client";

import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useZen, ZEN_THEMES } from "@/contexts/ZenContext";
import { useZenSession } from "@/contexts/ZenSessionContext";
import { sessionsAPI } from "@/lib/api";
import { mutate } from "swr";
import { setZenStatus } from "./ZenStatusBar";

interface Command {
  name: string;
  aliases?: string[];
  description: string;
  execute: (args: string[]) => void | Promise<void>;
}

// Helper to format date relative to today
const formatDateLabel = (dateStr: string): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${-diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export function ZenCommandBar() {
  const [input, setInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { theme, themeId, commandHistory, addToHistory, disableZenMode, setTheme } = useZen();
  const {
    selectedIds,
    selectAll,
    selectActionable,
    clearSelection,
    getSelectedSessions,
    selectedDate,
    setSelectedDate,
    getDateLabel,
  } = useZenSession();

  // Helper to update session status
  const updateSessionStatus = useCallback(
    async (sessionIds: number[], newStatus: string) => {
      if (sessionIds.length === 0) {
        setZenStatus("No sessions selected", "error");
        return;
      }

      setIsExecuting(true);
      setZenStatus(`Updating ${sessionIds.length} session(s)...`, "info");

      try {
        // Update each session
        const results = await Promise.allSettled(
          sessionIds.map((id) =>
            sessionsAPI.updateSession(id, { session_status: newStatus })
          )
        );

        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected").length;

        // Refresh session data
        mutate((key) => typeof key === "string" && key.includes("/sessions"));

        if (failed === 0) {
          setZenStatus(`${succeeded} session(s) marked as ${newStatus}`, "success");
        } else {
          setZenStatus(
            `${succeeded} succeeded, ${failed} failed`,
            failed > 0 ? "warning" : "success"
          );
        }

        clearSelection();
      } catch (error) {
        setZenStatus(`Error updating sessions: ${error}`, "error");
      } finally {
        setIsExecuting(false);
      }
    },
    [clearSelection]
  );

  // Define available commands - memoized to prevent infinite loops
  const commands: Command[] = useMemo(
    () => [
      // Navigation commands
      {
        name: "go",
        aliases: ["nav", "navigate"],
        description: "Navigate to a page (go dashboard, go students)",
        execute: (args) => {
          const page = args[0]?.toLowerCase();
          const routes: Record<string, string> = {
            dashboard: "/zen",
            home: "/zen",
            students: "/zen/students",
            sessions: "/zen/sessions",
            courseware: "/zen/courseware",
            revenue: "/zen/revenue",
            settings: "/zen/settings",
          };
          if (routes[page]) {
            router.push(routes[page]);
            setZenStatus(`Navigating to ${page}`, "info");
          } else {
            setZenStatus(
              `Unknown page: ${page}. Try: dashboard, students, sessions, courseware, revenue`,
              "error"
            );
          }
        },
      },
      {
        name: "dashboard",
        description: "Go to dashboard",
        execute: () => {
          router.push("/zen");
          setZenStatus("Navigating to dashboard", "info");
        },
      },
      {
        name: "students",
        description: "Go to students",
        execute: () => {
          router.push("/zen/students");
          setZenStatus("Navigating to students", "info");
        },
      },
      {
        name: "sessions",
        description: "Go to sessions",
        execute: () => {
          router.push("/zen/sessions");
          setZenStatus("Navigating to sessions", "info");
        },
      },
      {
        name: "courseware",
        description: "Go to courseware",
        execute: () => {
          router.push("/zen/courseware");
          setZenStatus("Navigating to courseware", "info");
        },
      },
      {
        name: "revenue",
        description: "Go to revenue",
        execute: () => {
          router.push("/zen/revenue");
          setZenStatus("Navigating to revenue", "info");
        },
      },

      // Session action commands
      {
        name: "mark",
        aliases: ["m"],
        description: "Mark selected sessions (mark attended, mark noshow, mark sick, mark weather)",
        execute: async (args) => {
          const action = args[0]?.toLowerCase();
          const ids = Array.from(selectedIds);

          if (ids.length === 0) {
            setZenStatus("No sessions selected. Use j/k to navigate, Space to select.", "error");
            return;
          }

          const statusMap: Record<string, string> = {
            attended: "Attended",
            done: "Attended",
            noshow: "No Show",
            absent: "No Show",
            sick: "Sick Leave - Pending Make-up",
            sickleave: "Sick Leave - Pending Make-up",
            reschedule: "Rescheduled - Pending Make-up",
            rescheduled: "Rescheduled - Pending Make-up",
            weather: "Weather Cancelled - Pending Make-up",
            weathercancelled: "Weather Cancelled - Pending Make-up",
            cancel: "Cancelled",
            cancelled: "Cancelled",
          };

          const newStatus = statusMap[action];
          if (!newStatus) {
            setZenStatus(
              "Usage: mark <attended|noshow|sick|weather|reschedule|cancel>",
              "error"
            );
            return;
          }

          await updateSessionStatus(ids, newStatus);
        },
      },

      // Selection commands
      {
        name: "select",
        aliases: ["sel"],
        description: "Select sessions (select all, select none, select actionable)",
        execute: (args) => {
          const action = args[0]?.toLowerCase();

          switch (action) {
            case "all":
              selectAll();
              setZenStatus("All sessions selected", "info");
              break;
            case "none":
            case "clear":
              clearSelection();
              setZenStatus("Selection cleared", "info");
              break;
            case "actionable":
            case "pending":
              selectActionable();
              setZenStatus("Actionable sessions selected", "info");
              break;
            default:
              setZenStatus("Usage: select <all|none|actionable>", "error");
          }
        },
      },

      // Utility commands
      {
        name: "exit",
        aliases: ["gui", "quit"],
        description: "Exit Zen mode and return to GUI",
        execute: () => {
          disableZenMode();
          router.push("/");
          setZenStatus("Exiting Zen mode...", "info");
        },
      },
      {
        name: "help",
        aliases: ["?", "h"],
        description: "Show available commands",
        execute: (args) => {
          if (args[0]) {
            const cmd = commands.find(
              (c) => c.name === args[0] || c.aliases?.includes(args[0])
            );
            if (cmd) {
              setZenStatus(`${cmd.name}: ${cmd.description}`, "info");
            } else {
              setZenStatus(`Unknown command: ${args[0]}`, "error");
            }
          } else {
            const navCmds = ["go", "dashboard", "students", "sessions"];
            const actionCmds = ["mark", "select"];
            const dateCmds = ["today", "yesterday", "tomorrow", "date"];
            const utilCmds = ["help", "theme", "refresh", "exit"];
            setZenStatus(
              `Nav: ${navCmds.join(", ")} | Actions: ${actionCmds.join(", ")} | Date: ${dateCmds.join(", ")} | Utils: ${utilCmds.join(", ")}`,
              "info"
            );
          }
        },
      },
      {
        name: "clear",
        description: "Clear the command bar",
        execute: () => {
          setInput("");
          setZenStatus("Cleared", "info");
        },
      },
      {
        name: "theme",
        description: "Show current theme or switch (theme list, theme phosphor, theme dracula)",
        execute: (args) => {
          const arg = args[0]?.toLowerCase();

          if (!arg) {
            // Show current theme
            setZenStatus(`Current theme: ${theme.name} (${themeId})`, "info");
            return;
          }

          if (arg === "list") {
            // List all themes
            const themeList = Object.values(ZEN_THEMES)
              .map((t) => `${t.id}${t.id === themeId ? "*" : ""}`)
              .join(", ");
            setZenStatus(`Themes: ${themeList}`, "info");
            return;
          }

          // Try to find matching theme
          const themeKey = Object.keys(ZEN_THEMES).find(
            (k) => k === arg || k.startsWith(arg) || ZEN_THEMES[k].name.toLowerCase().includes(arg)
          );

          if (themeKey) {
            setTheme(themeKey);
            setZenStatus(`Theme changed to ${ZEN_THEMES[themeKey].name}`, "success");
          } else {
            setZenStatus(`Unknown theme: ${arg}. Try: theme list`, "error");
          }
        },
      },
      {
        name: "refresh",
        aliases: ["reload"],
        description: "Refresh session data",
        execute: () => {
          mutate((key) => typeof key === "string" && key.includes("/sessions"));
          setZenStatus("Refreshing data...", "info");
        },
      },

      // Date navigation commands
      {
        name: "today",
        description: "Show today's sessions",
        execute: () => {
          const today = new Date().toISOString().split("T")[0];
          setSelectedDate(today);
          setZenStatus("Showing today's sessions", "success");
        },
      },
      {
        name: "yesterday",
        aliases: ["yday"],
        description: "Show yesterday's sessions",
        execute: () => {
          const date = new Date();
          date.setDate(date.getDate() - 1);
          setSelectedDate(date.toISOString().split("T")[0]);
          setZenStatus("Showing yesterday's sessions", "success");
        },
      },
      {
        name: "tomorrow",
        aliases: ["tmrw"],
        description: "Show tomorrow's sessions",
        execute: () => {
          const date = new Date();
          date.setDate(date.getDate() + 1);
          setSelectedDate(date.toISOString().split("T")[0]);
          setZenStatus("Showing tomorrow's sessions", "success");
        },
      },
      {
        name: "date",
        aliases: ["goto"],
        description: "Go to specific date (date 2024-01-15) or show current",
        execute: (args) => {
          if (!args[0]) {
            setZenStatus(`Current date: ${selectedDate} (${getDateLabel()})`, "info");
            return;
          }

          // Parse the date argument
          const input = args[0];
          let targetDate: Date | null = null;

          // Try direct ISO format (YYYY-MM-DD)
          if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            targetDate = new Date(input + "T00:00:00");
          }
          // Try relative days (+N or -N)
          else if (/^[+-]\d+$/.test(input)) {
            const days = parseInt(input, 10);
            targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + days);
          }
          // Try "week" for this week's start (Monday)
          else if (input === "week" || input === "week-start") {
            targetDate = new Date();
            const day = targetDate.getDay();
            const diff = day === 0 ? -6 : 1 - day; // Monday
            targetDate.setDate(targetDate.getDate() + diff);
          }

          if (targetDate && !isNaN(targetDate.getTime())) {
            const isoDate = targetDate.toISOString().split("T")[0];
            setSelectedDate(isoDate);
            const label = formatDateLabel(isoDate);
            setZenStatus(`Showing sessions for ${label} (${isoDate})`, "success");
          } else {
            setZenStatus("Usage: date YYYY-MM-DD or date +N/-N (days offset)", "error");
          }
        },
      },
      {
        name: "assign",
        description: "Assign CW/HW to selected sessions (coming soon)",
        execute: (args) => {
          const type = args[0]?.toLowerCase();
          if (type === "cw" || type === "hw") {
            setZenStatus(
              `Exercise assignment coming soon. Use GUI for now: assign ${type.toUpperCase()}`,
              "info"
            );
          } else {
            setZenStatus("Usage: assign <cw|hw>", "error");
          }
        },
      },
    ],
    [
      router,
      disableZenMode,
      theme.name,
      themeId,
      setTheme,
      selectedIds,
      selectAll,
      selectActionable,
      clearSelection,
      updateSessionStatus,
      setSelectedDate,
      selectedDate,
      getDateLabel,
    ]
  );

  // Get all command names and aliases for autocomplete - memoized
  const allCommandNames = useMemo(
    () => commands.flatMap((c) => [c.name, ...(c.aliases || [])]),
    [commands]
  );

  // Common command suggestions for better autocomplete
  const commonSuggestions = useMemo(
    () => [
      "mark attended",
      "mark noshow",
      "mark sick",
      "mark weather",
      "mark reschedule",
      "select all",
      "select none",
      "select actionable",
      "today",
      "yesterday",
      "tomorrow",
      "date +1",
      "date -1",
      "go dashboard",
      "go students",
      "go sessions",
      "theme list",
      "theme phosphor",
      "theme dracula",
    ],
    []
  );

  // Update suggestions based on input
  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }

    const inputLower = input.toLowerCase();
    const matches = [
      // Full command suggestions (e.g., "mark attended")
      ...commonSuggestions.filter((s) => s.startsWith(inputLower)),
      // Command matches
      ...allCommandNames.filter((name) => name.startsWith(inputLower)),
      // History matches
      ...commandHistory.filter(
        (cmd) => cmd.toLowerCase().startsWith(inputLower) && cmd !== input
      ),
    ].slice(0, 6);

    setSuggestions([...new Set(matches)]);
    setSelectedSuggestion(-1);
  }, [input, commandHistory, allCommandNames, commonSuggestions]);

  const executeCommand = useCallback(
    async (commandString: string) => {
      const trimmed = commandString.trim();
      if (!trimmed || isExecuting) return;

      addToHistory(trimmed);

      const parts = trimmed.split(/\s+/);
      const cmdName = parts[0].toLowerCase();
      const args = parts.slice(1);

      const command = commands.find(
        (c) => c.name === cmdName || c.aliases?.includes(cmdName)
      );

      if (command) {
        await command.execute(args);
      } else {
        // Try to find a close match
        const similar = allCommandNames.find(
          (name) =>
            name.startsWith(cmdName.slice(0, 2)) ||
            cmdName.startsWith(name.slice(0, 2))
        );
        if (similar) {
          setZenStatus(
            `Unknown command '${cmdName}'. Did you mean '${similar}'?`,
            "error"
          );
        } else {
          setZenStatus(
            `Unknown command: ${cmdName}. Type 'help' for available commands.`,
            "error"
          );
        }
      }

      setInput("");
      setHistoryIndex(-1);
    },
    [addToHistory, commands, allCommandNames, isExecuting]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        if (selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
          setInput(suggestions[selectedSuggestion]);
          setSuggestions([]);
          setSelectedSuggestion(-1);
        } else {
          executeCommand(input);
        }
        break;

      case "Tab":
        e.preventDefault();
        if (suggestions.length > 0) {
          const nextIndex =
            selectedSuggestion < 0 ? 0 : (selectedSuggestion + 1) % suggestions.length;
          setSelectedSuggestion(nextIndex);
          setInput(suggestions[nextIndex]);
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        if (suggestions.length > 0 && selectedSuggestion > 0) {
          setSelectedSuggestion(selectedSuggestion - 1);
          setInput(suggestions[selectedSuggestion - 1]);
        } else if (commandHistory.length > 0) {
          const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
          setSuggestions([]);
        }
        break;

      case "ArrowDown":
        e.preventDefault();
        if (suggestions.length > 0 && selectedSuggestion < suggestions.length - 1) {
          setSelectedSuggestion(selectedSuggestion + 1);
          setInput(suggestions[selectedSuggestion + 1]);
        } else if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setInput("");
        }
        break;

      case "Escape":
        e.preventDefault();
        setInput("");
        setSuggestions([]);
        setHistoryIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Global keyboard shortcut to focus command bar
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      // Focus on "/" key (but not when already focused on input)
      if (
        e.key === "/" &&
        document.activeElement !== inputRef.current &&
        !["INPUT", "TEXTAREA"].includes(
          (document.activeElement as HTMLElement)?.tagName
        )
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  return (
    <div
      className="zen-command-bar"
      style={{
        position: "relative",
        padding: "8px 16px",
        borderTop: "1px solid var(--zen-border)",
        backgroundColor: "var(--zen-bg)",
      }}
    >
      {/* Suggestions dropdown */}
      {suggestions.length > 0 && isFocused && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "16px",
            right: "16px",
            backgroundColor: "var(--zen-bg)",
            border: "1px solid var(--zen-border)",
            borderBottom: "none",
            maxHeight: "180px",
            overflow: "auto",
          }}
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              style={{
                padding: "4px 8px",
                cursor: "pointer",
                backgroundColor:
                  index === selectedSuggestion
                    ? "var(--zen-accent)"
                    : "transparent",
                color:
                  index === selectedSuggestion ? "var(--zen-bg)" : "var(--zen-fg)",
              }}
              onClick={() => {
                setInput(suggestion);
                setSuggestions([]);
                inputRef.current?.focus();
              }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}

      {/* Input line */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            color: "var(--zen-accent)",
            textShadow: "var(--zen-glow)",
          }}
        >
          {theme.prompt}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          placeholder={
            isExecuting
              ? "Processing..."
              : selectedIds.size > 0
              ? `${selectedIds.size} selected — type 'mark attended' to update`
              : "Type a command or press / to focus"
          }
          disabled={isExecuting}
          style={{
            flex: 1,
            backgroundColor: "transparent",
            border: "none",
            outline: "none",
            color: "var(--zen-fg)",
            fontFamily: "inherit",
            fontSize: "inherit",
            caretColor: "var(--zen-cursor)",
            opacity: isExecuting ? 0.6 : 1,
          }}
          autoComplete="off"
          spellCheck={false}
        />
        <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
          {selectedIds.size > 0 ? (
            <span style={{ color: "var(--zen-warning)" }}>
              {selectedIds.size} selected
            </span>
          ) : (
            <>/ focus • ↑↓ history • Tab complete</>
          )}
        </span>
      </div>
    </div>
  );
}
