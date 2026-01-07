"use client";

import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useZen, ZEN_THEMES } from "@/contexts/ZenContext";
import { useZenSession } from "@/contexts/ZenSessionContext";
import { sessionsAPI } from "@/lib/api";
import { mutate } from "swr";
import { setZenStatus } from "./ZenStatusBar";
import { usefulTools } from "@/config/useful-tools";
import { useDailyPuzzle } from "@/lib/useDailyPuzzle";

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
  const [showTools, setShowTools] = useState(false);
  const [showPuzzle, setShowPuzzle] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const {
    question: puzzleQuestion,
    isLoading: puzzleLoading,
    userAnswer: puzzleAnswer,
    isCorrect: puzzleCorrect,
    submitAnswer: submitPuzzleAnswer,
  } = useDailyPuzzle();
  const { theme, themeId, commandHistory, addToHistory, disableZenMode, setTheme, setExiting } = useZen();
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
          setExiting(true); // Prevent ACCESS DENIED flash during exit
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
            const actionCmds = ["mark", "select", "assign"];
            const dateCmds = ["today", "yesterday", "tomorrow", "date", "calendar"];
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
        description: "Show current theme or switch (theme list, theme <name>)",
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
        description: "Assign CW/HW to selected sessions",
        execute: (args) => {
          const type = args[0]?.toLowerCase();
          const ids = Array.from(selectedIds);

          if (ids.length === 0) {
            setZenStatus(
              "No sessions selected. Select sessions first with Space, then use: assign cw/hw",
              "error"
            );
            return;
          }

          if (type === "cw" || type === "hw") {
            const selectedSessions = getSelectedSessions();
            if (selectedSessions.length === 1) {
              // Single session - can use the inline detail expansion (press Enter)
              setZenStatus(
                `For 1 session, press Enter on it to expand, then 'c' for CW or 'h' for HW`,
                "info"
              );
            } else {
              setZenStatus(
                `Bulk ${type.toUpperCase()} assignment: select sessions individually and use inline 'c'/'h' keys`,
                "info"
              );
            }
          } else {
            setZenStatus("Usage: assign <cw|hw> (select sessions first with Space)", "error");
          }
        },
      },
      {
        name: "calendar",
        aliases: ["cal"],
        description: "Open calendar popup (or use Shift+C)",
        execute: () => {
          setZenStatus("Press Shift+C to toggle the calendar popup", "info");
        },
      },
      {
        name: "tools",
        aliases: ["links", "resources"],
        description: "Open useful tools menu",
        execute: () => {
          setShowTools(true);
        },
      },
      {
        name: "puzzle",
        aliases: ["quiz", "trivia"],
        description: "Show daily puzzle",
        execute: () => {
          setShowPuzzle(true);
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
      "mark cancel",
      "select all",
      "select none",
      "select actionable",
      "assign cw",
      "assign hw",
      "calendar",
      "today",
      "yesterday",
      "tomorrow",
      "date +1",
      "date -1",
      "go dashboard",
      "go students",
      "go sessions",
      "tools",
      "puzzle",
      "theme list",
      "theme phosphor",
      "theme dracula",
      "theme amber",
      "theme nord",
      "theme monokai",
      "theme solarized",
      "theme cyberpunk",
      "theme matrix",
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

  // Global keyboard shortcut to focus command bar and handle modals
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      // Handle puzzle modal keyboard navigation
      if (showPuzzle) {
        if (e.key === "Escape") {
          e.preventDefault();
          setShowPuzzle(false);
          return;
        }
        // Number keys 1-4 to select puzzle answer (if not already answered)
        if (/^[1-4]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && puzzleQuestion && puzzleAnswer === null) {
          e.preventDefault();
          const index = parseInt(e.key) - 1;
          if (index < puzzleQuestion.allAnswers.length) {
            submitPuzzleAnswer(puzzleQuestion.allAnswers[index]);
          }
          return;
        }
      }

      // Handle tools modal keyboard navigation
      if (showTools) {
        if (e.key === "Escape") {
          e.preventDefault();
          setShowTools(false);
          return;
        }
        // Number keys 1-9 and 0 (for 10th item) to open tools
        if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const index = e.key === "0" ? 9 : parseInt(e.key) - 1;
          if (index < usefulTools.length) {
            window.open(usefulTools[index].url, "_blank");
            setShowTools(false);
            setZenStatus(`Opened: ${usefulTools[index].name}`, "success");
          }
          return;
        }
      }

      // Skip if typing in input
      if (
        document.activeElement === inputRef.current ||
        ["INPUT", "TEXTAREA"].includes(
          (document.activeElement as HTMLElement)?.tagName
        )
      ) {
        // Only handle "/" to focus
        if (e.key === "/") {
          e.preventDefault();
          inputRef.current?.focus();
        }
        return;
      }

      // Focus on "/" key
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }

      // "T" key to toggle tools
      if (e.key === "T" && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowPuzzle(false);
        setShowTools((prev) => !prev);
      }

      // "P" key to toggle puzzle
      if (e.key === "P" && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowTools(false);
        setShowPuzzle((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [showTools, showPuzzle, puzzleQuestion, puzzleAnswer, submitPuzzleAnswer]);

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
      {/* Tools Modal */}
      {showTools && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "16px",
            marginBottom: "8px",
            backgroundColor: "var(--zen-bg)",
            border: "1px solid var(--zen-border)",
            minWidth: "320px",
            maxWidth: "400px",
            zIndex: 200,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid var(--zen-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: "bold", color: "var(--zen-fg)" }}>
              USEFUL TOOLS
            </span>
            <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
              1-9/0 to open • Esc to close
            </span>
          </div>

          {/* Tools list */}
          <div style={{ maxHeight: "300px", overflowY: "auto" }}>
            {usefulTools.slice(0, 10).map((tool, idx) => (
              <button
                key={idx}
                onClick={() => {
                  window.open(tool.url, "_blank");
                  setShowTools(false);
                  setZenStatus(`Opened: ${tool.name}`, "success");
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid var(--zen-border)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--zen-border)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span style={{ color: "var(--zen-accent)", minWidth: "20px" }}>
                  [{idx === 9 ? "0" : idx + 1}]
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--zen-fg)" }}>{tool.name}</div>
                  {tool.description && (
                    <div
                      style={{
                        color: "var(--zen-dim)",
                        fontSize: "11px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tool.description}
                    </div>
                  )}
                </div>
                <span style={{ color: "var(--zen-dim)" }}>↗</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Puzzle Modal */}
      {showPuzzle && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "16px",
            marginBottom: "8px",
            backgroundColor: "var(--zen-bg)",
            border: "1px solid var(--zen-border)",
            minWidth: "350px",
            maxWidth: "500px",
            zIndex: 200,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid var(--zen-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: "bold", color: "var(--zen-accent)" }}>
              DAILY PUZZLE
            </span>
            <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
              {puzzleAnswer === null ? "1-4 to answer • Esc to close" : "Esc to close"}
            </span>
          </div>

          {/* Content */}
          <div style={{ padding: "12px" }}>
            {puzzleLoading ? (
              <div style={{ color: "var(--zen-dim)" }}>Loading puzzle...</div>
            ) : puzzleQuestion ? (
              <>
                {/* Question */}
                <p
                  style={{
                    color: "var(--zen-fg)",
                    marginBottom: "12px",
                    lineHeight: "1.4",
                  }}
                >
                  {puzzleQuestion.question}
                </p>

                {/* Answer choices */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {puzzleQuestion.allAnswers.map((answer, idx) => {
                    const isSelected = puzzleAnswer === answer;
                    const isCorrectAnswer = answer === puzzleQuestion.correctAnswer;
                    const showAsCorrect = puzzleAnswer !== null && isCorrectAnswer;
                    const showAsIncorrect = isSelected && !puzzleCorrect;

                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          if (puzzleAnswer === null) {
                            submitPuzzleAnswer(answer);
                          }
                        }}
                        disabled={puzzleAnswer !== null}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 10px",
                          background: showAsCorrect
                            ? "var(--zen-success)"
                            : showAsIncorrect
                            ? "var(--zen-error)"
                            : "transparent",
                          border: "1px solid var(--zen-border)",
                          cursor: puzzleAnswer === null ? "pointer" : "default",
                          fontFamily: "inherit",
                          textAlign: "left",
                          color: showAsCorrect || showAsIncorrect
                            ? "var(--zen-bg)"
                            : "var(--zen-fg)",
                          opacity: puzzleAnswer !== null && !showAsCorrect && !showAsIncorrect ? 0.5 : 1,
                        }}
                      >
                        <span style={{
                          color: showAsCorrect || showAsIncorrect ? "var(--zen-bg)" : "var(--zen-accent)",
                          minWidth: "24px"
                        }}>
                          [{idx + 1}]
                        </span>
                        <span style={{ flex: 1 }}>{answer}</span>
                        {showAsCorrect && <span>✓</span>}
                        {showAsIncorrect && <span>✗</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Result message */}
                {puzzleAnswer !== null && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "8px",
                      textAlign: "center",
                      color: puzzleCorrect ? "var(--zen-success)" : "var(--zen-error)",
                      borderTop: "1px solid var(--zen-border)",
                    }}
                  >
                    {puzzleCorrect ? "Correct! Well done." : "Incorrect. Try again tomorrow!"}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "var(--zen-dim)" }}>No puzzle available today.</div>
            )}
          </div>
        </div>
      )}

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
